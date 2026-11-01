/**
 * Every API handler, called without a session, must answer 401 and change nothing.
 * Route modules are discovered from the file system, so a new route is covered
 * automatically. Public endpoints are listed explicitly.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { db } from '@/lib/db'
import { jsonRequest, resetDatabase, setCurrentUser } from './helpers'

const modules = import.meta.glob('../../app/api/v1/**/route.ts')
const PUBLIC = new Set(['../../app/api/v1/contact/route.ts', '../../app/api/v1/auth/register/route.ts'])
const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const

describe('anonymous access to every API handler', () => {
  beforeAll(async () => {
    await resetDatabase()
    setCurrentUser(null)
  })

  it('discovers the route modules', () => {
    expect(Object.keys(modules).length).toBeGreaterThan(30)
  })

  for (const [path, load] of Object.entries(modules)) {
    if (PUBLIC.has(path)) continue
    it(`${path.replace('../../app', '')} answers 401 for every method`, async () => {
      const mod = (await load()) as Record<string, unknown>
      const handlers = METHODS.filter(m => typeof mod[m] === 'function')
      expect(handlers.length).toBeGreaterThan(0)
      for (const m of handlers) {
        const req = jsonRequest('/api/x?id=someone-elses-id', m, m === 'GET' || m === 'DELETE' ? undefined : { id: 'someone-elses-id', amount: 1 })
        const res = (await (mod[m] as (r: unknown, c: unknown) => Promise<Response>)(req, { params: Promise.resolve({ id: 'someone-elses-id' }) })) as Response
        expect(res.status, `${m} ${path}`).toBe(401)
      }
    })
  }

  it('nothing was written', async () => {
    const [t, d, a] = await Promise.all([db.transaction.count(), db.document.count(), db.auditEvent.count()])
    expect(t + d + a).toBe(0)
  })
})
