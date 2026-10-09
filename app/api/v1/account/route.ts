import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { deleteUserData } from '@/lib/account/deleteUserData'
import { deleteFromR2 } from '@/lib/r2'
import { jsonError, readJsonObject, unauthorized } from '@/lib/http'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

/**
 * Deletes the account and all its data (Art. 17 DSGVO).
 * Requires the current password and the confirmation word "LÖSCHEN"/"DELETE".
 * Uploaded files are removed from storage after the database commit.
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
  const failed = fileKeys.length ? await deleteFromR2(fileKeys) : 0
  if (failed > 0) {
    // Database rows are gone; orphaned files are logged by count only (no personal data).
    console.error(`[account] deleted user, but ${failed} stored file(s) could not be removed`)
  }
  return NextResponse.json({ success: true, filesRemoved: fileKeys.length - failed, filesFailed: failed })
}
