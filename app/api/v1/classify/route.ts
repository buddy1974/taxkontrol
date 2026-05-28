import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { classifyTransaction } from '@/lib/ai/classify'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 60 classifications per hour per user
  const rl = rateLimit(`classify:${session.user.id}`, 60, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const { description, merchant, amount, type } = await req.json()

  if (!description && !merchant) {
    return NextResponse.json({ error: 'description or merchant required' }, { status: 400 })
  }

  const result = await classifyTransaction(
    description ?? '',
    merchant ?? null,
    parseFloat(amount ?? 0),
    type ?? 'EXPENSE'
  )

  return NextResponse.json(result)
}
