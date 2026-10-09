import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import Credentials from 'next-auth/providers/credentials'
import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { rateLimit, getIp } from '@/lib/rateLimit'
import { getEntitlementFlags, DEFAULT_ENTITLEMENT_FLAGS } from '@/lib/entitlements'

// Brute-force protection: max failed-capable attempts per (ip + email) window.
const LOGIN_MAX_ATTEMPTS = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        // Normalize email so casing/whitespace can't create lookup mismatches.
        const email = (credentials.email as string).trim().toLowerCase()

        // Rate-limit login attempts per IP + email to slow brute-force attacks.
        const ip = request instanceof Request ? getIp(request) : 'unknown'
        const rl = await rateLimit(`login:${ip}:${email}`, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)
        if (!rl.allowed) {
          // Throttled — fail the attempt without revealing whether the account exists.
          return null
        }

        const user = await db.user.findUnique({
          where: { email },
        })

        if (!user || !user.passwordHash) return null

        const passwordMatch = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash
        )

        if (!passwordMatch) return null

        return user
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in: stamp the user id and load entitlement flags once.
      if (user?.id) {
        token.id = user.id
        token.entitlements = await getEntitlementFlags(user.id)
      } else if (trigger === 'update' && token.id) {
        // Allow an explicit session refresh to re-read flags after a purchase
        // (Sprint 15.3 webhook grants entitlements out-of-band).
        token.entitlements = await getEntitlementFlags(token.id as string)
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.entitlements =
          (token.entitlements as typeof DEFAULT_ENTITLEMENT_FLAGS) ??
          DEFAULT_ENTITLEMENT_FLAGS
      }
      return session
    },
  },
})
