import type { PrismaClient } from '@prisma/client'

/**
 * Durable removal of a deleted account's stored files (Art. 17 DSGVO).
 * The keys are written to PendingStorageDeletion INSIDE the account-deletion transaction,
 * together with the user's key prefix ("<userId>/"), so nothing is forgotten when object
 * storage is unreachable. A prefix entry also catches uploads that raced the deletion.
 * Entries are removed only after storage confirmed the delete; failures stay and are
 * retried by the storage-cleanup job. Keys contain the user id and the uploaded file name
 * (which can be personal data), so failed entries are visible to operators only and are
 * removed as soon as the delete succeeds; errors are stored without message text.
 */
export interface StorageApi {
  deleteKeys(keys: string[]): Promise<{ failedKeys: string[] }>
  listPrefix(prefix: string): Promise<string[]>
}

export async function processPendingDeletions(db: PrismaClient, storage: StorageApi, opts: { limit?: number; only?: string[] } = {}) {
  const pending = await db.pendingStorageDeletion.findMany({
    where: opts.only ? { objectKey: { in: opts.only } } : {},
    // Least-tried first, so entries that keep failing cannot starve newer deletions.
    orderBy: [{ attempts: 'asc' }, { updatedAt: 'asc' }],
    take: opts.limit ?? 200,
  })
  let removed = 0
  let failed = 0
  for (const entry of pending) {
    try {
      const keys = entry.objectKey.endsWith('/') ? await storage.listPrefix(entry.objectKey) : [entry.objectKey]
      const { failedKeys } = keys.length ? await storage.deleteKeys(keys) : { failedKeys: [] }
      if (failedKeys.length === 0) {
        // deleteMany/updateMany: another run may have handled the entry concurrently.
        await db.pendingStorageDeletion.deleteMany({ where: { id: entry.id } })
        removed++
        continue
      }
      failed++
      await db.pendingStorageDeletion.updateMany({
        where: { id: entry.id },
        data: { attempts: { increment: 1 }, lastError: `${failedKeys.length} object(s) not deleted` },
      })
    } catch (err) {
      failed++
      const name = err instanceof Error ? err.name : 'Error'
      await db.pendingStorageDeletion.updateMany({ where: { id: entry.id }, data: { attempts: { increment: 1 }, lastError: name.slice(0, 80) } })
    }
  }
  return { processed: pending.length, removed, failed }
}
