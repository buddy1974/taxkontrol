import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const receivables = await db.receivable.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    receivables.map(r => ({
      ...r,
      totalAmount: Number(r.totalAmount),
      paidAmount: Number(r.paidAmount),
      outstandingAmount: Number(r.outstandingAmount),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { customerName, description, totalAmount, dueDate } = await req.json()

  if (!customerName || !totalAmount) {
    return NextResponse.json({ error: 'customerName and totalAmount required' }, { status: 400 })
  }

  const r = await db.receivable.create({
    data: {
      userId: session.user.id,
      customerName,
      description: description ?? null,
      totalAmount: parseFloat(totalAmount),
      paidAmount: 0,
      outstandingAmount: parseFloat(totalAmount),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'OPEN',
    },
  })

  return NextResponse.json({
    ...r,
    totalAmount: Number(r.totalAmount),
    paidAmount: Number(r.paidAmount),
    outstandingAmount: Number(r.outstandingAmount),
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, paidAmount } = await req.json()

  const existing = await db.receivable.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const total = Number(existing.totalAmount)
  const paid = parseFloat(paidAmount)
  const outstanding = Math.max(0, total - paid)
  const status = outstanding === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN'

  const updated = await db.receivable.update({
    where: { id },
    data: { paidAmount: paid, outstandingAmount: outstanding, status },
  })

  return NextResponse.json({
    ...updated,
    totalAmount: Number(updated.totalAmount),
    paidAmount: Number(updated.paidAmount),
    outstandingAmount: Number(updated.outstandingAmount),
  })
}
