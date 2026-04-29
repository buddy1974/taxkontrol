import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import SafeToSpendCard from '@/components/dashboard/SafeToSpendCard'
import TaxReserveBar from '@/components/dashboard/TaxReserveBar'
import WarningBanner from '@/components/dashboard/WarningBanner'
import MoneyFlowSummary from '@/components/dashboard/MoneyFlowSummary'

async function getDashboardData(userId: string) {
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
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      db.payable.findMany({
        where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
    ])

  const totalIncome = Number(income._sum.netAmount ?? 0)
  const totalExpenses = Number(expenses._sum.businessAmount ?? 0)
  const totalFixedCosts = Number(fixedCosts._sum.amount ?? 0)

  const taxOwed = taxReserves.reduce((sum, r) => sum + Number(r.shouldHave), 0)
  const taxReserved = taxReserves.reduce((sum, r) => sum + Number(r.actuallyReserved), 0)
  const taxMissing = Math.max(0, taxOwed - taxReserved)
  const safeToSpend = Math.max(0, totalIncome - totalExpenses - totalFixedCosts - taxOwed)

  const warnings: { id: string; type: string; severity: 'low' | 'medium' | 'high'; message: string }[] = []

  if (taxMissing > 0) {
    warnings.push({
      id: 'low-tax-reserve',
      type: 'LOW_TAX_RESERVE',
      severity: taxMissing > 500 ? 'high' : 'medium',
      message: `You are missing €${taxMissing.toFixed(2)} in your tax reserve (Steuerrücklage).`,
    })
  }

  const overdueReceivables = receivables.filter(r => r.dueDate && new Date(r.dueDate) < now)
  if (overdueReceivables.length > 0) {
    const total = overdueReceivables.reduce((sum, r) => sum + Number(r.outstandingAmount), 0)
    warnings.push({
      id: 'overdue-receivable',
      type: 'OVERDUE_RECEIVABLE',
      severity: 'medium',
      message: `${overdueReceivables.length} customer(s) owe you €${total.toFixed(2)} past due date.`,
    })
  }

  const overduePayables = payables.filter(p => p.dueDate && new Date(p.dueDate) < now)
  if (overduePayables.length > 0) {
    const total = overduePayables.reduce((sum, p) => sum + Number(p.outstandingAmount), 0)
    warnings.push({
      id: 'overdue-payable',
      type: 'OVERDUE_PAYABLE',
      severity: 'high',
      message: `You owe €${total.toFixed(2)} to supplier(s) past due date.`,
    })
  }

  return {
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
  }
}

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const data = await getDashboardData(session.user.id)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">{data.month}</p>
      </div>

      <WarningBanner warnings={data.warnings} />

      <SafeToSpendCard amount={data.safeToSpend} />

      <TaxReserveBar
        taxOwed={data.taxOwed}
        taxReserved={data.taxReserved}
        taxMissing={data.taxMissing}
      />

      <MoneyFlowSummary
        totalIncome={data.totalIncome}
        totalExpenses={data.totalExpenses}
        totalFixedCosts={data.totalFixedCosts}
        taxOwed={data.taxOwed}
      />

      {data.receivables.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-white mb-3">
            Customers owe you (Offene Forderungen)
          </h2>
          <div className="space-y-2">
            {data.receivables.map(r => (
              <div key={r.id} className="flex justify-between text-sm">
                <span className="text-gray-400">{r.customerName}</span>
                <span className="text-emerald-400 font-medium">
                  €{r.outstandingAmount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.payables.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-white mb-3">
            You owe suppliers (Offene Verbindlichkeiten)
          </h2>
          <div className="space-y-2">
            {data.payables.map(p => (
              <div key={p.id} className="flex justify-between text-sm">
                <span className="text-gray-400">{p.supplierName}</span>
                <span className="text-red-400 font-medium">
                  €{p.outstandingAmount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
