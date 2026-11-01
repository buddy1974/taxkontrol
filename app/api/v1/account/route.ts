import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { deleteUserData } from '@/lib/account/deleteUserData'
import { r2Storage } from '@/lib/r2'
import { processPendingDeletions } from '@/lib/account/storageCleanup'
import { jsonError, readJsonObject, unauthorized } from '@/lib/http'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

/**
 * Deletes the account and all its data (Art. 17 DSGVO).
 * Requires the current password and the confirmation word "LÖSCHEN"/"DELETE".
 * Uploaded files are queued durably in the same transaction and removed from storage after
 * the commit; whatever storage does not confirm stays queued and is retried by the
 * storage-cleanup job — the response says so honestly.
 */
export async function DELETE(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`account-delete:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const body = await readJsonObject(req)
  const confirm = typeof body?.confirm === 'string' ? body.confirm.trim().toUpperCase() : ''
  if (confirm !== 'DELETE' && confirm !== 'LÖSCHEN') {
    return jsonError(400, 'Please type DELETE to confirm.', { field: 'confirm' })
  }

  const record = await db.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
  if (!record) return unauthorized()
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!record.passwordHash || !(await bcrypt.compare(password, record.passwordHash))) {
    return jsonError(403, 'The password is not correct.', { field: 'password' })
  }

  const { fileKeys } = await deleteUserData(db, user.id)
  // The account is already gone; a storage problem must not turn that into an error answer.
  const r = await processPendingDeletions(db, r2Storage, { only: fileKeys }).catch(() => ({ failed: fileKeys.length }))
  if (r.failed > 0) {
    // Database rows are gone; the files stay queued for the cleanup job. Count only, no personal data.
    console.error(`[account] deleted user; ${r.failed} storage deletion(s) queued for retry`)
  }
  return NextResponse.json({
    success: true,
    filesPendingDeletion: r.failed,
    message:
      r.failed > 0
        ? 'Your account and data are deleted. Some uploaded files could not be removed yet; they are queued and will be deleted automatically.'
        : 'Your account, data and uploaded files are deleted.',
  })
}
