import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { isDevBypassEnabled, ensureDevUser } from '@/lib/devAuth'

export interface CurrentUser {
  id: string
  email: string
  name?: string | null
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth()
  if (session?.user?.id) {
    // Sessions are JWTs and cannot be revoked server-side. A token of a deleted
    // account must not keep writing data (GDPR Art. 17), so the account is
    // checked on every request.
    const exists = await db.user.findUnique({ where: { id: session.user.id }, select: { id: true } })
    if (!exists) return null
    return {
      id: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name,
    }
  }

  if (isDevBypassEnabled()) {
    const devUser = await ensureDevUser()
    if (devUser) {
      return { id: devUser.id, email: devUser.email, name: devUser.name }
    }
  }

  return null
}

// Use this in API routes as a drop-in replacement for the auth() + 401 pattern
export async function requireCurrentUser(): Promise<CurrentUser | null> {
  return getCurrentUser()
}
