import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { limitWrites } from '@/lib/rateLimit'
import { db } from '@/lib/db'
import { loadFinancialPosition, loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { listTaxPeriods, trackingStartFor, type TaxPeriod } from '@/lib/finance/periods'
import { presentPosition } from '@/lib/finance/present'
import { centsToDecimalString, TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { recordAudit } from '@/lib/audit'
import { jsonError, oneOf, parseAmount, readJsonObject, unauthorized } from '@/lib/http'
import { isAfterBerlinToday, parseCalendarDate, toBerlinIsoDate, type DateRange } from '@/lib/time/berlin'
import { lockFor } from '@/lib/locks'
import { withIdempotency } from '@/lib/idempotency'
import { convertToTaxPayment, createTransaction, parseTransactionInput, serializeTransaction } from '@/lib/transactions/service'

/**
 * Tax reserves are tracked per tax period, from the start of the year before last:
 *  - VAT: every VAT filing period in which the user was VAT-registered (status history)
 *  - INCOME_TAX: every calendar year
 * A period stays open until its payment is recorded or the user marks it settled.
 * The ESTIMATED tax of a period is recomputed from the records. What is paid comes only from
 * payments the user records here (booked as tax-payment transactions), what is reserved only
 * from what the user enters, and a period is "settled" only when the user says so.
 * The "set aside" amount of a past period can still be updated (late transfers); every change
 * is audited.
 */

type TaxKind = 'VAT' | 'INCOME_TAX'

/** The periods a user can record payments for or settle — the same list the position uses. */
async function trackedPeriods(userId: string, now: Date): Promise<TaxPeriod[]> {
  const timeline = await loadTaxStatusTimeline(userId)
  return listTaxPeriods(timeline, now, trackingStartFor(now))
}

async function upsertReserveRow(
  tx: Prisma.TransactionClient,
  userId: string,
  type: TaxKind,
  range: DateRange,
  data: Partial<{ shouldHave: string; missing: string; settledAt: Date | null }>
) {
  await lockFor(tx, `reserve:${userId}:${type}`)
  const existing = await tx.taxReserve.findFirst({ where: { userId, type, periodStart: range.start }, orderBy: { createdAt: 'asc' } })
  if (existing) return { before: existing, row: await tx.taxReserve.update({ where: { id: existing.id }, data }) }
  const row = await tx.taxReserve.create({
    data: { userId, type, periodStart: range.start, periodEnd: range.end, actuallyReserved: '0', shouldHave: '0', missing: '0', ...data },
  })
  return { before: null, row }
}

/** Unlinked bookings that look like Finanzamt payments/refunds (e.g. from a bank import). */
async function paymentCandidates(userId: string, since: Date) {
  const rows = await db.transaction.findMany({
    where: {
      userId,
      taxPaymentType: null,
      receivableId: null,
      transactionDate: { gte: since },
      OR: [{ merchant: { contains: 'finanzamt', mode: 'insensitive' } }, { description: { contains: 'finanzamt', mode: 'insensitive' } }],
    },
    orderBy: { transactionDate: 'desc' },
    take: 20,
  })
  return rows.map(r => ({
    id: r.id,
    type: r.type,
    date: toBerlinIsoDate(r.transactionDate),
    amount: fromCents(toCents(r.grossAmount)),
    merchant: r.merchant,
    description: r.description,
    usage: r.usage,
  }))
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const now = new Date()
  const position = await loadFinancialPosition(user.id, now)

  const current = []
  for (const target of position.reserves) {
    const range = { start: new Date(target.periodStart), end: new Date(target.periodEnd) }
    const { row } = await db.$transaction(tx =>
      upsertReserveRow(tx, user.id, target.type, range, {
        shouldHave: centsToDecimalString(target.targetCents),
        missing: centsToDecimalString(target.shortfallCents),
      })
    )
    current.push({
      id: row.id,
      type: target.type,
      label: target.label,
      status: target.status,
      periodLabel: target.periodLabel,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      target: fromCents(target.targetCents),
      paid: fromCents(target.paidCents),
      open: fromCents(target.openCents),
      reserved: fromCents(target.reservedCents),
      reserveLeft: fromCents(target.reserveLeftCents),
      shortfall: fromCents(target.shortfallCents),
      dueNote: target.dueNote,
      vatMethod: target.vatMethod ?? null,
    })
  }

  const history = await db.taxReserve.findMany({
    where: { userId: user.id, id: { notIn: current.map(c => c.id) } },
    orderBy: { periodStart: 'desc' },
    take: 24,
  })

  const presented = presentPosition(position)
  return NextResponse.json({
    taxType: position.taxType,
    vatFilingPeriod: position.settings.vatFilingPeriod,
    vatMethod: position.settings.vatMethod,
    dauerfristverlaengerung: position.settings.dauerfristverlaengerung,
    isEstimate: true,
    reserves: current,
    history: history.map(r => ({
      id: r.id,
      type: r.type,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      target: fromCents(toCents(r.shouldHave)),
      reserved: fromCents(toCents(r.actuallyReserved)),
      settledAt: r.settledAt?.toISOString() ?? null,
    })),
    paymentCandidates: await paymentCandidates(user.id, position.trackingStart),
    incomeTax: presented.incomeTax,
    limitations: presented.limitations,
  })
}

/** Update what the user has set aside for one period. */
export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const body = await readJsonObject(req)
  const id = typeof body?.id === 'string' ? body.id : null
  const amount = parseAmount(body?.actuallyReserved, { max: 100_000_000 })
  if (!id) return jsonError(400, 'id is required.')
  if (amount === undefined) return jsonError(400, 'Please enter the amount you have set aside (0 or more).')

  const reserve = await db.taxReserve.findFirst({ where: { id, userId: user.id } })
  if (!reserve) return jsonError(404, 'Not found')

  const reservedCents = toCents(amount)
  const missingCents = Math.max(0, toCents(reserve.shouldHave) - reservedCents)
  const updated = await db.$transaction(async tx => {
    const u = await tx.taxReserve.update({
      where: { id },
      data: { actuallyReserved: centsToDecimalString(reservedCents), missing: centsToDecimalString(missingCents) },
    })
    await recordAudit(
      {
        userId: user.id,
        entityType: 'TAX_RESERVE',
        entityId: id,
        action: 'UPDATE',
        before: { actuallyReserved: reserve.actuallyReserved.toString() },
        after: { actuallyReserved: u.actuallyReserved.toString() },
      },
      tx
    )
    return u
  })

  return NextResponse.json({
    id: updated.id,
    type: updated.type,
    target: fromCents(toCents(updated.shouldHave)),
    reserved: fromCents(toCents(updated.actuallyReserved)),
    shortfall: fromCents(toCents(updated.missing)),
  })
}

/**
 * Body:
 *  { action: 'recordPayment', type, periodStart, amount, date?, direction?: 'PAYMENT' | 'REFUND',
 *    settle?: boolean, confirmNotDuplicate?: boolean }
 *    Books a payment to (or refund from) the Finanzamt for that period. It is not profit,
 *    not private money and not this month's spending; it reduces what is still open.
 *    Idempotent with an `Idempotency-Key` header. If an unlinked booking with the same amount
 *    that mentions the Finanzamt exists (e.g. bank import), 409 POSSIBLE_DUPLICATE is returned
 *    so the user links that booking instead (or confirms it is a different payment).
 *  { action: 'linkTransaction', transactionId, type, periodStart }
 *    Marks an existing booking as that payment / refund (no second booking).
 *  { action: 'settleUpTo', type, periodStart }
 *    Marks every ENDED period of that type up to and including this one as settled.
 *  { action: 'settle', type, periodStart, settled: boolean }
 *    The user confirms the period is finished with the Finanzamt (or reopens it).
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited
  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  const action = oneOf(body.action, ['recordPayment', 'settle', 'settleUpTo', 'linkTransaction'] as const)
  const type = oneOf(body.type, ['VAT', 'INCOME_TAX'] as const)
  if (!action) return jsonError(400, 'action must be recordPayment, linkTransaction or settle.', { field: 'action' })
  if (!type) return jsonError(400, 'type must be VAT or INCOME_TAX.', { field: 'type' })
  const periodStartMs = typeof body.periodStart === 'string' ? Date.parse(body.periodStart) : NaN
  const now = new Date()
  const tracked = await trackedPeriods(user.id, now)
  const period = tracked.find(p => p.type === type && p.start.getTime() === periodStartMs)
  if (!period) return jsonError(400, 'This tax period is not tracked. Choose a period shown on the Tax page.', { field: 'periodStart' })

  const taxName = type === 'VAT' ? 'Umsatzsteuer' : 'Einkommensteuer'

  if (action === 'settle') {
    if (typeof body.settled !== 'boolean') return jsonError(400, 'settled must be true or false.', { field: 'settled' })
    const settled = body.settled
    const row = await db.$transaction(async tx => {
      const { before, row } = await upsertReserveRow(tx, user.id, type, period, { settledAt: settled ? now : null })
      await recordAudit(
        {
          userId: user.id,
          entityType: 'TAX_RESERVE',
          entityId: row.id,
          action: 'UPDATE',
          before: { settledAt: before?.settledAt?.toISOString() ?? null },
          after: { settledAt: row.settledAt?.toISOString() ?? null },
        },
        tx
      )
      return row
    })
    return NextResponse.json({ id: row.id, type, periodLabel: period.label, settledAt: row.settledAt?.toISOString() ?? null })
  }

  if (action === 'settleUpTo') {
    // "Everything up to this period is filed and paid" — e.g. after importing older records.
    // Only ENDED periods; each one is audited like a single settle.
    if (period.status !== 'ENDED') return jsonError(400, 'Only periods that have ended can be marked settled.', { field: 'periodStart' })
    const targets = tracked.filter(p => p.type === type && p.status === 'ENDED' && p.start.getTime() <= period.start.getTime())
    await db.$transaction(async tx => {
      for (const p of targets) {
        const { before, row } = await upsertReserveRow(tx, user.id, type, p, { settledAt: now })
        if (!before?.settledAt) {
          await recordAudit({ userId: user.id, entityType: 'TAX_RESERVE', entityId: row.id, action: 'UPDATE', before: { settledAt: null }, after: { settledAt: now.toISOString(), bulk: true } }, tx)
        }
      }
    })
    return NextResponse.json({ settled: targets.map(p => p.label) })
  }

  if (action === 'linkTransaction') {
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId : null
    if (!transactionId) return jsonError(400, 'transactionId is required.', { field: 'transactionId' })
    try {
      const updated = await db.$transaction(tx => convertToTaxPayment(user.id, transactionId, { type, periodStart: period.start }, tx))
      if (!updated) return jsonError(404, 'Not found')
      return NextResponse.json({ transaction: serializeTransaction(updated), periodLabel: period.label })
    } catch (err) {
      if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field })
      throw err
    }
  }

  // ── recordPayment ──
  const amount = parseAmount(body.amount, { max: 10_000_000 })
  if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter the amount paid (greater than 0).', { field: 'amount' })
  const direction = body.direction === undefined ? 'PAYMENT' : oneOf(body.direction, ['PAYMENT', 'REFUND'] as const)
  if (!direction) return jsonError(400, 'direction must be PAYMENT or REFUND.', { field: 'direction' })
  const date = body.date === undefined || body.date === '' ? toBerlinIsoDate(now) : body.date
  const parsedDate = parseCalendarDate(date)
  if (parsedDate === null) return jsonError(400, 'Please enter a valid date.', { field: 'date' })
  if (isAfterBerlinToday(parsedDate, now)) return jsonError(400, 'A payment cannot be dated in the future.', { field: 'date' })
  if (body.settle !== undefined && typeof body.settle !== 'boolean') return jsonError(400, 'settle must be true or false.', { field: 'settle' })

  try {
    return await withIdempotency(req, user.id, 'tax-payment', async tx => {
      if (body.confirmNotDuplicate !== true) {
        const amountStr = centsToDecimalString(toCents(amount))
        const dup = await tx.transaction.findFirst({
          where: {
            userId: user.id,
            taxPaymentType: null,
            type: direction === 'PAYMENT' ? 'EXPENSE' : 'INCOME',
            grossAmount: amountStr,
            transactionDate: { gte: new Date(parsedDate.getTime() - 45 * 86400000), lte: new Date(parsedDate.getTime() + 45 * 86400000) },
            OR: [{ merchant: { contains: 'finanzamt', mode: 'insensitive' } }, { description: { contains: 'finanzamt', mode: 'insensitive' } }],
          },
          select: { id: true, transactionDate: true },
        })
        if (dup) {
          return {
            status: 409,
            body: {
              error: `A booking of ${amount.toFixed(2)} € to/from the Finanzamt on ${toBerlinIsoDate(dup.transactionDate)} already exists. Mark that booking as this payment instead of recording it again.`,
              code: 'POSSIBLE_DUPLICATE',
              transactionId: dup.id,
            },
          }
        }
      }
      const input = parseTransactionInput({
        type: direction === 'PAYMENT' ? 'EXPENSE' : 'INCOME',
        grossAmount: amount,
        vatRate: 0,
        usage: 'BUSINESS',
        transactionDate: date,
        merchant: 'Finanzamt',
        description: `${direction === 'PAYMENT' ? 'Zahlung' : 'Erstattung'} ${taxName} ${period.label}`,
        paymentMethod: 'BANK',
      })
      const t = await createTransaction(user.id, input, { source: 'USER', taxPayment: { type, periodStart: period.start } }, tx)
      if (body.settle === true) {
        const { row } = await upsertReserveRow(tx, user.id, type, period, { settledAt: now })
        await recordAudit({ userId: user.id, entityType: 'TAX_RESERVE', entityId: row.id, action: 'UPDATE', after: { settledAt: now.toISOString() } }, tx)
      }
      return { status: 201, body: { transaction: serializeTransaction(t), periodLabel: period.label, settled: body.settle === true } }
    }, body)
  } catch (err) {
    if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field === 'transactionDate' ? 'date' : err.field })
    throw err
  }
}
