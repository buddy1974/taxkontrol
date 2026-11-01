import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { lockFor } from '@/lib/locks'
import { jsonError } from '@/lib/http'

/**
 * Idempotent money writes (recording a payment on an invoice, a bill or with the
 * Finanzamt). The client sends an `Idempotency-Key` header, created once per form
 * submission and re-sent on retries. The first request with a key does the work inside one
 * database transaction and stores its response; a retry or a double submit with the same key
 * waits for the first (advisory lock) and gets the stored response — nothing is booked twice.
 * Only successful responses are stored, so a corrected retry after a 4xx is processed.
 * Without the header the request is processed normally (old clients, scripts).
 */
export interface HandlerResult {
  status: number
  body: unknown
}

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/

/**
 * `fingerprint` is the parsed request body: a retry with the same key but different content
 * (e.g. the amount was edited) is refused (422) instead of silently returning the old answer.
 */
export async function withIdempotency(
  req: Request,
  userId: string,
  scope: string,
  handler: (tx: Prisma.TransactionClient) => Promise<HandlerResult>,
  fingerprint: unknown = null
): Promise<NextResponse> {
  const key = req.headers.get('idempotency-key')
  if (key !== null && !KEY_PATTERN.test(key)) return jsonError(400, 'Invalid Idempotency-Key header.')
  const scoped = `${scope}#${createHash('sha256').update(JSON.stringify(fingerprint ?? null)).digest('hex').slice(0, 32)}`

  const result = await db.$transaction(
    async tx => {
      if (key !== null) {
        await lockFor(tx, `idem:${userId}:${key}`)
        const existing = await tx.idempotencyRecord.findUnique({ where: { userId_key: { userId, key } } })
        if (existing) {
          if (existing.scope !== scoped) {
            return existing.scope.split('#')[0] === scope
              ? { status: 422, body: { error: 'This request was already sent with different values. Reload and try again.' }, replay: false }
              : { status: 409, body: { error: 'This request key was already used for a different action.' }, replay: false }
          }
          return { status: existing.status, body: existing.response, replay: true }
        }
      }
      const r = await handler(tx)
      if (key !== null && r.status >= 200 && r.status < 300) {
        await tx.idempotencyRecord.create({ data: { userId, key, scope: scoped, status: r.status, response: JSON.parse(JSON.stringify(r.body)) as Prisma.InputJsonValue } })
      }
      return { ...r, replay: false }
    },
    { timeout: 15_000 }
  )
  return NextResponse.json(result.body, { status: result.status, headers: result.replay ? { 'Idempotent-Replayed': 'true' } : undefined })
}
