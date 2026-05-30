import type {
  PersonaProfile,
  PreparationScoreResult,
  PreparationStatus,
  UserContext,
} from './guidanceTypes'
import { detectMissingData } from './missingData'
import { getMissingMonthSeverity } from './businessRhythm'

export function computePreparationScore(
  ctx: UserContext,
  currentMonth: number,
  persona?: PersonaProfile | null
): PreparationScoreResult {
  const missing = detectMissingData(ctx, currentMonth)
  const strengths: string[] = []
  let score = 0

  if (ctx.totalTransactionCount > 0) {
    score += 20
    strengths.push('Transaction records exist for this year.')
  }

  const expectedMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
  const missingMonths = expectedMonths.filter(m => !ctx.monthsWithTransactions.includes(m))
  const coverageRatio =
    expectedMonths.length > 0
      ? (expectedMonths.length - missingMonths.length) / expectedMonths.length
      : 0

  // Persona-aware month coverage scoring
  const monthSeverity = getMissingMonthSeverity(persona ?? null, missingMonths.length)

  if (coverageRatio === 1) {
    score += 30
    strengths.push('All months up to date have recorded transactions.')
  } else if (coverageRatio >= 0.7) {
    // Freelancers/creatives/consultants with irregular income get less penalty
    if (monthSeverity === 'minor') {
      score += 22
      strengths.push('Most months covered — gaps are within normal range for your business type.')
    } else {
      score += 15
      strengths.push('Most months have recorded transactions.')
    }
  } else if (coverageRatio >= 0.5 && monthSeverity === 'minor') {
    score += 10
    strengths.push('Partial coverage — irregular income is normal for your business type.')
  }

  if (ctx.hasUploadedDocuments && ctx.uploadedDocumentCount > 0) {
    score += 20
    strengths.push(`${ctx.uploadedDocumentCount} supporting document(s) uploaded.`)
  }

  if (ctx.uncategorizedCount === 0 && ctx.totalTransactionCount > 0) {
    score += 15
    strengths.push('All transactions are categorized.')
  }

  if (ctx.hasFixedCosts) {
    score += 10
    strengths.push('Fixed costs are configured.')
  }

  if (ctx.hasCompletedReports) {
    score += 5
    strengths.push('Reports have been completed.')
  }

  score = Math.min(100, score)

  const status: PreparationStatus =
    score < 25 ? 'POOR' : score < 50 ? 'PARTIAL' : score < 80 ? 'GOOD' : 'READY'

  const blockingCount = missing.filter(i => i.severity === 'blocking').length
  const importantCount = missing.filter(i => i.severity === 'important').length
  const rawHours = 2 + blockingCount * 0.5 + importantCount * 0.3
  const estimatedPreparationSavingsHours = Math.round(Math.min(rawHours, 5) * 10) / 10

  return {
    score,
    status,
    strengths,
    missingItems: missing.map(i => i.description),
    estimatedPreparationSavingsHours,
  }
}
