import type { ExtendedUserContext } from '@/lib/guidance/guidanceTypes'
import type { ReadinessChecklist, ReadinessCheckItem } from './finanzamtTypes'

interface CaseInfo {
  detectedLetterType: string | null
  latestDeadline: Date | null
  escalationRecommended: boolean
}

export function computeReadinessChecklist(
  userCtx: ExtendedUserContext,
  caseInfo: CaseInfo
): ReadinessChecklist {
  const items: ReadinessCheckItem[] = [
    {
      key: 'has-documents',
      label: 'Receipts or invoices uploaded',
      ready: userCtx.hasUploadedDocuments,
      note: userCtx.hasUploadedDocuments
        ? `${userCtx.uploadedDocumentCount} document(s) on file`
        : 'No documents uploaded yet. Upload receipts and invoices to strengthen your records.',
    },
    {
      key: 'has-transactions',
      label: 'Transactions recorded this year',
      ready: userCtx.totalTransactionCount > 0,
      note: userCtx.totalTransactionCount > 0
        ? `${userCtx.totalTransactionCount} transaction(s) recorded`
        : 'No transactions found. Add income and expense entries.',
    },
    {
      key: 'months-covered',
      label: 'At least 3 months covered',
      ready: userCtx.monthsWithTransactions.length >= 3,
      note: userCtx.monthsWithTransactions.length >= 3
        ? `${userCtx.monthsWithTransactions.length} month(s) with records`
        : `Only ${userCtx.monthsWithTransactions.length} month(s) recorded. The Finanzamt expects complete annual records.`,
    },
    {
      key: 'expenses-categorized',
      label: 'All expenses categorized',
      ready: userCtx.uncategorizedCount === 0,
      note: userCtx.uncategorizedCount === 0
        ? 'All transactions have a category'
        : `${userCtx.uncategorizedCount} transaction(s) still need a category.`,
    },
    {
      key: 'fixed-costs-set',
      label: 'Fixed costs defined',
      ready: userCtx.hasFixedCosts,
      note: userCtx.hasFixedCosts
        ? 'Fixed costs are recorded'
        : 'No fixed costs found. Add regular expenses like rent or subscriptions.',
    },
    {
      key: 'report-generated',
      label: 'Income/expense report generated',
      ready: userCtx.hasCompletedReports,
      note: userCtx.hasCompletedReports
        ? 'At least one completed report on file'
        : 'No completed reports found. Generate a report from your records.',
    },
    {
      key: 'tax-reserve-ok',
      label: 'Tax reserve not missing',
      ready: userCtx.taxMissing <= 0,
      note: userCtx.taxMissing <= 0
        ? 'Tax reserve appears adequate'
        : `Estimated shortfall: €${userCtx.taxMissing.toFixed(2)}. Review your tax reserve.`,
    },
    {
      key: 'deadline-known',
      label: 'Deadline identified',
      ready: caseInfo.latestDeadline !== null,
      note: caseInfo.latestDeadline !== null
        ? `Deadline: ${caseInfo.latestDeadline.toLocaleDateString('de-DE')}`
        : 'No deadline detected in this case. Check the letter for a response date.',
    },
    {
      key: 'steuerberater-review',
      label: 'Steuerberater review planned (if escalated)',
      ready: !caseInfo.escalationRecommended,
      note: caseInfo.escalationRecommended
        ? 'Professional review is recommended for this case. Contact a Steuerberater before responding.'
        : 'No escalation flagged — but consider a professional review for important letters.',
    },
  ]

  const readyCount = items.filter(i => i.ready).length
  const totalCount = items.length
  const score = Math.round((readyCount / totalCount) * 100)

  const urgencyLevel: ReadinessChecklist['urgencyLevel'] =
    score >= 75 ? 'LOW'
    : score >= 50 ? 'MEDIUM'
    : score >= 25 ? 'HIGH'
    : 'CRITICAL'

  return {
    letterType: caseInfo.detectedLetterType ?? 'UNKNOWN',
    items,
    readyCount,
    totalCount,
    score,
    urgencyLevel,
    steuerberaterRequired: caseInfo.escalationRecommended,
  }
}
