import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { r2Storage } from '@/lib/r2'
import { processPendingDeletions } from '@/lib/account/storageCleanup'
import { requireCronSecret } from '@/lib/cronAuth'

/** Idempotency records are only needed for retries; kept 30 days. */
const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 3600 * 1000

/**
 * Daily job (Vercel Cron, see vercel.json): retries queued storage deletions of deleted
 * accounts and purges old idempotency records. Requires `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const denied = requireCronSecret(req)
  if (denied) return denied
  const storage = await processPendingDeletions(db, r2Storage, { limit: 200 })
  const purged = await db.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_RETENTION_MS) } } })
  return NextResponse.json({ ...storage, idempotencyRecordsPurged: purged.count })
}
