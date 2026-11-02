import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/log'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { limitWrites } from '@/lib/rateLimit'
import { db } from '@/lib/db'
import { TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { deleteTransaction, serializeTransaction, updateTransaction } from '@/lib/transactions/service'
import { jsonError, notFound, readJsonObject, unauthorized } from '@/lib/http'

interface Props {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const tx = await db.transaction.findFirst({ where: { id, userId: user.id }, include: { category: true } })
  if (!tx) return notFound()
  const history = await db.auditEvent.findMany({
    where: { userId: user.id, entityType: 'TRANSACTION', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, source: true, before: true, after: true, createdAt: true },
  })
  return NextResponse.json({ ...serializeTransaction(tx), history })
}

/** Correct a transaction. Every change is recorded in the audit history. */
export async function PATCH(req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  try {
    const updated = await db.$transaction(tx => updateTransaction(user.id, id, body, tx))
    if (!updated) return notFound()
    return NextResponse.json(serializeTransaction(updated))
  } catch (err) {
    if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field })
    logError('Transaction update error', err)
    return jsonError(500, 'Failed to update transaction.')
  }
}

export async function DELETE(_req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const deleted = await db.$transaction(tx => deleteTransaction(user.id, id, tx))
  if (!deleted) return notFound()
  return NextResponse.json({ success: true })
}
