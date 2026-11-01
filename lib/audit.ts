import type { Prisma, PrismaClient } from '@prisma/client'
import { db } from '@/lib/db'

export type AuditEntity = 'TRANSACTION' | 'DOCUMENT' | 'TAX_RESERVE' | 'ACCOUNT' | 'JOBCENTER_RECORD' | 'RECEIVABLE'
export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'APPROVE' | 'REJECT' | 'IMPORT' | 'EXPORT'
export type AuditSource = 'USER' | 'AI' | 'IMPORT' | 'SYSTEM'

type Client = PrismaClient | Prisma.TransactionClient

export interface AuditEntry {
  userId: string
  entityType: AuditEntity
  entityId: string
  action: AuditAction
  source?: AuditSource
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
}

function toJson(value: Record<string, unknown> | null | undefined): Prisma.InputJsonValue | undefined {
  if (!value) return undefined
  // Decimal/Date -> plain JSON values.
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

/** Appends an audit event. Pass a transaction client to make it atomic with the change. */
export async function recordAudit(entry: AuditEntry, client: Client = db): Promise<void> {
  await client.auditEvent.create({
    data: {
      userId: entry.userId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      source: entry.source ?? 'USER',
      before: toJson(entry.before),
      after: toJson(entry.after),
    },
  })
}

/** Returns only the keys whose values differ (compared as JSON). */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const b: Record<string, unknown> = {}
  const a: Record<string, unknown> = {}
  for (const key of Object.keys(after)) {
    const bv = JSON.stringify(before[key] ?? null)
    const av = JSON.stringify(after[key] ?? null)
    if (bv !== av) {
      b[key] = before[key] ?? null
      a[key] = after[key] ?? null
    }
  }
  return Object.keys(a).length ? { before: b, after: a } : null
}
