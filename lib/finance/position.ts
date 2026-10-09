/**
 * The monthly financial position: what came in, what went out, what is not the
 * owner's money (taxes), what is still committed this month, and what is left.
 *
 * Definitions (documented in docs/finance/CALCULATIONS.md):
 * - "Left from this month" = business money received this month
 *     − all payments made this month (gross, including private ones)
 *     − taxes caused by this month (VAT payable + income tax estimate on this month's profit)
 *     − still-open commitments for this month (unpaid fixed costs, unpaid salaries,
 *       supplier bills due by month end)
 *   Private deposits, loans and unclear incoming money are NOT counted as available.
 *   The result can be negative: that is a warning, not an error.
 * - It is based on recorded transactions, not on the bank balance.
 * - Tax reserves are tracked per tax period: VAT per filing period, income tax
 *   per calendar year. "Reserved" is what the user says they have set aside —
 *   it is never assumed to have been transferred.
 */
import { toCents, percentOf, type MoneyInput } from './money'
import { summarizeTransactions, type TransactionRow, type TransactionTotals } from './summary'
import { incomeTaxReserveYearToDate, type IncomeTaxEstimate } from './incomeTax'
import type { TaxType } from './transactionAmounts'
import { checkKleinunternehmer, type KleinunternehmerCheck } from './kleinunternehmer'

export interface FixedCostRow {
  id: string
  name: string
  amount: MoneyInput
  frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  dayOfMonth: number
  usage: 'BUSINESS' | 'PRIVATE' | 'MIXED' | 'UNSURE'
}

export interface EmployeeRow {
  id: string
  name: string
  salaryType: 'MONTHLY' | 'HOURLY'
  salaryAmount: MoneyInput
  /** True when a payment for the current month is marked paid. */
  paidThisMonth: boolean
}

export interface PayableRow {
  id: string
  supplierName: string
  outstandingAmount: MoneyInput
  dueDate: Date | null
}

export interface ReceivableRow {
  id: string
  customerName: string
  outstandingAmount: MoneyInput
  dueDate: Date | null
}

export interface ReserveRow {
  type: 'VAT' | 'INCOME_TAX' | 'TRADE_TAX'
  periodStart: Date
  actuallyReserved: MoneyInput
}

export type CommitmentKind = 'FIXED_COST' | 'FIXED_COST_PROVISION' | 'SALARY' | 'PAYABLE'

export interface Commitment {
  kind: CommitmentKind
  id: string
  label: string
  amountCents: number
  dueDate?: string
  note?: string
}

export interface Limitation {
  code: string
  message: string
}

export interface PositionInput {
  now: Date
  taxType: TaxType
  churchTaxRate: number | null
  month: { start: Date; end: Date; year: number; month: number; day: number; monthsElapsed: number }
  /** Berlin start of the current calendar year (income tax reserve period). */
  yearStart: Date
  vatPeriod: { start: Date; end: Date; label: string }
  monthRows: TransactionRow[]
  vatPeriodRows: TransactionRow[]
  yearRows: TransactionRow[]
  priorYearRows: TransactionRow[] | null
  fixedCosts: FixedCostRow[]
  employees: EmployeeRow[]
  payables: PayableRow[]
  receivables: ReceivableRow[]
  reserves: ReserveRow[]
}

export interface TaxReserveTarget {
  type: 'VAT' | 'INCOME_TAX'
  label: string
  periodStart: string
  periodLabel: string
  targetCents: number
  reservedCents: number
  shortfallCents: number
}

export interface FinancialPosition {
  monthLabel: { year: number; month: number }
  taxType: TaxType
  month: TransactionTotals
  /** Taxes caused by this month's activity (estimate). */
  monthTaxCents: { vat: number; incomeTax: number; total: number }
  commitments: Commitment[]
  commitmentsTotalCents: number
  /** May be negative. */
  leftFromThisMonthCents: number
  reserves: TaxReserveTarget[]
  reserveTargetTotalCents: number
  reservedTotalCents: number
  reserveShortfallCents: number
  incomeTax: { estimate: IncomeTaxEstimate; projectedAnnualProfit: number; profitYearToDateCents: number }
  vatPeriodTotals: TransactionTotals
  kleinunternehmer: KleinunternehmerCheck | null
  receivables: { openCents: number; overdueCents: number; overdueCount: number }
  payables: { openCents: number; overdueCents: number; overdueCount: number }
  limitations: Limitation[]
  needsReviewCount: number
}

function normalise(s: string | null | undefined): string {
  return (s ?? '').toLocaleLowerCase('de-DE').replace(/[^a-z0-9äöüß]+/g, ' ').trim()
}

/**
 * A fixed cost counts as already paid this month when an expense this month
 * mentions it (name in merchant/description) with a similar amount (±2 %, min 1 €).
 */
export function matchesFixedCost(cost: { name: string; amountCents: number }, row: TransactionRow): boolean {
  if (row.type !== 'EXPENSE') return false
  const name = normalise(cost.name)
  if (!name) return false
  const text = `${normalise(row.merchant)} ${normalise(row.description)}`
  const nameHit = text.includes(name) || name.split(' ').filter(w => w.length >= 4).some(w => text.includes(w))
  if (!nameHit) return false
  const gross = Math.abs(toCents(row.grossAmount))
  const tolerance = Math.max(100, Math.round(cost.amountCents * 0.02))
  return Math.abs(gross - cost.amountCents) <= tolerance
}

function isoDate(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined
}

export function computeFinancialPosition(input: PositionInput): FinancialPosition {
  const limitations: Limitation[] = []
  const month = summarizeTransactions(input.monthRows, input.taxType)
  const year = summarizeTransactions(input.yearRows, input.taxType)
  const vatPeriodTotals = summarizeTransactions(input.vatPeriodRows, input.taxType)

  // ── Income tax: estimate on the year so far, projected to a full year ──
  const church = input.churchTaxRate ? { rate: input.churchTaxRate } : null
  const it = incomeTaxReserveYearToDate({
    year: input.month.year,
    profitYearToDateCents: year.profitCents,
    monthsElapsed: input.month.monthsElapsed,
    churchTax: church,
  })
  const monthIncomeTax = month.profitCents > 0 ? Math.round(month.profitCents * it.estimate.effectiveRate) : 0
  const monthVat = Math.max(0, month.vatPayableCents)

  // ── Commitments still open this month ──
  const commitments: Commitment[] = []
  const monthRowsExpenses = input.monthRows.filter(r => r.type === 'EXPENSE')
  for (const fc of input.fixedCosts) {
    const amountCents = Math.abs(toCents(fc.amount))
    if (amountCents === 0) continue
    if (fc.frequency === 'MONTHLY') {
      const paid = monthRowsExpenses.some(r => matchesFixedCost({ name: fc.name, amountCents }, r))
      if (!paid) {
        commitments.push({
          kind: 'FIXED_COST',
          id: fc.id,
          label: fc.name,
          amountCents,
          note: fc.dayOfMonth < input.month.day ? 'Due date has passed — not found in this month’s expenses' : `Due on day ${fc.dayOfMonth}`,
        })
      }
    } else {
      // Quarterly/yearly costs: set aside the monthly share so the bill can be paid.
      const share = Math.round(amountCents / (fc.frequency === 'QUARTERLY' ? 3 : 12))
      commitments.push({
        kind: 'FIXED_COST_PROVISION',
        id: fc.id,
        label: `${fc.name} (${fc.frequency === 'QUARTERLY' ? 'quarterly' : 'yearly'} — monthly share)`,
        amountCents: share,
        note: 'Monthly share to set aside, not a payment',
      })
    }
  }

  let hourly = 0
  for (const e of input.employees) {
    if (e.salaryType === 'HOURLY') {
      hourly++
      continue
    }
    if (e.paidThisMonth) continue
    const amountCents = Math.abs(toCents(e.salaryAmount))
    const paidViaExpense = monthRowsExpenses.some(r => matchesFixedCost({ name: e.name, amountCents }, r))
    if (!paidViaExpense && amountCents > 0) {
      commitments.push({ kind: 'SALARY', id: e.id, label: `Salary ${e.name}`, amountCents })
    }
  }
  if (hourly > 0) {
    limitations.push({ code: 'HOURLY_WAGES', message: `${hourly} employee(s) are paid by the hour. Their wages are not included because the hours are unknown.` })
  }
  if (input.employees.length > 0) {
    limitations.push({ code: 'EMPLOYER_COSTS', message: 'Employer social security contributions and wage tax are not included in salary amounts.' })
  }

  let payOpen = 0
  let payOverdue = 0
  let payOverdueCount = 0
  for (const p of input.payables) {
    const amountCents = Math.abs(toCents(p.outstandingAmount))
    payOpen += amountCents
    const overdue = p.dueDate !== null && p.dueDate < input.now
    if (overdue) {
      payOverdue += amountCents
      payOverdueCount++
    }
    if (p.dueDate === null || p.dueDate < input.month.end) {
      commitments.push({
        kind: 'PAYABLE',
        id: p.id,
        label: p.supplierName,
        amountCents,
        dueDate: isoDate(p.dueDate),
        note: p.dueDate === null ? 'No due date — counted as due now' : overdue ? 'Overdue' : 'Due this month',
      })
    }
  }

  let recOpen = 0
  let recOverdue = 0
  let recOverdueCount = 0
  for (const r of input.receivables) {
    const amountCents = Math.abs(toCents(r.outstandingAmount))
    recOpen += amountCents
    if (r.dueDate !== null && r.dueDate < input.now) {
      recOverdue += amountCents
      recOverdueCount++
    }
  }

  const commitmentsTotalCents = commitments.reduce((s, c) => s + c.amountCents, 0)
  const monthTaxTotal = monthVat + monthIncomeTax
  const leftFromThisMonthCents = month.businessIncomeGrossCents - month.outflowGrossCents - monthTaxTotal - commitmentsTotalCents

  // ── Reserve targets per tax period ──
  const reservedFor = (type: 'VAT' | 'INCOME_TAX', start: Date) =>
    input.reserves
      .filter(r => r.type === type && r.periodStart.getTime() === start.getTime())
      .reduce((s, r) => s + toCents(r.actuallyReserved), 0)

  const reserves: TaxReserveTarget[] = []
  if (input.taxType !== 'KLEINUNTERNEHMER') {
    const target = Math.max(0, vatPeriodTotals.vatPayableCents)
    const reserved = reservedFor('VAT', input.vatPeriod.start)
    reserves.push({
      type: 'VAT',
      label: 'VAT (Umsatzsteuer)',
      periodStart: input.vatPeriod.start.toISOString(),
      periodLabel: input.vatPeriod.label,
      targetCents: target,
      reservedCents: reserved,
      shortfallCents: Math.max(0, target - reserved),
    })
  }
  const itStart = input.yearStart
  const itReserved = reservedFor('INCOME_TAX', itStart)
  reserves.push({
    type: 'INCOME_TAX',
    label: 'Income tax (Einkommensteuer)',
    periodStart: itStart.toISOString(),
    periodLabel: String(input.month.year),
    targetCents: it.reserveCents,
    reservedCents: itReserved,
    shortfallCents: Math.max(0, it.reserveCents - itReserved),
  })

  const reserveTargetTotalCents = reserves.reduce((s, r) => s + r.targetCents, 0)
  const reservedTotalCents = reserves.reduce((s, r) => s + r.reservedCents, 0)
  const reserveShortfallCents = reserves.reduce((s, r) => s + r.shortfallCents, 0)

  // ── Kleinunternehmer limits ──
  let klein: KleinunternehmerCheck | null = null
  if (input.taxType === 'KLEINUNTERNEHMER') {
    const prior = input.priorYearRows ? summarizeTransactions(input.priorYearRows, input.taxType) : null
    klein = checkKleinunternehmer({
      year: input.month.year,
      priorYearTurnoverCents: prior?.businessIncomeNetCents ?? 0,
      currentYearTurnoverCents: year.businessIncomeNetCents,
      hasPriorYearData: (input.priorYearRows?.length ?? 0) > 0,
    })
  }

  // ── Limitations the user must know about ──
  if (it.estimate.provisionalRules) {
    limitations.push({ code: 'PROVISIONAL_RULES', message: `Tax rules for ${input.month.year} are not final; the latest enacted rules were used.` })
  }
  if (month.unclearInflowCents > 0 || month.unclearOutflowCents > 0) {
    limitations.push({ code: 'UNCLEAR_TRANSACTIONS', message: 'Some transactions are marked “not sure”. They are left out of profit and taxes until you classify them.' })
  }
  if (input.taxType === 'PAUSCHALIERUNG') {
    limitations.push({ code: 'PAUSCHALIERUNG', message: 'Special VAT flat-rate schemes are not modelled. VAT is estimated as under standard taxation.' })
  }
  if (input.taxType !== 'KLEINUNTERNEHMER') {
    limitations.push({ code: 'VAT_PERIOD', message: `VAT reserve is shown for ${input.vatPeriod.label}. Change your VAT filing period in Settings if it is different.` })
  }
  limitations.push({ code: 'NOT_BANK_BALANCE', message: 'Based on the money you recorded this month — not on your bank balance.' })

  return {
    monthLabel: { year: input.month.year, month: input.month.month },
    taxType: input.taxType,
    month,
    monthTaxCents: { vat: monthVat, incomeTax: monthIncomeTax, total: monthTaxTotal },
    commitments,
    commitmentsTotalCents,
    leftFromThisMonthCents,
    reserves,
    reserveTargetTotalCents,
    reservedTotalCents,
    reserveShortfallCents,
    incomeTax: { estimate: it.estimate, projectedAnnualProfit: it.projectedAnnualProfit, profitYearToDateCents: year.profitCents },
    vatPeriodTotals,
    kleinunternehmer: klein,
    receivables: { openCents: recOpen, overdueCents: recOverdue, overdueCount: recOverdueCount },
    payables: { openCents: payOpen, overdueCents: payOverdue, overdueCount: payOverdueCount },
    limitations,
    needsReviewCount: month.needsReviewCount,
  }
}

/** Share of a requested amount relative to what is left (for the spend check). */
export function spendCheck(position: FinancialPosition, requestedCents: number) {
  const left = position.leftFromThisMonthCents
  const remainingAfter = left - requestedCents
  return {
    requestedCents,
    leftCents: left,
    remainingAfterCents: remainingAfter,
    fits: requestedCents > 0 && remainingAfter >= 0,
    shareOfLeft: left > 0 ? Math.round((requestedCents / left) * 100) : null,
    reserveShortfallCents: position.reserveShortfallCents,
    bufferWarning: left > 0 && requestedCents > percentOf(left, 70),
  }
}
