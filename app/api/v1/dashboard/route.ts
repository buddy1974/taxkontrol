import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computeMonthlyTaxReserve } from '@/lib/engines/taxReserve'
import { requireCurrentUser } from '@/lib/getCurrentUser'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const [income, expenses, taxReserves, fixedCosts, receivables, payables, payablesAgg, employees, reserveCalc] =
    await Promise.all([
      db.transaction.aggregate({
        where: { userId, type: 'INCOME', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { netAmount: true },
      }),
      db.transaction.aggregate({
        where: { userId, type: 'EXPENSE', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
        _sum: { businessAmount: true },
      }),
      db.taxReserve.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
      db.fixedCost.findMany({
        where: { userId, isActive: true },
        select: { amount: true, frequency: true },
      }),
      db.receivable.findMany({
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      db.payable.findMany({
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      db.payable.aggregate({
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        _sum: { outstandingAmount: true },
      }),
      db.employee.findMany({
        where: { userId, isActive: true },
        select: { salaryAmount: true },
      }),
      computeMonthlyTaxReserve(userId, startOfMonth, startOfNextMonth),
    ])

  const totalIncome = Number(income._sum.netAmount ?? 0)
  const totalExpenses = Number(expenses._sum.businessAmount ?? 0)
  const totalFixedCosts = fixedCosts.reduce((sum: number, fc: any) => {
    const monthly = fc.frequency === 'YEARLY' ? Number(fc.amount) / 12
      : fc.frequency === 'QUARTERLY' ? Number(fc.amount) / 3
      : Number(fc.amount)
    return sum + monthly
  }, 0)
  const totalPayables = Number(payablesAgg._sum.outstandingAmount ?? 0)
  const totalSalaries = employees.reduce((sum: number, e: any) => sum + Number(e.salaryAmount), 0)

  // taxOwed from live calculation, not stale DB shouldHave
  const taxOwed = reserveCalc.vatShouldHave + reserveCalc.incomeTaxShouldHave
  const taxReserved = taxReserves.reduce((sum: number, r: any) => sum + Number(r.actuallyReserved), 0)
  const taxMissing = Math.max(0, taxOwed - taxReserved)

  const safeToSpend = Math.max(
    0,
    totalIncome - totalExpenses - totalFixedCosts - taxOwed - totalPayables - totalSalaries
  )

  const warnings = []

  if (taxMissing > 0) {
    warnings.push({
      id: 'low-tax-reserve',
      type: 'LOW_TAX_RESERVE',
      severity: taxMissing > 500 ? 'high' : 'medium',
      message: `Your tax reserve is €${taxMissing.toFixed(2)} below the estimated target. Consider setting this aside before the tax season.`,
    })
  }

  const overdueReceivables = receivables.filter(
    (r: any) => r.dueDate && new Date(r.dueDate) < now
  )
  if (overdueReceivables.length > 0) {
    const total = overdueReceivables.reduce(
      (sum: number, r: any) => sum + Number(r.outstandingAmount), 0
    )
    warnings.push({
      id: 'overdue-receivable',
      type: 'OVERDUE_RECEIVABLE',
      severity: 'medium',
      message: `${overdueReceivables.length} customer invoice(s) totalling €${total.toFixed(2)} are overdue. You may want to follow up.`,
    })
  }

  const overduePayables = payables.filter(
    (p: any) => p.dueDate && new Date(p.dueDate) < now
  )
  if (overduePayables.length > 0) {
    const total = overduePayables.reduce(
      (sum: number, p: any) => sum + Number(p.outstandingAmount), 0
    )
    warnings.push({
      id: 'overdue-payable',
      type: 'OVERDUE_PAYABLE',
      severity: 'high',
      message: `You have €${total.toFixed(2)} in supplier payments that are past their due date.`,
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
    receivables: receivables.map((r: any) => ({
      id: r.id,
      customerName: r.customerName,
      outstandingAmount: Number(r.outstandingAmount),
      dueDate: r.dueDate,
      status: r.status,
    })),
    payables: payables.map((p: any) => ({
      id: p.id,
      supplierName: p.supplierName,
      outstandingAmount: Number(p.outstandingAmount),
      dueDate: p.dueDate,
      status: p.status,
    })),
  })
}
