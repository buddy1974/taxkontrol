import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const warnings = []

  const [taxReserves, receivables, payables, transactions] = await Promise.all([
    db.taxReserve.findMany({ where: { userId } }),
    db.receivable.findMany({ where: { userId, status: { in: ['OPEN', 'PARTIAL'] } } }),
    db.payable.findMany({ where: { userId, status: { in: ['OPEN', 'PARTIAL'] } } }),
    db.transaction.findMany({ where: { userId, transactionDate: { gte: startOfMonth, lte: endOfMonth } }, orderBy: { transactionDate: 'desc' } }),
  ])

  const taxMissing = taxReserves.reduce((sum: number, r: any) => sum + Number(r.missing), 0)
  if (taxMissing > 0) {
    warnings.push({ id: 'low-tax-reserve', type: 'LOW_TAX_RESERVE', severity: taxMissing > 500 ? 'high' : 'medium', message: `You are missing €${taxMissing.toFixed(2)} in your tax reserve (Steuerrücklage).` })
  }

  const overdueReceivables = receivables.filter((r: any) => r.dueDate && new Date(r.dueDate) < now)
  if (overdueReceivables.length > 0) {
    const total = overdueReceivables.reduce((sum: number, r: any) => sum + Number(r.outstandingAmount), 0)
    warnings.push({ id: 'overdue-receivable', type: 'OVERDUE_RECEIVABLE', severity: 'medium', message: `${overdueReceivables.length} customer(s) owe you €${total.toFixed(2)} past due date.` })
  }

  const overduePayables = payables.filter((p: any) => p.dueDate && new Date(p.dueDate) < now)
  if (overduePayables.length > 0) {
    const total = overduePayables.reduce((sum: number, p: any) => sum + Number(p.outstandingAmount), 0)
    warnings.push({ id: 'overdue-payable', type: 'OVERDUE_PAYABLE', severity: 'high', message: `You owe €${total.toFixed(2)} to supplier(s) past due date.` })
  }

  if (transactions.length === 0) {
    warnings.push({ id: 'no-transactions', type: 'MISSING_RECEIPTS', severity: 'low', message: 'No transactions recorded this month. Have you added all your income and expenses?' })
  }

  return NextResponse.json(warnings)
}
