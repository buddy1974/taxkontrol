import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const closes = await db.dailyClose.findMany({
    where: { userId: session.user.id },
    orderBy: { date: 'desc' },
    take: 30,
  })

  return NextResponse.json(
    closes.map((c: any) => ({
      ...c,
      cashStart: Number(c.cashStart),
      cashSales: Number(c.cashSales),
      cashExpenses: Number(c.cashExpenses),
      cashEnd: Number(c.cashEnd),
      cashDiff: Number(c.cashDiff),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { date, cashStart, cashSales, cashExpenses, cashEnd, notes } = await req.json()

  const start = parseFloat(cashStart ?? 0)
  const sales = parseFloat(cashSales ?? 0)
  const expenses = parseFloat(cashExpenses ?? 0)
  const end = parseFloat(cashEnd ?? 0)
  const expected = start + sales - expenses
  const diff = end - expected

  const existing = await db.dailyClose.findFirst({
    where: { userId: session.user.id, date: new Date(date) },
  })

  const data = {
    cashStart: start, cashSales: sales, cashExpenses: expenses,
    cashEnd: end, cashDiff: diff, notes: notes ?? null, closedAt: new Date(),
  }

  const close = existing
    ? await db.dailyClose.update({ where: { id: existing.id }, data })
    : await db.dailyClose.create({ data: { userId: session.user.id, date: new Date(date), ...data } })

  return NextResponse.json({
    ...close,
    cashStart: Number(close.cashStart),
    cashSales: Number(close.cashSales),
    cashExpenses: Number(close.cashExpenses),
    cashEnd: Number(close.cashEnd),
    cashDiff: Number(close.cashDiff),
  }, { status: 201 })
}
