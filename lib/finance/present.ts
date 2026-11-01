/**
 * Turns a FinancialPosition (integer cents) into the JSON shape used by the
 * API and the UI (euros, two decimals), and derives user-facing warnings.
 * Wording rule: amounts are always "estimated"; a reserve target is never
 * described as money owed to or demanded by the Finanzamt.
 */
import { fromCents } from './money'
import type { FinancialPosition } from './position'

export type WarningSeverity = 'low' | 'medium' | 'high'

export interface FinanceWarning {
  id: string
  type:
    | 'LOW_TAX_RESERVE'
    | 'NEGATIVE_MONTH'
    | 'OVERDUE_RECEIVABLE'
    | 'OVERDUE_PAYABLE'
    | 'NO_TRANSACTIONS'
    | 'NEEDS_REVIEW'
    | 'KLEINUNTERNEHMER_LIMIT'
    | 'ENDED_TAX_PERIOD_OPEN'
  severity: WarningSeverity
  message: string
  href?: string
}

const eur = (cents: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(fromCents(cents))

export function buildWarnings(p: FinancialPosition): FinanceWarning[] {
  const w: FinanceWarning[] = []

  if (p.kleinunternehmer && p.kleinunternehmer.status !== 'OK') {
    w.push({
      id: 'kleinunternehmer-limit',
      type: 'KLEINUNTERNEHMER_LIMIT',
      severity: p.kleinunternehmer.status === 'APPROACHING_CURRENT_LIMIT' || p.kleinunternehmer.status === 'NEXT_YEAR_AT_RISK' ? 'medium' : 'high',
      message: p.kleinunternehmer.message,
      href: '/settings',
    })
  }
  if (p.reserveShortfallCents > 0) {
    w.push({
      id: 'low-tax-reserve',
      type: 'LOW_TAX_RESERVE',
      severity: p.reserveShortfallCents > 50000 ? 'high' : 'medium',
      message: `Your tax reserve is about ${eur(p.reserveShortfallCents)} below the estimated amount. This is a planning estimate, not a bill from the Finanzamt.`,
      href: '/tax',
    })
  }
  for (const r of p.reserves.filter(x => x.status === 'ENDED')) {
    w.push({
      id: `ended-period-${r.type}-${r.periodStart}`,
      type: 'ENDED_TAX_PERIOD_OPEN',
      severity: 'high',
      message: `${r.label} for ${r.periodLabel}: about ${eur(r.openCents)} (estimate) is not recorded as paid yet. ${r.dueNote}. If you already paid it, record the payment on the Tax page.`,
      href: '/tax',
    })
  }
  if (p.month.count > 0 && p.leftFromThisMonthCents < 0) {
    w.push({
      id: 'negative-month',
      type: 'NEGATIVE_MONTH',
      severity: 'high',
      message: `After taxes and open commitments this month is about ${eur(-p.leftFromThisMonthCents)} short.`,
      href: '/money',
    })
  }
  if (p.needsReviewCount > 0) {
    w.push({
      id: 'needs-review',
      type: 'NEEDS_REVIEW',
      severity: 'medium',
      message: `${p.needsReviewCount} transaction(s) this month need your decision: business or private?`,
      href: '/transactions?review=1',
    })
  }
  if (p.receivables.overdueCount > 0) {
    w.push({
      id: 'overdue-receivable',
      type: 'OVERDUE_RECEIVABLE',
      severity: 'medium',
      message: `${p.receivables.overdueCount} customer invoice(s) totalling ${eur(p.receivables.overdueCents)} are overdue.`,
      href: '/customers',
    })
  }
  if (p.payables.overdueCount > 0) {
    w.push({
      id: 'overdue-payable',
      type: 'OVERDUE_PAYABLE',
      severity: 'high',
      message: `You have ${eur(p.payables.overdueCents)} in supplier bills past their due date.`,
      href: '/suppliers',
    })
  }
  if (p.month.count === 0) {
    w.push({
      id: 'no-transactions',
      type: 'NO_TRANSACTIONS',
      severity: 'low',
      message: 'No transactions recorded this month yet. Add your income and expenses to see your position.',
      href: '/input',
    })
  }
  return w
}

export function presentPosition(p: FinancialPosition) {
  const m = p.month
  return {
    period: p.monthLabel,
    taxType: p.taxType,
    isEstimate: true as const,
    month: {
      transactionCount: m.count,
      businessIncomeGross: fromCents(m.businessIncomeGrossCents),
      businessIncomeNet: fromCents(m.businessIncomeNetCents),
      nonBusinessInflow: fromCents(m.nonBusinessInflowCents),
      unclearInflow: fromCents(m.unclearInflowCents),
      outflowGross: fromCents(m.outflowGrossCents),
      deductibleExpenses: fromCents(m.deductibleExpenseCents),
      privateOutflow: fromCents(m.privateOutflowCents),
      unclearOutflow: fromCents(m.unclearOutflowCents),
      profit: fromCents(m.profitCents),
      vatPayable: fromCents(m.vatPayableCents),
      needsReviewCount: m.needsReviewCount,
    },
    monthTax: {
      vat: fromCents(p.monthTaxCents.vat),
      incomeTax: fromCents(p.monthTaxCents.incomeTax),
      total: fromCents(p.monthTaxCents.total),
    },
    commitments: p.commitments.map(c => ({ ...c, amount: fromCents(c.amountCents) })),
    commitmentsTotal: fromCents(p.commitmentsTotalCents),
    leftFromThisMonth: fromCents(p.leftFromThisMonthCents),
    reserves: p.reserves.map(r => ({
      type: r.type,
      label: r.label,
      status: r.status,
      periodStart: r.periodStart,
      periodEnd: r.periodEnd,
      periodLabel: r.periodLabel,
      target: fromCents(r.targetCents),
      paid: fromCents(r.paidCents),
      open: fromCents(r.openCents),
      reserved: fromCents(r.reservedCents),
      shortfall: fromCents(r.shortfallCents),
      dueNote: r.dueNote,
    })),
    reserveTargetTotal: fromCents(p.reserveTargetTotalCents),
    reservedTotal: fromCents(p.reservedTotalCents),
    reserveShortfall: fromCents(p.reserveShortfallCents),
    incomeTax: {
      year: p.incomeTax.estimate.year,
      profitYearToDate: fromCents(p.incomeTax.profitYearToDateCents),
      projectedAnnualProfit: Math.round(p.incomeTax.projectedAnnualProfit * 100) / 100,
      minimumOnProfitSoFar: fromCents(p.incomeTax.minimumOnProfitSoFarCents),
      estimatedAnnualTax: p.incomeTax.estimate.total,
      effectiveRate: Math.round(p.incomeTax.estimate.effectiveRate * 10000) / 100,
      provisionalRules: p.incomeTax.estimate.provisionalRules,
      assumptions: p.incomeTax.estimate.assumptions,
      basis: p.incomeTax.estimate.basis,
    },
    kleinunternehmer: p.kleinunternehmer
      ? {
          status: p.kleinunternehmer.status,
          message: p.kleinunternehmer.message,
          currentYearTurnover: fromCents(p.kleinunternehmer.currentYearTurnoverCents),
          priorYearTurnover: fromCents(p.kleinunternehmer.priorYearTurnoverCents),
          currentYearLimit: fromCents(p.kleinunternehmer.currentYearLimitCents),
          priorYearLimit: fromCents(p.kleinunternehmer.priorYearLimitCents),
          basis: p.kleinunternehmer.basis,
        }
      : null,
    receivables: { open: fromCents(p.receivables.openCents), overdue: fromCents(p.receivables.overdueCents), overdueCount: p.receivables.overdueCount },
    payables: { open: fromCents(p.payables.openCents), overdue: fromCents(p.payables.overdueCents), overdueCount: p.payables.overdueCount },
    limitations: p.limitations,
    warnings: buildWarnings(p),
  }
}

export type PresentedPosition = ReturnType<typeof presentPosition>
