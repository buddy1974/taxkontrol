import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/**
 * Every route under /api/cron is public in proxy.ts and MUST call this first.
 * Returns an error response, or null when `Authorization: Bearer <CRON_SECRET>` matches.
 * Without CRON_SECRET configured, cron jobs are off (503).
 */
export function requireCronSecret(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET
  if (!secret) return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
