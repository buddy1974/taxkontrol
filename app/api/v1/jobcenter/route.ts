import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const records = await db.jobcenterRecord.findMany({
    where: { userId: session.user.id },
    orderBy: { periodStart: 'desc' },
  })

  return NextResponse.json(
    records.map((r: any) => ({
      ...r,
      totalIncome: Number(r.totalIncome),
      totalExpenses: Number(r.totalExpenses),
      netProfit: Number(r.netProfit),
      freibetrag: Number(r.freibetrag),
      anrechenbares: Number(r.anrechenbares),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { periodStart, periodEnd, type } = await req.json()
  if (!periodStart || !periodEnd || !type) {
    return NextResponse.json({ error: 'periodStart, periodEnd and type required' }, { status: 400 })
  }

  const start = new Date(periodStart)
  const end = new Date(periodEnd)

  const [income, expenses] = await Promise.all([
    db.transaction.aggregate({
      where: { userId: session.user.id, type: 'INCOME', transactionDate: { gte: start, lte: end } },
      _sum: { netAmount: true },
    }),
    db.transaction.aggregate({
      where: { userId: session.user.id, type: 'EXPENSE', transactionDate: { gte: start, lte: end } },
      _sum: { businessAmount: true },
    }),
  ])

  const totalIncome = Number(income._sum.netAmount ?? 0)
  const totalExpenses = Number(expenses._sum.businessAmount ?? 0)
  const netProfit = totalIncome - totalExpenses
  const freibetrag = 100
  const anrechenbares = Math.max(0, (netProfit - freibetrag) * 0.3)

  const record = await db.jobcenterRecord.create({
    data: {
      userId: session.user.id,
      periodStart: start,
      periodEnd: end,
      type,
      totalIncome,
      totalExpenses,
      netProfit,
      freibetrag,
      anrechenbares,
      status: 'DRAFT',
    },
  })

  return NextResponse.json({
    ...record,
    totalIncome: Number(record.totalIncome),
    totalExpenses: Number(record.totalExpenses),
    netProfit: Number(record.netProfit),
    freibetrag: Number(record.freibetrag),
    anrechenbares: Number(record.anrechenbares),
  }, { status: 201 })
}
