import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { extractFromText } from '@/lib/ai/extract'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 30 extractions per hour per user
  const rl = await rateLimit(`extract:${user.id}`, 30, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const result = await extractFromText(text)
  return NextResponse.json(result)
}
