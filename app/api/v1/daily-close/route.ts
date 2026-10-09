import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { parseCalendarDate, toBerlinIsoDate } from '@/lib/time/berlin'
import { jsonError, optionalString, parseAmount, readJsonObject, unauthorized } from '@/lib/http'

const FIELDS = ['cashStart', 'cashSales', 'cashExpenses', 'cashEnd', 'cashDiff'] as const

type Close = Record<(typeof FIELDS)[number], { toString(): string }> & { date: Date } & Record<string, unknown>
function present(c: Close) {
  const out: Record<string, unknown> = { ...c, date: toBerlinIsoDate(c.date) }
  for (const f of FIELDS) out[f] = fromCents(toCents(c[f]))
  return out
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const closes = await db.dailyClose.findMany({ where: { userId: user.id }, orderBy: { date: 'desc' }, take: 30 })
  return NextResponse.json(closes.map(present))
}

/**
 * Cash count at the end of a day (Kassenabschluss). Difference = counted cash
 * minus expected cash (start + sales − expenses). One record per day; saving
 * again for the same day replaces it.
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  const date = parseCalendarDate(body?.date)
  if (!date) return jsonError(400, 'Please enter a valid date.', { field: 'date' })
  if (date.getTime() > Date.now() + 24 * 3600_000) return jsonError(400, 'The date cannot be in the future.', { field: 'date' })

  const values: Record<string, number> = {}
  for (const f of ['cashStart', 'cashSales', 'cashExpenses', 'cashEnd'] as const) {
    const v = body?.[f] === undefined || body?.[f] === '' ? 0 : parseAmount(body?.[f], { max: 10_000_000 })
    if (v === undefined) return jsonError(400, 'Amounts must be 0 or more.', { field: f })
    values[f] = toCents(v)
  }
  const expected = values.cashStart + values.cashSales - values.cashExpenses
  const diff = values.cashEnd - expected

  // Stored as a DATE column: use the calendar day.
  const day = new Date(`${toBerlinIsoDate(date)}T00:00:00.000Z`)
  const data = {
    cashStart: centsToDecimalString(values.cashStart),
    cashSales: centsToDecimalString(values.cashSales),
    cashExpenses: centsToDecimalString(values.cashExpenses),
    cashEnd: centsToDecimalString(values.cashEnd),
    cashDiff: centsToDecimalString(diff),
    notes: optionalString(body?.notes, 1000) ?? null,
    closedAt: new Date(),
  }
  const existing = await db.dailyClose.findFirst({ where: { userId: user.id, date: day } })
  const close = existing
    ? await db.dailyClose.update({ where: { id: existing.id }, data })
    : await db.dailyClose.create({ data: { userId: user.id, date: day, ...data } })
  return NextResponse.json(present(close), { status: 201 })
}
