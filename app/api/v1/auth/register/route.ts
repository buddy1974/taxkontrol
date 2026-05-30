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
    const { name, email, password, businessName } = await req.json()

    if (!email || !password || !name) {
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

    if (typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
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

    const user = await db.user.create({
      data: {
        name: String(name).trim(),
        email: normalizedEmail,
        passwordHash,
        businessName: businessName || null,
      },
    })

    return NextResponse.json(
      { success: true, userId: user.id },
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
