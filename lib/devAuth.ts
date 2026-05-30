import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'

export function isDevBypassEnabled(): boolean {
  // Hard production guard: never allow the auth bypass on a deployed
  // (Vercel) environment, even if DEV_BYPASS_LOGIN is accidentally set there.
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV === 'production') {
    return false
  }
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.DEV_BYPASS_LOGIN === 'true'
  )
}

export function getDevBypassEmail(): string {
  return process.env.DEV_BYPASS_EMAIL || 'test@taxkontrol.local'
}

export async function ensureDevUser() {
  if (!isDevBypassEnabled()) return null

  const email = getDevBypassEmail().toLowerCase()
  const passwordHash = await bcrypt.hash('dev-local-only-not-a-real-password', 10)

  return db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: 'Dev Tester',
      passwordHash,
      taxType: 'KLEINUNTERNEHMER',
    },
  })
}
