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

vi.mock('@/lib/r2', () => ({
  userFileKey: (userId: string, ...parts: string[]) => [userId, ...parts].join('/'),
  uploadToR2: async (key: string) => key,
  deleteFromR2: async () => 0,
  getSignedDownloadUrl: async () => 'https://example.invalid/signed',
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
