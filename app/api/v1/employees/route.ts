import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const employees = await db.employee.findMany({
    where: { userId: session.user.id },
    include: { payments: { orderBy: { period: 'desc' }, take: 3 } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(
    employees.map((e: any) => ({
      ...e,
      salaryAmount: Number(e.salaryAmount),
      payments: e.payments.map((p: any) => ({ ...p, amount: Number(p.amount) })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, role, salaryType, salaryAmount } = await req.json()
  if (!name || !salaryAmount) return NextResponse.json({ error: 'name and salaryAmount required' }, { status: 400 })

  const employee = await db.employee.create({
    data: {
      userId: session.user.id,
      name,
      role: role ?? null,
      salaryType: salaryType ?? 'MONTHLY',
      salaryAmount: parseFloat(salaryAmount),
      isActive: true,
    },
  })

  return NextResponse.json({ ...employee, salaryAmount: Number(employee.salaryAmount), payments: [] }, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action, period, amount } = await req.json()

  const employee = await db.employee.findFirst({ where: { id, userId: session.user.id } })
  if (!employee) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'pay') {
    const payment = await db.employeePayment.create({
      data: {
        employeeId: id,
        amount: amount ?? Number(employee.salaryAmount),
        period: period ? new Date(period) : new Date(),
        paidAt: new Date(),
        isPaid: true,
      },
    })
    return NextResponse.json({ ...payment, amount: Number(payment.amount) })
  }

  if (action === 'deactivate') {
    const updated = await db.employee.update({ where: { id }, data: { isActive: false } })
    return NextResponse.json({ ...updated, salaryAmount: Number(updated.salaryAmount) })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
