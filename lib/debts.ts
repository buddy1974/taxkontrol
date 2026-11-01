import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { isPastDue, parseCalendarDate, toBerlinIsoDate } from '@/lib/time/berlin'
import { withIdempotency } from '@/lib/idempotency'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { recordAudit } from '@/lib/audit'
import { jsonError, notFound, optionalString, parseAmount, readJsonObject, unauthorized } from '@/lib/http'
import type { Prisma } from '@prisma/client'
import { lockFor } from '@/lib/locks'
import { createTransaction, getTaxType, parseTransactionInput } from '@/lib/transactions/service'
import { TransactionValidationError } from '@/lib/finance/transactionAmounts'

class DebtError extends Error {}

/**
 * Shared logic for open customer invoices (receivables) and supplier bills
 * (payables). Partial payments are tracked as a cumulative paid amount that
 * can never exceed the total. "Overdue" is derived from the due date when
 * reading — it is never stored, so it cannot go stale.
 */
type Kind = 'receivable' | 'payable'
type Status = 'OPEN' | 'PARTIAL' | 'PAID'

interface Row {
  id: string
  totalAmount: { toString(): string }
  paidAmount: { toString(): string }
  outstandingAmount: { toString(): string }
  dueDate: Date | null
  status: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export function debtStatus(totalCents: number, paidCents: number): Status {
  if (paidCents >= totalCents) return 'PAID'
  return paidCents > 0 ? 'PARTIAL' : 'OPEN'
}

function present(r: Row & Record<string, unknown>, now = new Date()) {
  const outstanding = toCents(r.outstandingAmount)
  return {
    ...r,
    ...('vatRate' in r ? { vatRate: r.vatRate === null || r.vatRate === undefined ? null : Number(String(r.vatRate)) } : {}),
    totalAmount: fromCents(toCents(r.totalAmount)),
    paidAmount: fromCents(toCents(r.paidAmount)),
    outstandingAmount: fromCents(outstanding),
    isOverdue: outstanding > 0 && isPastDue(r.dueDate, now),
  }
}

const nameField = (kind: Kind) => (kind === 'receivable' ? 'customerName' : 'supplierName')

// Prisma delegates for the two models have the same shape for what we use.
function delegate(kind: Kind, client: Prisma.TransactionClient | typeof db = db) {
  return (kind === 'receivable' ? client.receivable : client.payable) as unknown as {
    findMany(args: unknown): Promise<Array<Row & Record<string, unknown>>>
    findFirst(args: unknown): Promise<(Row & Record<string, unknown>) | null>
    create(args: unknown): Promise<Row & Record<string, unknown>>
    update(args: unknown): Promise<Row & Record<string, unknown>>
    delete(args: unknown): Promise<unknown>
  }
}

export function debtRoutes(kind: Kind) {
  const label = kind === 'receivable' ? 'customer' : 'supplier'

  async function GET(req?: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    // Customer invoices: income bookings that could be the payment (to link instead of booking twice).
    if (kind === 'receivable' && req && new URL(req.url).searchParams.get('paymentCandidates') === '1') {
      const since = new Date(Date.now() - 548 * 86400000)
      const candidates = await db.transaction.findMany({
        where: { userId: user.id, type: 'INCOME', receivableId: null, taxPaymentType: null, transactionDate: { gte: since } },
        orderBy: { transactionDate: 'desc' },
        take: 50,
        select: { id: true, grossAmount: true, transactionDate: true, merchant: true, description: true },
      })
      return NextResponse.json(
        candidates.map(c => ({ id: c.id, amount: fromCents(toCents(c.grossAmount)), date: toBerlinIsoDate(c.transactionDate), merchant: c.merchant, description: c.description }))
      )
    }
    const rows = await delegate(kind).findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json(rows.map(r => present(r)))
  }

  async function POST(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const body = await readJsonObject(req)
    const name = optionalString(body?.[nameField(kind)], 160)
    const total = parseAmount(body?.totalAmount)
    if (!name) return jsonError(400, `Please enter the ${label} name.`, { field: nameField(kind) })
    if (total === undefined || total <= 0) return jsonError(400, 'Please enter an amount greater than 0.', { field: 'totalAmount' })
    let dueDate: Date | null = null
    if (body?.dueDate) {
      dueDate = parseCalendarDate(body.dueDate)
      if (!dueDate) return jsonError(400, 'Please enter a valid due date.', { field: 'dueDate' })
    }
    // Customer invoices: date and VAT rate decide the VAT period under Soll-Versteuerung.
    let invoiceFields: Record<string, unknown> = {}
    if (kind === 'receivable') {
      let invoiceDate: Date | null = null
      if (body?.invoiceDate) {
        invoiceDate = parseCalendarDate(body.invoiceDate)
        if (!invoiceDate || invoiceDate.getUTCFullYear() < 2000 || invoiceDate.getTime() > Date.now() + 366 * 86400000) {
          return jsonError(400, 'Please enter a valid invoice date.', { field: 'invoiceDate' })
        }
      }
      const rawRate = body?.vatRate
      const vatRate = rawRate === undefined || rawRate === null || rawRate === '' ? null : Number(rawRate)
      if (vatRate !== null && ![0, 7, 19].includes(vatRate)) return jsonError(400, 'VAT rate must be 0, 7 or 19 %.', { field: 'vatRate' })
      invoiceFields = { invoiceDate: invoiceDate ?? new Date(), vatRate: vatRate === null ? null : String(vatRate) }
    }
    const totalCents = toCents(total)
    const row = await delegate(kind).create({
      data: {
        userId: user.id,
        [nameField(kind)]: name,
        description: optionalString(body?.description, 500) ?? null,
        totalAmount: centsToDecimalString(totalCents),
        paidAmount: '0',
        outstandingAmount: centsToDecimalString(totalCents),
        dueDate,
        status: 'OPEN',
        ...invoiceFields,
      },
    })
    return NextResponse.json(present(row), { status: 201 })
  }

  /**
   * Body: { id, addPayment } (one more partial payment) or { id, paidAmount } (total paid so far;
   * it can only grow — recorded payments are never reduced here).
   * A payment increase is ALSO booked as a transaction (customer payment = business income,
   * supplier payment = business expense) unless the user says it is already recorded
   * (`alreadyBooked: true`). Optional `vatRate` (0/7/19; default: the invoice's rate); without
   * one, VAT-registered users get the booking flagged for review. Optional `paymentDate`
   * (YYYY-MM-DD, not in the future; default today) — the VAT period follows the payment date.
   * Serialised per invoice; with an `Idempotency-Key` header a retry or double submit returns
   * the first result instead of booking the payment twice. A customer payment is linked to its
   * invoice so that under Soll-Versteuerung its VAT (already due with the invoice) is not
   * counted a second time.
   */
  async function PATCH(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const body = await readJsonObject(req)
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id || !body) return jsonError(400, 'id is required.')

    // Customer invoice details only (date / VAT rate), e.g. to confirm an invoice entered
    // before these fields existed. Changes the VAT period under Soll, so it is audited.
    if (kind === 'receivable' && body.addPayment === undefined && body.paidAmount === undefined && (body.invoiceDate !== undefined || body.vatRate !== undefined)) {
      const invoiceDate = parseCalendarDate(body.invoiceDate)
      if (!invoiceDate || invoiceDate.getUTCFullYear() < 2000 || invoiceDate.getTime() > Date.now() + 366 * 86400000) {
        return jsonError(400, 'Please enter a valid invoice date.', { field: 'invoiceDate' })
      }
      const rate = body.vatRate === null || body.vatRate === '' || body.vatRate === undefined ? null : Number(body.vatRate)
      if (rate !== null && ![0, 7, 19].includes(rate)) return jsonError(400, 'VAT rate must be 0, 7 or 19 %.', { field: 'vatRate' })
      const existing = await delegate(kind).findFirst({ where: { id, userId: user.id } })
      if (!existing) return notFound()
      const updated = await db.$transaction(async tx => {
        const u = await delegate(kind, tx).update({ where: { id: existing.id }, data: { invoiceDate, vatRate: rate === null ? null : String(rate) } })
        await recordAudit(
          {
            userId: user.id,
            entityType: 'RECEIVABLE',
            entityId: existing.id,
            action: 'UPDATE',
            before: { invoiceDate: (existing.invoiceDate as Date | null)?.toISOString() ?? null, vatRate: existing.vatRate === null ? null : String(existing.vatRate) },
            after: { invoiceDate: invoiceDate.toISOString(), vatRate: rate },
          },
          tx
        )
        return u
      })
      return NextResponse.json(present(updated))
    }

    const add = body.addPayment !== undefined ? parseAmount(body.addPayment) : undefined
    if (body.addPayment !== undefined && (add === undefined || add <= 0)) {
      return jsonError(400, 'Please enter a payment greater than 0.', { field: 'addPayment' })
    }
    const absolute = body.addPayment === undefined ? parseAmount(body.paidAmount) : undefined
    if (body.addPayment === undefined && absolute === undefined) {
      return jsonError(400, 'Please enter the amount paid so far (0 or more).', { field: 'paidAmount' })
    }
    const requestedVat = body.vatRate === undefined || body.vatRate === null || body.vatRate === '' ? undefined : Number(body.vatRate)
    if (requestedVat !== undefined && ![0, 7, 19].includes(requestedVat)) return jsonError(400, 'VAT rate must be 0, 7 or 19 %.', { field: 'vatRate' })
    let paymentDate = new Date()
    if (body.paymentDate !== undefined && body.paymentDate !== null && body.paymentDate !== '') {
      const d = parseCalendarDate(body.paymentDate)
      if (!d || d.getUTCFullYear() < 2000 || d.getTime() > Date.now()) return jsonError(400, 'Please enter the payment date (not in the future).', { field: 'paymentDate' })
      paymentDate = d
    }
    const book = body.alreadyBooked !== true
    const linkTransactionId = kind === 'receivable' && typeof body.linkTransactionId === 'string' ? body.linkTransactionId : null

    try {
      return await withIdempotency(req, user.id, `${kind}-payment:${id}`, async tx => {
        await lockFor(tx, `debt:${id}`)
        const existing = await delegate(kind, tx).findFirst({ where: { id, userId: user.id } })
        if (!existing) return { status: 404, body: { error: 'Not found' } }
        const invoiceVat = existing.vatRate === null || existing.vatRate === undefined ? undefined : Number(String(existing.vatRate))
        const vatRate = requestedVat ?? invoiceVat
        const totalCents = toCents(existing.totalAmount)
        const previousCents = toCents(existing.paidAmount)
        const paidCents = add !== undefined ? previousCents + toCents(add) : toCents(absolute!)
        if (paidCents > totalCents) throw new DebtError(`Paid amount cannot be more than the total (${fromCents(totalCents).toFixed(2)} €).`)
        // Lowering the paid total would leave the already booked payment in the books and let
        // the next payment be booked a second time. Corrections go through Transactions.
        if (paidCents < previousCents) {
          throw new DebtError(
            `Already recorded payments (${fromCents(previousCents).toFixed(2)} €) cannot be reduced here. Delete the wrong payment under Transactions and remove or re-create this invoice.`
          )
        }

        const updated = await delegate(kind, tx).update({
          where: { id: existing.id },
          data: {
            paidAmount: centsToDecimalString(paidCents),
            outstandingAmount: centsToDecimalString(totalCents - paidCents),
            status: debtStatus(totalCents, paidCents),
          },
        })

        let transactionId: string | null = null
        const incrementCents = paidCents - previousCents
        if (kind === 'receivable' && !book && incrementCents > 0) {
          // Already booked (e.g. bank import). Under Sollversteuerung the VAT was due with the
          // invoice, so the booking MUST be linked to it — otherwise its VAT is counted again
          // (or moved to the payment period). Ist / Kleinunternehmer: linking is optional.
          const invoiceDate = (existing.invoiceDate as Date | null) ?? existing.createdAt
          const st = (await loadTaxStatusTimeline(user.id, tx)).statusAt(invoiceDate)
          if (linkTransactionId) {
            const booking = await tx.transaction.findFirst({
              where: { id: linkTransactionId, userId: user.id, type: 'INCOME', receivableId: null, taxPaymentType: null },
            })
            if (!booking) throw new DebtError('The booking to link was not found (or is already linked).')
            if (toCents(booking.grossAmount) !== incrementCents) {
              throw new DebtError(`The booking is ${fromCents(toCents(booking.grossAmount)).toFixed(2)} €; enter that amount as the payment.`)
            }
            await tx.transaction.update({ where: { id: booking.id }, data: { receivableId: existing.id } })
            await recordAudit({ userId: user.id, entityType: 'TRANSACTION', entityId: booking.id, action: 'UPDATE', after: { receivableId: existing.id } }, tx)
            transactionId = booking.id
          } else if (st.taxType !== 'KLEINUNTERNEHMER' && st.vatMethod === 'SOLL') {
            throw new DebtError('Choose the booking of this payment, so its VAT (already due with the invoice) is not counted twice.')
          }
        }
        if (book && incrementCents > 0) {
          const name = String(existing[nameField(kind)] ?? '')
          // Customer payments are taxed with the status valid on the invoice date (§20 S. 3 UStG).
          const invoiceDate = kind === 'receivable' ? ((existing.invoiceDate as Date | null) ?? existing.createdAt) : null
          const taxType = await getTaxType(user.id, tx, invoiceDate ?? paymentDate)
          const input = parseTransactionInput({
            type: kind === 'receivable' ? 'INCOME' : 'EXPENSE',
            grossAmount: fromCents(incrementCents),
            vatRate: taxType === 'KLEINUNTERNEHMER' ? 0 : vatRate ?? 0,
            usage: 'BUSINESS',
            transactionDate: toBerlinIsoDate(paymentDate),
            merchant: name,
            description: kind === 'receivable' ? `Zahlung von ${name}` : `Zahlung an ${name}`,
            paymentMethod: 'BANK',
          })
          const vatUnknown = taxType !== 'KLEINUNTERNEHMER' && vatRate === undefined
          const t = await createTransaction(
            user.id,
            input,
            { source: 'USER', forceReview: vatUnknown, receivableId: kind === 'receivable' ? existing.id : null, statusDate: invoiceDate ?? undefined },
            tx
          )
          transactionId = t.id
        }
        return { status: 200, body: { ...present(updated), bookedTransactionId: transactionId } }
      }, body)
    } catch (err) {
      if (err instanceof DebtError) return jsonError(400, err.message, { field: 'paidAmount' })
      if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field })
      throw err
    }
  }

  async function DELETE(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return jsonError(400, 'id is required.')
    const existing = await delegate(kind).findFirst({ where: { id, userId: user.id } })
    if (!existing) return notFound()
    await delegate(kind).delete({ where: { id: existing.id } })
    return NextResponse.json({ success: true })
  }

  return { GET, POST, PATCH, DELETE }
}
