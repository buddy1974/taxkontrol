import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { presentPosition } from '@/lib/finance/present'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { recordAudit } from '@/lib/audit'
import { jsonError, parseAmount, readJsonObject, unauthorized } from '@/lib/http'
import { vatPeriodFor } from '@/lib/finance/loadPosition'
import { berlinDate, berlinYearRange } from '@/lib/time/berlin'
import { lockFor } from '@/lib/locks'

/**
 * Tax reserves are tracked per tax period:
 *  - VAT: the current VAT filing period (month / quarter / year)
 *  - INCOME_TAX: the current calendar year
 * Rows for earlier periods are history and are never rewritten.
 * `actuallyReserved` is only ever what the user reports having set aside.
 */
export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const now = new Date()
  const position = await loadFinancialPosition(user.id, now)
  const vatPeriod = vatPeriodFor(now, position.settings.vatFilingPeriod)
  const year = berlinYearRange(berlinDate(now).year)

  const current = []
  for (const target of position.reserves) {
    const period = target.type === 'VAT' ? vatPeriod : year
    const row = await db.$transaction(async tx => {
      await lockFor(tx, `reserve:${user.id}:${target.type}`)
      const existing = await tx.taxReserve.findFirst({
        where: { userId: user.id, type: target.type, periodStart: period.start },
        orderBy: { createdAt: 'asc' },
      })
      const snapshot = {
        shouldHave: centsToDecimalString(target.targetCents),
        missing: centsToDecimalString(target.shortfallCents),
      }
      if (existing) return tx.taxReserve.update({ where: { id: existing.id }, data: snapshot })
      return tx.taxReserve.create({
        data: { userId: user.id, type: target.type, periodStart: period.start, periodEnd: period.end, actuallyReserved: '0', ...snapshot },
      })
    })
    current.push({
      id: row.id,
      type: target.type,
      label: target.label,
      periodLabel: target.periodLabel,
      periodStart: row.periodStart.toISOString(),
      periodEnd: row.periodEnd.toISOString(),
      target: fromCents(target.targetCents),
      reserved: fromCents(target.reservedCents),
      shortfall: fromCents(target.shortfallCents),
    })
  }

  const history = await db.taxReserve.findMany({
    where: {
      userId: user.id,
      id: { notIn: current.map(c => c.id) },
      OR: [{ type: 'VAT', periodStart: { lt: vatPeriod.start } }, { type: 'INCOME_TAX', periodStart: { lt: year.start } }, { type: 'TRADE_TAX' }],
    },
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
    })),
    incomeTax: presented.incomeTax,
    limitations: presented.limitations,
  })
}

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
