import { db } from '@/lib/db'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { fromCents } from '@/lib/finance/money'
import { berlinDate, berlinYearRange } from '@/lib/time/berlin'
import type { FinancialPosition } from '@/lib/finance/position'
import type { DecisionContext, ObligationItem } from './decisionTypes'

/**
 * Decision context built from the shared financial position, so the decision
 * centre, dashboard and "can I spend" check always agree.
 * - safeToSpend  = left from this month after taxes and open commitments, minus unreserved
 *                  taxes of ended periods and of earlier months (may be negative)
 * - taxOwed      = estimated reserve target for the current tax periods (not a Finanzamt demand)
 * - taxReserved  = what the user says they have set aside for those periods
 */
export async function buildDecisionContext(userId: string): Promise<DecisionContext & { position: FinancialPosition }> {
  const now = new Date()
  const year = berlinYearRange(berlinDate(now).year)

  const [position, yearTransactions, openCases, personaProfile] = await Promise.all([
    loadFinancialPosition(userId, now),
    db.transaction.findMany({
      where: { userId, transactionDate: { gte: year.start, lt: year.end } },
      select: { transactionDate: true },
    }),
    db.guidanceCase.findMany({ where: { userId, status: { notIn: ['RESOLVED'] } }, select: { status: true } }),
    db.userPersonaProfile.findUnique({
      where: { userId },
      select: { businessType: true, organizationLevel: true, bureaucracyConfidence: true },
    }),
  ])

  const monthsWithData = new Set(yearTransactions.map(t => berlinDate(t.transactionDate).month)).size
  const sumKind = (kinds: string[]) =>
    fromCents(position.commitments.filter(c => kinds.includes(c.kind)).reduce((s, c) => s + c.amountCents, 0))

  return {
    userId,
    taxType: position.taxType,
    currentMonthIncome: fromCents(position.month.businessIncomeNetCents),
    currentMonthExpenses: fromCents(position.month.deductibleExpenseCents),
    totalFixedCosts: sumKind(['FIXED_COST', 'FIXED_COST_PROVISION']),
    taxOwed: fromCents(position.reserveTargetTotalCents),
    taxReserved: fromCents(position.reservedTotalCents),
    totalPayables: fromCents(position.payables.openCents),
    totalSalaries: sumKind(['SALARY']),
    safeToSpend: fromCents(position.safeToSpendCents),
    endedPeriodShortfall: fromCents(position.endedPeriodShortfallCents),
    uncertainties: position.uncertainties,
    monthsWithData,
    totalTransactions: yearTransactions.length,
    hasProfile: personaProfile !== null,
    openCaseCount: openCases.length,
    openCaseEscalated: openCases.some(c => c.status === 'ESCALATED'),
    persona: personaProfile
      ? {
          businessType: personaProfile.businessType,
          organizationLevel: personaProfile.organizationLevel,
          bureaucracyConfidence: personaProfile.bureaucracyConfidence,
        }
      : null,
    position,
  }
}

/** Obligations shown next to a decision — taken directly from the position. */
export function obligationsFromPosition(position: FinancialPosition): ObligationItem[] {
  const items: ObligationItem[] = []
  if (position.reserveShortfallCents > 0) {
    items.push({ label: 'Estimated tax reserve still to set aside (Steuerrücklage)', amount: fromCents(position.reserveShortfallCents), type: 'TAX' })
  }
  for (const c of position.commitments) {
    items.push({
      label: c.kind === 'PAYABLE' ? `${c.label} — open supplier bill` : c.label,
      amount: fromCents(c.amountCents),
      type: c.kind === 'PAYABLE' ? 'PAYABLE' : c.kind === 'SALARY' ? 'SALARY' : 'FIXED_COST',
      dueDate: c.dueDate,
    })
  }
  return items
}
