/**
 * The real getCurrentUser (other integration tests mock it): a JWT of a deleted
 * account must not authenticate anything (GDPR Art. 17 — no writes after deletion).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, resetDatabase } from './helpers'

const session = vi.hoisted(() => ({ value: null as null | { user: { id: string; email: string; name: string | null } } }))
vi.mock('@/lib/auth', () => ({ auth: async () => session.value }))

const { getCurrentUser } = await vi.importActual<typeof import('@/lib/getCurrentUser')>('@/lib/getCurrentUser')

describe('session of a deleted account', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('a valid session of an existing user authenticates', async () => {
    const u = await createUser()
    session.value = { user: { id: u.id, email: u.email, name: u.name } }
    expect((await getCurrentUser())?.id).toBe(u.id)
  })

  it('the same session stops working once the account is deleted', async () => {
    const u = await createUser()
    session.value = { user: { id: u.id, email: u.email, name: u.name } }
    await db.taxProfile.deleteMany({ where: { userId: u.id } })
    await db.user.delete({ where: { id: u.id } })
    expect(await getCurrentUser()).toBeNull()
  })
})
