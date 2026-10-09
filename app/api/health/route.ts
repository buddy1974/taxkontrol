import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Liveness + database reachability. Returns no configuration details, only
 * whether each dependency answered. Used by uptime monitoring.
 */
export async function GET() {
  const started = Date.now()
  let database: 'ok' | 'error' = 'ok'
  try {
    await db.$queryRaw`SELECT 1`
  } catch {
    database = 'error'
  }
  const body = {
    status: database === 'ok' ? 'ok' : 'degraded',
    database,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'unknown',
    ms: Date.now() - started,
  }
  return NextResponse.json(body, { status: database === 'ok' ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
