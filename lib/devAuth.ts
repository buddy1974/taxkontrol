import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { isLocalDatabaseUrl } from '@/lib/dbTarget'

/**
 * Local review mode: skips login and acts as a fixed dev user.
 * Enabled only when ALL of these hold:
 *  - not running on Vercel (any environment),
 *  - NODE_ENV === 'development',
 *  - DEV_BYPASS_LOGIN === 'true',
 *  - DATABASE_URL points at a local database (or DEV_BYPASS_ALLOW_REMOTE_DB
 *    === 'true' is set deliberately), so the bypass can never write a dev user
 *    into a shared or production database by accident.
 */
export function isDevBypassEnabled(): boolean {
  if (process.env.VERCEL === '1' || process.env.VERCEL_ENV) return false
  if (process.env.NODE_ENV !== 'development') return false
  if (process.env.DEV_BYPASS_LOGIN !== 'true') return false
  if (!isLocalDatabaseUrl(process.env.DATABASE_URL) && process.env.DEV_BYPASS_ALLOW_REMOTE_DB !== 'true') {
    return false
  }
  return true
}

export function getDevBypassEmail(): string {
  return process.env.DEV_BYPASS_EMAIL || 'test@taxkontrol.local'
}

export async function ensureDevUser() {
  if (!isDevBypassEnabled()) return null

  const email = getDevBypassEmail().toLowerCase()
  // Random, never-used password: the dev user cannot log in through the form.
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10)

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
