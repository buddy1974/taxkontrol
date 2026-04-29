import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount } = await req.json()
  const userId = session.user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [income, expenses, taxReserves, fixedCosts, payables, employees] = await Promise.all([
    db.transaction.aggregate({ where: { userId, type: 'INCOME', transactionDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { netAmount: true } }),
    db.transaction.aggregate({ where: { userId, type: 'EXPENSE', transactionDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { businessAmount: true } }),
    db.taxReserve.findMany({ where: { userId } }),
    db.fixedCost.aggregate({ where: { userId, isActive: true }, _sum: { amount: true } }),
    db.payable.aggregate({ where: { userId, status: { in: ['OPEN', 'PARTIAL'] } }, _sum: { outstandingAmount: true } }),
    db.employee.findMany({ where: { userId, isActive: true } }),
  ])

  const totalIncome = Number(income._sum.netAmount ?? 0)
  const totalExpenses = Number(expenses._sum.businessAmount ?? 0)
  const totalFixedCosts = Number(fixedCosts._sum.amount ?? 0)
  const totalPayables = Number(payables._sum.outstandingAmount ?? 0)
  const totalSalaries = employees.reduce((sum: number, e: any) => sum + Number(e.salaryAmount), 0)
  const taxOwed = taxReserves.reduce((sum: number, r: any) => sum + Number(r.shouldHave), 0)
  const safeToSpend = Math.max(0, totalIncome - totalExpenses - totalFixedCosts - taxOwed - totalPayables - totalSalaries)

  const requested = parseFloat(amount)
  const canSpend = requested <= safeToSpend

  return NextResponse.json({
    requested,
    canSpend,
    safeToSpend,
    breakdown: { totalIncome, totalExpenses, totalFixedCosts, taxOwed, totalPayables, totalSalaries },
    message: canSpend
      ? `Yes, you can spend €${requested.toFixed(2)}. You have €${safeToSpend.toFixed(2)} available.`
      : `No. You only have €${safeToSpend.toFixed(2)} safe to spend. You are short by €${(requested - safeToSpend).toFixed(2)}.`,
  })
}
