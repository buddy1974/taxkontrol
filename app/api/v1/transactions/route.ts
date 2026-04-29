import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const limit = parseInt(searchParams.get('limit') ?? '50')
  const offset = parseInt(searchParams.get('offset') ?? '0')

  const transactions = await db.transaction.findMany({
    where: {
      userId: session.user.id,
      ...(type ? { type: type as 'INCOME' | 'EXPENSE' } : {}),
    },
    include: { category: true },
    orderBy: { transactionDate: 'desc' },
    take: limit,
    skip: offset,
  })

  return NextResponse.json(
    transactions.map(t => ({
      ...t,
      amount: Number(t.amount),
      grossAmount: Number(t.grossAmount),
      netAmount: Number(t.netAmount),
      vatAmount: Number(t.vatAmount),
      vatRate: Number(t.vatRate),
      businessAmount: Number(t.businessAmount),
      privateAmount: Number(t.privateAmount),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      type,
      grossAmount,
      vatRate = 0,
      description,
      merchant,
      categoryId,
      usage = 'BUSINESS',
      businessPct = 100,
      paymentMethod = 'BANK',
      transactionDate,
    } = body

    if (!type || !grossAmount || !transactionDate) {
      return NextResponse.json(
        { error: 'type, grossAmount and transactionDate are required.' },
        { status: 400 }
      )
    }

    const gross = parseFloat(grossAmount)
    const vatMultiplier = 1 + vatRate / 100
    const net = gross / vatMultiplier
    const vat = gross - net
    const businessAmount = type === 'EXPENSE'
      ? (net * businessPct) / 100
      : net
    const privateAmount = type === 'EXPENSE'
      ? net - businessAmount
      : 0

    const transaction = await db.transaction.create({
      data: {
        userId: session.user.id,
        type,
        amount: gross,
        grossAmount: gross,
        netAmount: parseFloat(net.toFixed(2)),
        vatAmount: parseFloat(vat.toFixed(2)),
        vatRate,
        description,
        merchant,
        categoryId: categoryId || null,
        usage,
        businessPct,
        businessAmount: parseFloat(businessAmount.toFixed(2)),
        privateAmount: parseFloat(privateAmount.toFixed(2)),
        paymentMethod,
        transactionDate: new Date(transactionDate),
      },
    })

    return NextResponse.json({
      ...transaction,
      amount: Number(transaction.amount),
      grossAmount: Number(transaction.grossAmount),
      netAmount: Number(transaction.netAmount),
      vatAmount: Number(transaction.vatAmount),
      businessAmount: Number(transaction.businessAmount),
      privateAmount: Number(transaction.privateAmount),
    }, { status: 201 })
  } catch (err) {
    console.error('Transaction create error:', err)
    return NextResponse.json(
      { error: 'Failed to create transaction.' },
      { status: 500 }
    )
  }
}
