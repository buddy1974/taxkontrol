import type { PrismaClient } from '@prisma/client'

/**
 * Deletes one user and every row that belongs to them, in foreign-key order,
 * inside a single database transaction. Scoped strictly by userId.
 *
 * The storage keys of the user's uploaded files and the user's key prefix are recorded in
 * PendingStorageDeletion in the same transaction (durable: a storage outage cannot make
 * them be forgotten). The caller removes them after the commit (processPendingDeletions).
 */
export async function deleteUserData(db: PrismaClient, userId: string): Promise<{ fileKeys: string[] }> {
  const documents = await db.document.findMany({ where: { userId }, select: { r2Key: true } })
  // Known files plus the user's prefix: an upload racing the deletion is caught by the prefix.
  const keys = [...new Set([...documents.map(d => d.r2Key), `${userId}/`])]

  await db.$transaction(async tx => {
    const employeeIds = (await tx.employee.findMany({ where: { userId }, select: { id: true } })).map(e => e.id)
    const caseIds = (await tx.guidanceCase.findMany({ where: { userId }, select: { id: true } })).map(c => c.id)

    if (employeeIds.length) await tx.employeePayment.deleteMany({ where: { employeeId: { in: employeeIds } } })
    if (caseIds.length) await tx.guidanceCaseEvent.deleteMany({ where: { caseId: { in: caseIds } } })

    // Transactions reference documents, so they go first.
    await tx.transaction.deleteMany({ where: { userId } })
    await tx.document.deleteMany({ where: { userId } })
    await tx.employee.deleteMany({ where: { userId } })
    await tx.guidanceCase.deleteMany({ where: { userId } })
    await tx.guidanceTask.deleteMany({ where: { userId } })
    await tx.decisionEvaluation.deleteMany({ where: { userId } })
    await tx.userPersonaProfile.deleteMany({ where: { userId } })
    await tx.jobcenterRecord.deleteMany({ where: { userId } })
    await tx.dailyClose.deleteMany({ where: { userId } })
    await tx.taxReserve.deleteMany({ where: { userId } })
    await tx.taxProfile.deleteMany({ where: { userId } })
    await tx.fixedCost.deleteMany({ where: { userId } })
    await tx.receivable.deleteMany({ where: { userId } })
    await tx.payable.deleteMany({ where: { userId } })
    // Account, Session, Entitlement, Purchase and AuditEvent cascade with the user.
    await tx.user.delete({ where: { id: userId } })
    await tx.pendingStorageDeletion.createMany({ data: keys.map(objectKey => ({ objectKey })), skipDuplicates: true })
  })

  return { fileKeys: keys }
}
