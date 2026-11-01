import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { extractFromText } from '@/lib/ai/extract'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { jsonError, optionalString, readJsonObject } from '@/lib/http'

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 30 extractions per hour per user
  const rl = await rateLimit(`extract:${user.id}`, 30, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const body = await readJsonObject(req)
  const text = optionalString(body?.text, 2000)
  if (!text) return jsonError(400, 'text required (up to 2000 characters).', { field: 'text' })

  const result = await extractFromText(text)
  return NextResponse.json(result)
}
