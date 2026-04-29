import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const costs = await db.fixedCost.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(
    costs.map((c: any) => ({ ...c, amount: Number(c.amount) }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { name, amount, usage, frequency, dayOfMonth, categoryId } = await req.json()

  if (!name || !amount) {
    return NextResponse.json({ error: 'name and amount required' }, { status: 400 })
  }

  const cost = await db.fixedCost.create({
    data: {
      userId: session.user.id,
      name,
      amount: parseFloat(amount),
      usage: usage ?? 'BUSINESS',
      frequency: frequency ?? 'MONTHLY',
      dayOfMonth: dayOfMonth ?? 1,
      isActive: true,
      categoryId: categoryId ?? null,
    },
  })

  return NextResponse.json({ ...cost, amount: Number(cost.amount) }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, ...data } = await req.json()

  const existing = await db.fixedCost.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await db.fixedCost.update({
    where: { id },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.amount !== undefined && { amount: parseFloat(data.amount) }),
      ...(data.usage !== undefined && { usage: data.usage }),
      ...(data.frequency !== undefined && { frequency: data.frequency }),
      ...(data.dayOfMonth !== undefined && { dayOfMonth: data.dayOfMonth }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  })

  return NextResponse.json({ ...updated, amount: Number(updated.amount) })
}
