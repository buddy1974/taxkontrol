import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { createTransaction, parseTransactionInput, serializeTransaction } from '@/lib/transactions/service'
import { clampInt, jsonError, readJsonObject, unauthorized } from '@/lib/http'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

export async function GET(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  const limit = clampInt(searchParams.get('limit'), 1, 200, 50)
  const offset = clampInt(searchParams.get('offset'), 0, 100_000, 0)
  const reviewOnly = searchParams.get('review') === '1'

  const transactions = await db.transaction.findMany({
    where: {
      userId: user.id,
      ...(type === 'INCOME' || type === 'EXPENSE' ? { type } : {}),
      ...(reviewOnly ? { needsReview: true } : {}),
    },
    include: { category: true },
    orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }],
    take: limit,
    skip: offset,
  })

  return NextResponse.json(transactions.map(serializeTransaction))
}

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`transactions:${user.id}`, 300, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  try {
    const input = parseTransactionInput(body)
    const transaction = await db.$transaction(tx => createTransaction(user.id, input, { source: 'USER' }, tx))
    return NextResponse.json(serializeTransaction(transaction), { status: 201 })
  } catch (err) {
    if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field })
    console.error('Transaction create error:', err)
    return jsonError(500, 'Failed to create transaction.')
  }
}
