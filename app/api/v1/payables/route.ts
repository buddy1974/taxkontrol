import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const payables = await db.payable.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json(
    payables.map((p: any) => ({
      ...p,
      totalAmount: Number(p.totalAmount),
      paidAmount: Number(p.paidAmount),
      outstandingAmount: Number(p.outstandingAmount),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { supplierName, description, totalAmount, dueDate } = await req.json()

  if (!supplierName || !totalAmount) {
    return NextResponse.json({ error: 'supplierName and totalAmount required' }, { status: 400 })
  }

  const p = await db.payable.create({
    data: {
      userId: session.user.id,
      supplierName,
      description: description ?? null,
      totalAmount: parseFloat(totalAmount),
      paidAmount: 0,
      outstandingAmount: parseFloat(totalAmount),
      dueDate: dueDate ? new Date(dueDate) : null,
      status: 'OPEN',
    },
  })

  return NextResponse.json({
    ...p,
    totalAmount: Number(p.totalAmount),
    paidAmount: Number(p.paidAmount),
    outstandingAmount: Number(p.outstandingAmount),
  }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, paidAmount } = await req.json()

  const existing = await db.payable.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const total = Number(existing.totalAmount)
  const paid = parseFloat(paidAmount)
  const outstanding = Math.max(0, total - paid)
  const status = outstanding === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'OPEN'

  const updated = await db.payable.update({
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
