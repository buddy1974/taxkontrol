import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { isPastDue, parseCalendarDate, toBerlinIsoDate } from '@/lib/time/berlin'
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

  async function GET() {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
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
      },
    })
    return NextResponse.json(present(row), { status: 201 })
  }

  /**
   * Body: { id, addPayment } (one more partial payment) or { id, paidAmount } (total paid so far;
   * it can only grow — recorded payments are never reduced here).
   * A payment increase is ALSO booked as a transaction (customer payment = business income,
   * supplier payment = business expense) unless the user says it is already recorded
   * (`alreadyBooked: true`). Optional `vatRate` (0/7/19); without it, VAT-registered users get
   * the booking flagged for review. Serialised per invoice so fast double clicks cannot lose a payment.
   */
  async function PATCH(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const body = await readJsonObject(req)
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id || !body) return jsonError(400, 'id is required.')

    const add = body.addPayment !== undefined ? parseAmount(body.addPayment) : undefined
    if (body.addPayment !== undefined && (add === undefined || add <= 0)) {
      return jsonError(400, 'Please enter a payment greater than 0.', { field: 'addPayment' })
    }
    const absolute = body.addPayment === undefined ? parseAmount(body.paidAmount) : undefined
    if (body.addPayment === undefined && absolute === undefined) {
      return jsonError(400, 'Please enter the amount paid so far (0 or more).', { field: 'paidAmount' })
    }
    const vatRate = body.vatRate === undefined || body.vatRate === null || body.vatRate === '' ? undefined : Number(body.vatRate)
    if (vatRate !== undefined && ![0, 7, 19].includes(vatRate)) return jsonError(400, 'VAT rate must be 0, 7 or 19 %.', { field: 'vatRate' })
    const book = body.alreadyBooked !== true

    try {
      const result = await db.$transaction(async tx => {
        await lockFor(tx, `debt:${id}`)
        const existing = await delegate(kind, tx).findFirst({ where: { id, userId: user.id } })
        if (!existing) return null
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
        if (book && incrementCents > 0) {
          const name = String(existing[nameField(kind)] ?? '')
          const taxType = await getTaxType(user.id, tx)
          const input = parseTransactionInput({
            type: kind === 'receivable' ? 'INCOME' : 'EXPENSE',
            grossAmount: fromCents(incrementCents),
            vatRate: taxType === 'KLEINUNTERNEHMER' ? 0 : vatRate ?? 0,
            usage: 'BUSINESS',
            transactionDate: toBerlinIsoDate(new Date()),
            merchant: name,
            description: kind === 'receivable' ? `Zahlung von ${name}` : `Zahlung an ${name}`,
            paymentMethod: 'BANK',
          })
          const vatUnknown = taxType !== 'KLEINUNTERNEHMER' && vatRate === undefined
          const t = await createTransaction(user.id, input, { source: 'USER', forceReview: vatUnknown }, tx)
          transactionId = t.id
        }
        return { updated, transactionId }
      })
      if (!result) return notFound()
      return NextResponse.json({
        ...present(result.updated),
        bookedTransactionId: result.transactionId,
      })
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
