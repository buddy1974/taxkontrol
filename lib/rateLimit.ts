/**
 * Rate limiter with a durable backend for serverless/multi-instance deployments.
 *
 * - When UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN are set, limits are
 *   enforced in Redis (shared across all Vercel instances and cold starts).
 * - Otherwise it falls back to an in-memory Map (single-instance / local dev).
 *
 * The function is fail-open: if the Redis call errors, it degrades to the
 * in-memory limiter rather than locking users out.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

const store = new Map<string, RateLimitEntry>()

// Purge expired entries every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) store.delete(key)
  }
}, 5 * 60 * 1000)

export interface RateLimitResult {
  allowed: boolean
  retryAfter: number // seconds until reset, 0 if allowed
}

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

function inMemoryLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()
  const existing = store.get(key)

  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfter: 0 }
  }

  if (existing.count >= limit) {
    const retryAfter = Math.ceil((existing.resetAt - now) / 1000)
    return { allowed: false, retryAfter }
  }

  existing.count++
  return { allowed: true, retryAfter: 0 }
}

/** Execute an Upstash REST pipeline. Throws on any transport/HTTP error. */
async function upstashPipeline(commands: Array<Array<string | number>>): Promise<unknown[]> {
  const res = await fetch(`${UPSTASH_URL}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
    // Never let a slow Redis hang an API route
    signal: AbortSignal.timeout(2000),
  })
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`)
  const data = (await res.json()) as Array<{ result?: unknown; error?: string }>
  return data.map(d => {
    if (d.error) throw new Error(`Upstash cmd error: ${d.error}`)
    return d.result
  })
}

async function redisLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  // INCR the counter; set the TTL only on first hit (PEXPIRE ... NX).
  const [countRaw] = await upstashPipeline([
    ['INCR', `rl:${key}`],
    ['PEXPIRE', `rl:${key}`, windowMs, 'NX'],
  ])
  const count = Number(countRaw)

  if (count <= limit) return { allowed: true, retryAfter: 0 }

  // Over the limit — fetch remaining TTL for an accurate Retry-After.
  let retryAfter = Math.ceil(windowMs / 1000)
  try {
    const [pttlRaw] = await upstashPipeline([['PTTL', `rl:${key}`]])
    const pttl = Number(pttlRaw)
    if (pttl > 0) retryAfter = Math.ceil(pttl / 1000)
  } catch {
    // keep window-based fallback
  }
  return { allowed: false, retryAfter }
}

/**
 * @param key      Unique key (e.g. IP, userId, or "ip:userId")
 * @param limit    Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    try {
      return await redisLimit(key, limit, windowMs)
    } catch (err) {
      // Fail open to the in-memory limiter — availability over strictness.
      console.error('Rate limiter (Redis) failed, falling back to in-memory:', err)
    }
  }
  return inMemoryLimit(key, limit, windowMs)
}

/** Extract best-available IP from a Next.js request */
export function getIp(req: Request): string {
  const fwd = (req.headers as Headers).get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim()
  const real = (req.headers as Headers).get('x-real-ip')
  return real ?? 'unknown'
}

/** Standard 429 response */
export function rateLimitResponse(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.', retryAfter }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
      },
    }
  )
}
