import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { jsonError, notFound, oneOf, optionalString, parseAmount, readJsonObject, unauthorized } from '@/lib/http'

const USAGES = ['BUSINESS', 'PRIVATE', 'MIXED'] as const
const FREQUENCIES = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

type Cost = { amount: { toString(): string } } & Record<string, unknown>
const present = (c: Cost) => ({ ...c, amount: fromCents(toCents(c.amount)) })

function parseDay(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : undefined
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const costs = await db.fixedCost.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  return NextResponse.json(costs.map(present))
}

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  const name = optionalString(body?.name, 120)
  const amount = parseAmount(body?.amount, { max: 1_000_000 })
  const usage = body?.usage === undefined ? 'BUSINESS' : oneOf(body.usage, USAGES)
  const frequency = body?.frequency === undefined ? 'MONTHLY' : oneOf(body.frequency, FREQUENCIES)
  const dayOfMonth = body?.dayOfMonth === undefined ? 1 : parseDay(body.dayOfMonth)
  if (!name) return jsonError(400, 'Please enter a name.', { field: 'name' })
  if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter an amount greater than 0.', { field: 'amount' })
  if (!usage) return jsonError(400, 'Unknown usage.', { field: 'usage' })
  if (!frequency) return jsonError(400, 'Unknown frequency.', { field: 'frequency' })
  if (dayOfMonth === undefined) return jsonError(400, 'Day of month must be 1–31.', { field: 'dayOfMonth' })

  const cost = await db.fixedCost.create({
    data: { userId: user.id, name, amount: centsToDecimalString(toCents(amount)), usage, frequency, dayOfMonth, isActive: true, categoryId: null },
  })
  return NextResponse.json(present(cost), { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id || !body) return jsonError(400, 'id is required.')
  const existing = await db.fixedCost.findFirst({ where: { id, userId: user.id } })
  if (!existing) return notFound()

  const data: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = optionalString(body.name, 120)
    if (!name) return jsonError(400, 'Please enter a name.', { field: 'name' })
    data.name = name
  }
  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount, { max: 1_000_000 })
    if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter an amount greater than 0.', { field: 'amount' })
    data.amount = centsToDecimalString(toCents(amount))
  }
  if (body.usage !== undefined) {
    const usage = oneOf(body.usage, USAGES)
    if (!usage) return jsonError(400, 'Unknown usage.', { field: 'usage' })
    data.usage = usage
  }
  if (body.frequency !== undefined) {
    const frequency = oneOf(body.frequency, FREQUENCIES)
    if (!frequency) return jsonError(400, 'Unknown frequency.', { field: 'frequency' })
    data.frequency = frequency
  }
  if (body.dayOfMonth !== undefined) {
    const day = parseDay(body.dayOfMonth)
    if (day === undefined) return jsonError(400, 'Day of month must be 1–31.', { field: 'dayOfMonth' })
    data.dayOfMonth = day
  }
  if (typeof body.isActive === 'boolean') data.isActive = body.isActive

  const updated = await db.fixedCost.update({ where: { id: existing.id }, data })
  return NextResponse.json(present(updated))
}

export async function DELETE(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return jsonError(400, 'id is required.')
  const existing = await db.fixedCost.findFirst({ where: { id, userId: user.id } })
  if (!existing) return notFound()
  await db.fixedCost.delete({ where: { id: existing.id } })
  return NextResponse.json({ success: true })
}
