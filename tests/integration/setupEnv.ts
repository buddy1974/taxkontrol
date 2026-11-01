import { vi } from 'vitest'
import { assertSafeTestDatabase, TEST_DATABASE_URL } from './testDb'

assertSafeTestDatabase()
process.env.DATABASE_URL = TEST_DATABASE_URL
// AI and object storage are never called from integration tests.
delete process.env.ANTHROPIC_API_KEY
delete process.env.UPSTASH_REDIS_REST_URL

// The signed-in user is controlled per test via setCurrentUser().
const state = vi.hoisted(() => ({ user: null as null | { id: string; email: string; name: string | null } }))

vi.mock('@/lib/getCurrentUser', () => ({
  getCurrentUser: async () => state.user,
  requireCurrentUser: async () => state.user,
}))

// Object storage double: tests can make it fail (outage) and inspect deleted keys.
// Reachable from tests as globalThis.__r2State (a hoisted variable cannot be exported).
const r2State = vi.hoisted(() => {
  const st = { fail: false, deleted: [] as string[], objects: [] as string[] }
  ;(globalThis as unknown as { __r2State: typeof st }).__r2State = st
  return st
})
vi.mock('@/lib/r2', () => ({
  userFileKey: (userId: string, ...parts: string[]) => [userId, ...parts].join('/'),
  uploadToR2: async (key: string) => key,
  getSignedDownloadUrl: async () => 'https://example.invalid/signed',
  r2Storage: {
    deleteKeys: async (keys: string[]) => {
      if (r2State.fail) throw Object.assign(new Error('storage unreachable'), { name: 'NetworkError' })
      r2State.deleted.push(...keys)
      r2State.objects = r2State.objects.filter(k => !keys.includes(k))
      return { failedKeys: [] }
    },
    listPrefix: async (prefix: string) => {
      if (r2State.fail) throw Object.assign(new Error('storage unreachable'), { name: 'NetworkError' })
      return r2State.objects.filter(k => k.startsWith(prefix))
    },
  },
}))

vi.mock('@/lib/ai/claude', () => ({
  AI_MODEL: 'test-model',
  fileBlock: () => ({ type: 'text', text: '' }),
  extractStructured: async () => null,
  extractText: async () => null,
}))

;(globalThis as unknown as { __setCurrentUser: (u: typeof state.user) => void }).__setCurrentUser = u => {
  state.user = u
}
