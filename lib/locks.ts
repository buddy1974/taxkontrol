import type { Prisma } from '@prisma/client'

/**
 * Serialises concurrent writers on the same key for the rest of the current
 * database transaction (Postgres transaction-scoped advisory lock).
 * Use for read-then-write sequences: payments, imports, reserve row creation.
 */
export async function lockFor(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`
}
