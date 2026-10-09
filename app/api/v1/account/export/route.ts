import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { recordAudit } from '@/lib/audit'
import { unauthorized } from '@/lib/http'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'

/**
 * Data export (Art. 15 / 20 DSGVO): every record stored for the user as JSON.
 * Never includes the password hash or session tokens. Uploaded files are
 * listed by name; the files themselves stay in storage.
 */
export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`account-export:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const userId = user.id
  const [
    profile,
    transactions,
    documents,
    taxReserves,
    fixedCosts,
    receivables,
    payables,
    employees,
    jobcenterRecords,
    dailyCloses,
    guidanceCases,
    guidanceTasks,
    decisionEvaluations,
    persona,
    purchases,
    entitlements,
    auditEvents,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, businessName: true, taxId: true, vatId: true, taxType: true, isJobcenter: true, createdAt: true, updatedAt: true, taxProfile: true },
    }),
    db.transaction.findMany({ where: { userId }, orderBy: { transactionDate: 'asc' } }),
    db.document.findMany({ where: { userId }, select: { id: true, type: true, fileName: true, mimeType: true, status: true, reviewStatus: true, ocrData: true, ocrText: true, correctionData: true, linkedTransactionId: true, approvedAt: true, createdAt: true } }),
    db.taxReserve.findMany({ where: { userId } }),
    db.fixedCost.findMany({ where: { userId } }),
    db.receivable.findMany({ where: { userId } }),
    db.payable.findMany({ where: { userId } }),
    db.employee.findMany({ where: { userId }, include: { payments: true } }),
    db.jobcenterRecord.findMany({ where: { userId } }),
    db.dailyClose.findMany({ where: { userId } }),
    db.guidanceCase.findMany({ where: { userId }, include: { events: true } }),
    db.guidanceTask.findMany({ where: { userId } }),
    db.decisionEvaluation.findMany({ where: { userId } }),
    db.userPersonaProfile.findUnique({ where: { userId } }),
    db.purchase.findMany({ where: { userId } }),
    db.entitlement.findMany({ where: { userId } }),
    db.auditEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
  ])

  await recordAudit({ userId, entityType: 'ACCOUNT', entityId: userId, action: 'EXPORT', after: { kind: 'full-data-export' } })

  const payload = {
    exportedAt: new Date().toISOString(),
    format: 'taxkontrol-export-v1',
    note: 'Amounts are euros. Uploaded files are listed in "documents"; the files themselves are not included.',
    profile,
    persona,
    transactions,
    documents,
    taxReserves,
    fixedCosts,
    receivables,
    payables,
    employees,
    jobcenterRecords,
    dailyCloses,
    guidanceCases,
    guidanceTasks,
    decisionEvaluations,
    purchases,
    entitlements,
    auditEvents,
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="taxkontrol-export-${new Date().toISOString().slice(0, 10)}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
