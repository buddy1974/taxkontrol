import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { berlinDate, berlinMonthRange } from '@/lib/time/berlin'
import { jsonError, notFound, oneOf, optionalString, parseAmount, readJsonObject, unauthorized } from '@/lib/http'

/**
 * Employees and salary payments. Salaries here are the agreed gross amounts;
 * employer social-security contributions and wage tax are NOT calculated —
 * the payroll office / Steuerberater does that (shown as a limitation in the UI).
 */
export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const employees = await db.employee.findMany({
    where: { userId: user.id },
    include: { payments: { orderBy: { period: 'desc' }, take: 3 } },
    orderBy: { createdAt: 'asc' },
  })
  const { start, end } = (() => {
    const d = berlinDate()
    return berlinMonthRange(d.year, d.month)
  })()
  return NextResponse.json(
    employees.map(e => ({
      ...e,
      salaryAmount: fromCents(toCents(e.salaryAmount)),
      paidThisMonth: e.payments.some(p => p.isPaid && p.period >= start && p.period < end),
      payments: e.payments.map(p => ({ ...p, amount: fromCents(toCents(p.amount)) })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  const name = optionalString(body?.name, 120)
  const salaryType = body?.salaryType === undefined ? 'MONTHLY' : oneOf(body.salaryType, ['MONTHLY', 'HOURLY'] as const)
  const salary = parseAmount(body?.salaryAmount, { max: 100_000 })
  if (!name) return jsonError(400, 'Please enter a name.', { field: 'name' })
  if (!salaryType) return jsonError(400, 'Unknown salary type.', { field: 'salaryType' })
  if (salary === undefined || salary <= 0) return jsonError(400, 'Please enter a salary greater than 0.', { field: 'salaryAmount' })

  const employee = await db.employee.create({
    data: { userId: user.id, name, role: optionalString(body?.role, 120) ?? null, salaryType, salaryAmount: centsToDecimalString(toCents(salary)), isActive: true },
  })
  return NextResponse.json({ ...employee, salaryAmount: salary, paidThisMonth: false, payments: [] }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const body = await readJsonObject(req)
  const id = typeof body?.id === 'string' ? body.id : null
  if (!id) return jsonError(400, 'id is required.')
  const employee = await db.employee.findFirst({ where: { id, userId: user.id } })
  if (!employee) return notFound()

  if (body?.action === 'pay') {
    // One salary payment per employee and calendar month (Berlin).
    const d = berlinDate()
    const month = berlinMonthRange(d.year, d.month)
    const existing = await db.employeePayment.findFirst({ where: { employeeId: id, isPaid: true, period: { gte: month.start, lt: month.end } } })
    if (existing) return jsonError(409, 'This month’s salary is already marked as paid.')
    const amount = body.amount === undefined ? fromCents(toCents(employee.salaryAmount)) : parseAmount(body.amount, { max: 100_000 })
    if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter an amount greater than 0.', { field: 'amount' })
    const payment = await db.employeePayment.create({
      data: { employeeId: id, amount: centsToDecimalString(toCents(amount)), period: new Date(month.start.getTime() + 12 * 3600_000), paidAt: new Date(), isPaid: true },
    })
    return NextResponse.json({ ...payment, amount })
  }

  if (body?.action === 'deactivate') {
    const updated = await db.employee.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ ...updated, salaryAmount: fromCents(toCents(updated.salaryAmount)) })
  }

  return jsonError(400, 'Unknown action')
}
