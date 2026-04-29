import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [income, expenses, taxReserves, fixedCosts, receivables, payables] =
    await Promise.all([
      db.transaction.aggregate({
        where: {
          userId,
          type: 'INCOME',
          transactionDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { netAmount: true },
      }),

      db.transaction.aggregate({
        where: {
          userId,
          type: 'EXPENSE',
          transactionDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { businessAmount: true },
      }),

      db.taxReserve.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),

      db.fixedCost.aggregate({
        where: { userId, isActive: true },
        _sum: { amount: true },
      }),

      db.receivable.findMany({
        where: {
          userId,
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),

      db.payable.findMany({
        where: {
          userId,
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ])

  const totalIncome = Number(income._sum.netAmount ?? 0)
  const totalExpenses = Number(expenses._sum.businessAmount ?? 0)
  const totalFixedCosts = Number(fixedCosts._sum.amount ?? 0)

  const taxOwed = taxReserves.reduce(
    (sum: number, r: any) => sum + Number(r.shouldHave),
    0
  )
  const taxReserved = taxReserves.reduce(
    (sum: number, r: any) => sum + Number(r.actuallyReserved),
    0
  )
  const taxMissing = Math.max(0, taxOwed - taxReserved)

  const safeToSpend = Math.max(
    0,
    totalIncome - totalExpenses - totalFixedCosts - taxOwed
  )

  const warnings = []

  if (taxMissing > 0) {
    warnings.push({
      id: 'low-tax-reserve',
      type: 'LOW_TAX_RESERVE',
      severity: taxMissing > 500 ? 'high' : 'medium',
      message: `You are missing €${taxMissing.toFixed(2)} in your tax reserve (Steuerrücklage).`,
    })
  }

  const overdueReceivables = receivables.filter(
    r => r.dueDate && new Date(r.dueDate) < now
  )
  if (overdueReceivables.length > 0) {
    const total = overdueReceivables.reduce(
      (sum: number, r: any) => sum + Number(r.outstandingAmount),
      0
    )
    warnings.push({
      id: 'overdue-receivable',
      type: 'OVERDUE_RECEIVABLE',
      severity: 'medium',
      message: `${overdueReceivables.length} customer(s) owe you €${total.toFixed(2)} past due date.`,
    })
  }

  const overduePayables = payables.filter(
    p => p.dueDate && new Date(p.dueDate) < now
  )
  if (overduePayables.length > 0) {
    const total = overduePayables.reduce(
      (sum: number, p: any) => sum + Number(p.outstandingAmount),
      0
    )
    warnings.push({
      id: 'overdue-payable',
      type: 'OVERDUE_PAYABLE',
      severity: 'high',
      message: `You owe €${total.toFixed(2)} to supplier(s) past due date.`,
    })
  }

  return NextResponse.json({
    month: now.toLocaleString('en-DE', { month: 'long', year: 'numeric' }),
    totalIncome,
    totalExpenses,
    totalFixedCosts,
    taxOwed,
    taxReserved,
    taxMissing,
    safeToSpend,
    warnings,
    receivables: receivables.map(r => ({
      id: r.id,
      customerName: r.customerName,
      outstandingAmount: Number(r.outstandingAmount),
      dueDate: r.dueDate,
      status: r.status,
    })),
    payables: payables.map(p => ({
      id: p.id,
      supplierName: p.supplierName,
      outstandingAmount: Number(p.outstandingAmount),
      dueDate: p.dueDate,
      status: p.status,
    })),
  })
}
