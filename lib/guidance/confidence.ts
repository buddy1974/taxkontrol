import type { ConfidenceLevel, ConfidenceScore, UserContext } from './guidanceTypes'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function computeConfidence(
  ctx: UserContext,
  currentMonth: number
): ConfidenceScore {
  const reasons: string[] = []
  let score = 100

  const expectedMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
  const missingMonths = expectedMonths.filter(m => !ctx.monthsWithTransactions.includes(m))

  for (const m of missingMonths) {
    reasons.push(`Transactions for ${MONTH_NAMES[m - 1]} are missing.`)
    score -= 15
  }

  if (!ctx.hasUploadedDocuments || ctx.uploadedDocumentCount === 0) {
    reasons.push('No supporting documents or receipts have been uploaded.')
    score -= 20
  }

  if (ctx.uncategorizedCount > 0) {
    reasons.push(`${ctx.uncategorizedCount} transaction(s) are not yet categorized.`)
    score -= Math.min(ctx.uncategorizedCount * 3, 20)
  }

  if (!ctx.hasFixedCosts) {
    reasons.push('No fixed costs have been configured.')
    score -= 10
  }

  if (!ctx.hasCompletedReports) {
    reasons.push('No completed reports found for this period.')
    score -= 10
  }

  if (ctx.totalTransactionCount === 0) {
    reasons.push('No transactions have been recorded yet.')
    score -= 30
  }

  score = Math.max(0, score)

  const level: ConfidenceLevel =
    score >= 75 ? 'HIGH' : score >= 40 ? 'MEDIUM' : 'LOW'

  return { level, score, reasons }
}
