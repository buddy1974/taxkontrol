import type { DefaultSession } from 'next-auth'
import type { EntitlementFlags } from '@/lib/entitlements'

// Augment NextAuth so the entitlement flags carried through the JWT and exposed
// on the session are strongly typed everywhere (Sprint 15.1). `id` is already
// part of Auth.js v5's default User type; we only add `entitlements`.

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      entitlements: EntitlementFlags
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string
    entitlements?: EntitlementFlags
  }
}
