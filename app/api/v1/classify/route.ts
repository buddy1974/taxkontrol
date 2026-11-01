import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { classifyTransaction } from '@/lib/ai/classify'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { jsonError, oneOf, optionalString, parseAmount, readJsonObject } from '@/lib/http'

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 60 classifications per hour per user
  const rl = await rateLimit(`classify:${user.id}`, 60, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')
  const description = optionalString(body.description, 300)
  const merchant = optionalString(body.merchant, 120)
  if (description === undefined && body.description !== undefined) return jsonError(400, 'description must be text.', { field: 'description' })
  if (merchant === undefined && body.merchant !== undefined) return jsonError(400, 'merchant must be text.', { field: 'merchant' })
  if (!description && !merchant) return jsonError(400, 'description or merchant required')
  const type = body.type === undefined ? 'EXPENSE' : oneOf(body.type, ['INCOME', 'EXPENSE'] as const)
  if (!type) return jsonError(400, 'type must be INCOME or EXPENSE.', { field: 'type' })
  const amount = body.amount === undefined || body.amount === null ? 0 : parseAmount(body.amount)
  if (amount === undefined) return jsonError(400, 'amount must be a non-negative number.', { field: 'amount' })

  const result = await classifyTransaction(description ?? '', merchant ?? null, amount, type)

  return NextResponse.json(result)
}
