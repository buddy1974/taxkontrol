import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  // 5 registrations per IP per 15 minutes
  const ip = getIp(req)
  const rl = await rateLimit(`register:${ip}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
    }
    const { name, email, password, businessName } = body as Record<string, unknown>

    if (typeof email !== 'string' || typeof password !== 'string' || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json(
        { error: 'Name, email and password are required.' },
        { status: 400 }
      )
    }

    // Normalize email so casing/whitespace can't create duplicate or
    // unreachable accounts. Login normalizes the same way.
    const normalizedEmail = String(email).trim().toLowerCase()

    // Basic format validation
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!EMAIL_RE.test(normalizedEmail)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    if (normalizedEmail.length > 254) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    // bcrypt only uses the first 72 bytes; refuse longer input instead of silently truncating it.
    if (password.length < 10 || Buffer.byteLength(password, 'utf8') > 72) {
      return NextResponse.json(
        { error: 'Password must be 10 to 72 characters long.' },
        { status: 400 }
      )
    }

    const existing = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists.' },
        { status: 409 }
      )
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await db.user.create({
      data: {
        name: name.trim().slice(0, 120),
        email: normalizedEmail,
        passwordHash,
        businessName: typeof businessName === 'string' && businessName.trim() ? businessName.trim().slice(0, 160) : null,
      },
    })

    return NextResponse.json(
      { success: true },
      { status: 201 }
    )
  } catch (err) {
    console.error('Register error:', err)
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
