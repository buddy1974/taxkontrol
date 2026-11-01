import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { loadFinancialPosition, previousVatPeriodFor, vatPeriodFor, loadTaxSettings } from '@/lib/finance/loadPosition'
import { presentPosition } from '@/lib/finance/present'
import { centsToDecimalString, TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { recordAudit } from '@/lib/audit'
import { jsonError, oneOf, parseAmount, readJsonObject, unauthorized } from '@/lib/http'
import { berlinDate, berlinYearRange, parseCalendarDate, toBerlinIsoDate, type DateRange } from '@/lib/time/berlin'
import { lockFor } from '@/lib/locks'
import { createTransaction, parseTransactionInput, serializeTransaction } from '@/lib/transactions/service'

/**
 * Tax reserves are tracked per tax period:
 *  - VAT: the current VAT filing period (month / quarter / year) and the one just ended
 *  - INCOME_TAX: the current calendar year and the previous one
 * The ESTIMATED tax of a period is recomputed from the records. What is paid comes only from
 * payments the user records here (booked as tax-payment transactions), what is reserved only
 * from what the user enters, and a period is "settled" only when the user says so.
 * The "set aside" amount of a past period can still be updated (late transfers); every change
 * is audited.
 */

type TaxKind = 'VAT' | 'INCOME_TAX'

/** The periods a user can record payments for or settle. Anything else is refused. */
async function trackedPeriods(userId: string, now: Date): Promise<Array<{ type: TaxKind; range: DateRange & { label: string } }>> {
  const settings = await loadTaxSettings(userId)
  const y = berlinDate(now).year
  const periods: Array<{ type: TaxKind; range: DateRange & { label: string } }> = [
    { type: 'INCOME_TAX', range: { ...berlinYearRange(y), label: String(y) } },
    { type: 'INCOME_TAX', range: { ...berlinYearRange(y - 1), label: String(y - 1) } },
  ]
  if (settings.taxType !== 'KLEINUNTERNEHMER') {
    periods.push({ type: 'VAT', range: vatPeriodFor(now, settings.vatFilingPeriod) })
    periods.push({ type: 'VAT', range: previousVatPeriodFor(now, settings.vatFilingPeriod) })
  }
  return periods
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
      shortfall: fromCents(target.shortfallCents),
      dueNote: target.dueNote,
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
    incomeTax: presented.incomeTax,
    limitations: presented.limitations,
  })
}

/** Update what the user has set aside for one period. */
export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

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
 *  { action: 'recordPayment', type, periodStart, amount, date?, direction?: 'PAYMENT' | 'REFUND', settle?: boolean }
 *    Books a payment to (or refund from) the Finanzamt for that period. It is not profit,
 *    not private money and not this month's spending; it reduces what is still open.
 *  { action: 'settle', type, periodStart, settled: boolean }
 *    The user confirms the period is finished with the Finanzamt (or reopens it).
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  const action = oneOf(body.action, ['recordPayment', 'settle'] as const)
  const type = oneOf(body.type, ['VAT', 'INCOME_TAX'] as const)
  if (!action) return jsonError(400, 'action must be recordPayment or settle.', { field: 'action' })
  if (!type) return jsonError(400, 'type must be VAT or INCOME_TAX.', { field: 'type' })
  const periodStartMs = typeof body.periodStart === 'string' ? Date.parse(body.periodStart) : NaN
  const now = new Date()
  const period = (await trackedPeriods(user.id, now)).find(p => p.type === type && p.range.start.getTime() === periodStartMs)
  if (!period) return jsonError(400, 'This tax period is not tracked. Choose a period shown on the Tax page.', { field: 'periodStart' })

  const taxName = type === 'VAT' ? 'Umsatzsteuer' : 'Einkommensteuer'

  if (action === 'settle') {
    if (typeof body.settled !== 'boolean') return jsonError(400, 'settled must be true or false.', { field: 'settled' })
    const settled = body.settled
    const row = await db.$transaction(async tx => {
      const { before, row } = await upsertReserveRow(tx, user.id, type, period.range, { settledAt: settled ? now : null })
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
    return NextResponse.json({ id: row.id, type, periodLabel: period.range.label, settledAt: row.settledAt?.toISOString() ?? null })
  }

  // ── recordPayment ──
  const amount = parseAmount(body.amount, { max: 10_000_000 })
  if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter the amount paid (greater than 0).', { field: 'amount' })
  const direction = body.direction === undefined ? 'PAYMENT' : oneOf(body.direction, ['PAYMENT', 'REFUND'] as const)
  if (!direction) return jsonError(400, 'direction must be PAYMENT or REFUND.', { field: 'direction' })
  const date = body.date === undefined || body.date === '' ? toBerlinIsoDate(now) : body.date
  if (parseCalendarDate(date) === null) return jsonError(400, 'Please enter a valid date.', { field: 'date' })
  if (body.settle !== undefined && typeof body.settle !== 'boolean') return jsonError(400, 'settle must be true or false.', { field: 'settle' })

  try {
    const result = await db.$transaction(async tx => {
      const input = parseTransactionInput({
        type: direction === 'PAYMENT' ? 'EXPENSE' : 'INCOME',
        grossAmount: amount,
        vatRate: 0,
        usage: 'BUSINESS',
        transactionDate: date,
        merchant: 'Finanzamt',
        description: `${direction === 'PAYMENT' ? 'Zahlung' : 'Erstattung'} ${taxName} ${period.range.label}`,
        paymentMethod: 'BANK',
      })
      const t = await createTransaction(user.id, input, { source: 'USER', taxPayment: { type, periodStart: period.range.start } }, tx)
      if (body.settle === true) {
        const { row } = await upsertReserveRow(tx, user.id, type, period.range, { settledAt: now })
        await recordAudit({ userId: user.id, entityType: 'TAX_RESERVE', entityId: row.id, action: 'UPDATE', after: { settledAt: now.toISOString() } }, tx)
      }
      return t
    })
    return NextResponse.json({ transaction: serializeTransaction(result), periodLabel: period.range.label, settled: body.settle === true }, { status: 201 })
  } catch (err) {
    if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field === 'transactionDate' ? 'date' : err.field })
    throw err
  }
}
