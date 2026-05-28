/**
 * Simple in-memory rate limiter.
 * Acceptable for MVP / single-instance deployments.
 * TODO: Replace with Redis/Upstash for multi-instance production scaling.
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

/**
 * @param key      Unique key (e.g. IP, userId, or "ip:userId")
 * @param limit    Max requests allowed in the window
 * @param windowMs Time window in milliseconds
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
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
