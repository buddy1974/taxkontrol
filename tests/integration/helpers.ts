import { NextRequest } from 'next/server'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import type { TaxType } from '@prisma/client'
import { toBerlinIsoDate } from '@/lib/time/berlin'

type TestUser = { id: string; email: string; name: string | null }

export function setCurrentUser(user: TestUser | null) {
  ;(globalThis as unknown as { __setCurrentUser: (u: TestUser | null) => void }).__setCurrentUser(user)
}

/** Removes every row (test database only — see setupEnv). */
export async function resetDatabase() {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  if (tables.length) {
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  }
}

let counter = 0
export async function createUser(opts: { taxType?: TaxType; password?: string; withProfile?: boolean } = {}) {
  counter++
  const user = await db.user.create({
    data: {
      email: `user${counter}-${Date.now()}@test.local`,
      name: `Test User ${counter}`,
      passwordHash: await bcrypt.hash(opts.password ?? 'correct horse battery', 4),
      taxType: opts.taxType ?? 'REGELBESTEUERUNG',
      ...(opts.withProfile === false ? {} : { taxProfile: { create: {} } }),
    },
  })
  return { id: user.id, email: user.email, name: user.name }
}

export function jsonRequest(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '127.0.0.1' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
}

export function params<T extends Record<string, string>>(p: T) {
  return { params: Promise.resolve(p) }
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T
}

/** Today's calendar date in Berlin (the UTC date is yesterday shortly after midnight). */
export const today = () => toBerlinIsoDate(new Date())
