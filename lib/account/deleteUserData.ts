import type { PrismaClient } from '@prisma/client'

/**
 * Deletes one user and every row that belongs to them, in foreign-key order,
 * inside a single database transaction. Scoped strictly by userId.
 *
 * Returns the storage keys of the user's uploaded files so the caller can
 * remove them from object storage after the database commit.
 */
export async function deleteUserData(db: PrismaClient, userId: string): Promise<{ fileKeys: string[] }> {
  const documents = await db.document.findMany({ where: { userId }, select: { r2Key: true } })

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
  })

  return { fileKeys: documents.map(d => d.r2Key) }
}
