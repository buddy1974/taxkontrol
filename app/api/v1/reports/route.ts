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

  const transactions = await db.transaction.findMany({
    where: { userId, transactionDate: { gte: startOfMonth, lte: endOfMonth } },
    include: { category: true },
  })

  const income = transactions.filter((t: any) => t.type === 'INCOME')
  const expenses = transactions.filter((t: any) => t.type === 'EXPENSE')

  const totalIncome = income.reduce((sum: number, t: any) => sum + Number(t.netAmount), 0)
  const totalExpenses = expenses.reduce((sum: number, t: any) => sum + Number(t.businessAmount), 0)
  const netProfit = totalIncome - totalExpenses
  const vatCollected = income.reduce((sum: number, t: any) => sum + Number(t.vatAmount), 0)
  const vatPaid = expenses.reduce((sum: number, t: any) => sum + Number(t.vatAmount) * (Number(t.businessPct) / 100), 0)
  const vatOwed = vatCollected - vatPaid

  const categoryMap = new Map<string, { name: string; total: number; type: string }>()
  for (const t of transactions) {
    const catName = (t as any).category?.name ?? 'Uncategorised'
    const key = `${t.type}-${catName}`
    const existing = categoryMap.get(key)
    const amount = t.type === 'INCOME' ? Number(t.netAmount) : Number((t as any).businessAmount)
    if (existing) { existing.total += amount }
    else { categoryMap.set(key, { name: catName, total: amount, type: t.type }) }
  }

  return NextResponse.json({
    month: now.toLocaleString('en-DE', { month: 'long', year: 'numeric' }),
    totalIncome,
    totalExpenses,
    netProfit,
    vatCollected,
    vatPaid,
    vatOwed,
    categories: Array.from(categoryMap.values()).sort((a: any, b: any) => b.total - a.total),
  })
}
