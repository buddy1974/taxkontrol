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
import { estimateAnnualIncomeTax, incomeTaxReserveYearToDate, type IncomeTaxEstimate } from './incomeTax'
import type { TaxType } from './transactionAmounts'
import { checkKleinunternehmer, type KleinunternehmerCheck } from './kleinunternehmer'
import { isPastDue } from '../time/berlin'

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
  /** Full bill amount and what was recorded as paid through TaxKontrol (optional for old callers). */
  totalAmount?: MoneyInput
  paidAmount?: MoneyInput
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
  /** The user marked this period as finished with the Finanzamt. */
  settledAt?: Date | null
}

export interface PeriodRef {
  start: Date
  end: Date
  label: string
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
  /** Berlin start of the next calendar year (exclusive end of the income tax period). */
  yearEnd?: Date
  /** Berlin start of the previous calendar year (last year's income tax stays open until settled). */
  priorYearStart?: Date
  vatPeriod: { start: Date; end: Date; label: string }
  /** VAT filing period before the current one (its VAT is usually due on the 10th after it ends). */
  previousVatPeriod?: PeriodRef | null
  previousVatPeriodRows?: TransactionRow[]
  monthRows: TransactionRow[]
  vatPeriodRows: TransactionRow[]
  yearRows: TransactionRow[]
  priorYearRows: TransactionRow[] | null
  fixedCosts: FixedCostRow[]
  employees: EmployeeRow[]
  payables: PayableRow[]
  receivables: ReceivableRow[]
  reserves: ReserveRow[]
  /** Tax payments/refunds (rows with taxPaymentType), any date in the loaded range. */
  taxPaymentRows?: TransactionRow[]
}

export interface TaxReserveTarget {
  type: 'VAT' | 'INCOME_TAX'
  label: string
  periodStart: string
  periodEnd: string
  periodLabel: string
  /** CURRENT = period still running; ENDED = period over, tax not yet marked as paid/settled. */
  status: 'CURRENT' | 'ENDED'
  /** Estimated tax for the period (before payments). */
  targetCents: number
  /** Recorded payments to the Finanzamt for this period, minus refunds. */
  paidCents: number
  /** Estimated amount still owed for the period: max(0, target - paid). */
  openCents: number
  reservedCents: number
  /** What is still missing in the reserve: max(0, open - reserved). */
  shortfallCents: number
  /** Human hint on when the Finanzamt usually expects it. */
  dueNote: string
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
  incomeTax: { estimate: IncomeTaxEstimate; projectedAnnualProfit: number; profitYearToDateCents: number; minimumOnProfitSoFarCents: number }
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

/** Legal forms and filler words: sharing "GmbH" does not make two companies the same. */
const NAME_STOPWORDS = new Set([
  'gmbh', 'kgaa', 'ltd', 'inc', 'corp', 'haftungsbeschränkt', 'und', 'the', 'and',
  'zahlung', 'rechnung', 'invoice', 'payment', 'monat', 'monatlich', 'gebühr', 'gebühren',
])

/**
 * A fixed cost counts as already paid this month when an expense this month
 * mentions it (name in merchant/description) with a similar amount (±2 %, min 1 €).
 */
export function matchesFixedCost(cost: { name: string; amountCents: number }, row: TransactionRow): boolean {
  if (row.type !== 'EXPENSE') return false
  const name = normalise(cost.name)
  if (!name) return false
  const text = `${normalise(row.merchant)} ${normalise(row.description)}`
  const textWords = new Set(text.split(' '))
  const nameHit =
    text.includes(name) || name.split(' ').filter(w => w.length >= 4 && !NAME_STOPWORDS.has(w)).some(w => textWords.has(w))
  if (!nameHit) return false
  const gross = Math.abs(toCents(row.grossAmount))
  const tolerance = Math.max(100, Math.round(cost.amountCents * 0.02))
  return Math.abs(gross - cost.amountCents) <= tolerance
}

function isoDate(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 10) : undefined
}

/**
 * Each expense can settle at most ONE commitment: one 500 EUR "Miete" payment must
 * not mark both the office and the flat rent as paid.
 */
class ExpensePool {
  private used = new Set<number>()
  constructor(private readonly rows: TransactionRow[]) {}
  take(match: (row: TransactionRow) => boolean): boolean {
    for (let i = 0; i < this.rows.length; i++) {
      if (this.used.has(i)) continue
      if (match(this.rows[i])) {
        this.used.add(i)
        return true
      }
    }
    return false
  }
}

const berlinDayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })

/** 10th day after the end of the VAT period (§18 Abs. 1 UStG). `periodEnd` is the exclusive end. */
export function vatDueNote(periodEnd: Date): string {
  // periodEnd = Berlin midnight of the 1st of the next month; +9 days (+12 h against DST shifts) = the 10th.
  const tenth = new Date(periodEnd.getTime() + 9 * 24 * 3600 * 1000 + 12 * 3600 * 1000)
  return `Usually due by ${berlinDayFormat.format(tenth)} (§18 UStG; one month later with Dauerfristverlängerung)`
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
  const monthRowsExpenses = input.monthRows.filter(r => r.type === 'EXPENSE' && !r.taxPaymentType)
  const pool = new ExpensePool(monthRowsExpenses)
  for (const fc of input.fixedCosts) {
    const amountCents = Math.abs(toCents(fc.amount))
    if (amountCents === 0) continue
    if (fc.frequency === 'MONTHLY') {
      const paid = pool.take(r => matchesFixedCost({ name: fc.name, amountCents }, r))
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
      // Paid in full this month? Then it is already in this month's outflow.
      if (pool.take(r => matchesFixedCost({ name: fc.name, amountCents }, r))) continue
      // Otherwise set aside the monthly share so the bill can be paid when due.
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
    const paidViaExpense = amountCents > 0 && pool.take(r => matchesFixedCost({ name: e.name, amountCents }, r))
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
    const overdue = isPastDue(p.dueDate, input.now)
    if (overdue) {
      payOverdue += amountCents
      payOverdueCount++
    }
    // A bill the user booked by hand as an expense this month (name + FULL bill amount) is not
    // counted again. Only for bills without payments recorded in TaxKontrol: recorded payments
    // already reduced the outstanding amount, so matching them again would hide the rest.
    const totalCents = p.totalAmount !== undefined ? Math.abs(toCents(p.totalAmount)) : amountCents
    const recordedPaidCents = p.paidAmount !== undefined ? Math.abs(toCents(p.paidAmount)) : 0
    const bookedThisMonth =
      recordedPaidCents === 0 && pool.take(r => matchesFixedCost({ name: p.supplierName, amountCents: totalCents }, r))
    if (!bookedThisMonth && (p.dueDate === null || p.dueDate < input.month.end)) {
      commitments.push({
        kind: 'PAYABLE',
        id: p.id,
        label: p.supplierName,
        amountCents,
        dueDate: isoDate(p.dueDate),
        note: p.dueDate === null ? 'No due date — counted as due now' : overdue ? 'Overdue' : 'Due this month or today',
      })
    }
  }

  let recOpen = 0
  let recOverdue = 0
  let recOverdueCount = 0
  for (const r of input.receivables) {
    const amountCents = Math.abs(toCents(r.outstandingAmount))
    recOpen += amountCents
    if (isPastDue(r.dueDate, input.now)) {
      recOverdue += amountCents
      recOverdueCount++
    }
  }

  const commitmentsTotalCents = commitments.reduce((s, c) => s + c.amountCents, 0)
  const monthTaxTotal = monthVat + monthIncomeTax
  const leftFromThisMonthCents = month.businessIncomeGrossCents - month.outflowGrossCents - monthTaxTotal - commitmentsTotalCents

  // ── Reserve targets per tax period ──
  // Current periods plus the period just ended: its tax is usually paid only after
  // it ends, so it stays open until the user records the payment or marks it settled.
  const sameStart = (a: Date | null | undefined, b: Date) => !!a && a.getTime() === b.getTime()
  const reservedFor = (type: 'VAT' | 'INCOME_TAX', start: Date) =>
    input.reserves.filter(r => r.type === type && sameStart(r.periodStart, start)).reduce((sum, r) => sum + toCents(r.actuallyReserved), 0)
  const isSettled = (type: 'VAT' | 'INCOME_TAX', start: Date) =>
    input.reserves.some(r => r.type === type && sameStart(r.periodStart, start) && !!r.settledAt)
  const paidFor = (type: 'VAT' | 'INCOME_TAX', start: Date) => {
    const rows = (input.taxPaymentRows ?? []).filter(r => r.taxPaymentType === type && sameStart(r.taxPeriodStart, start))
    const totals = summarizeTransactions(rows, input.taxType)
    return type === 'VAT' ? totals.vatPaidToFinanzamtCents : totals.incomeTaxPaidCents
  }

  const reserves: TaxReserveTarget[] = []
  const addTarget = (t: Omit<TaxReserveTarget, 'paidCents' | 'openCents' | 'reservedCents' | 'shortfallCents'>, start: Date) => {
    if (isSettled(t.type, start)) return
    const paid = paidFor(t.type, start)
    const open = Math.max(0, t.targetCents - paid)
    // An ended period disappears once it is fully paid (or settled).
    if (t.status === 'ENDED' && open === 0) return
    const reserved = reservedFor(t.type, start)
    reserves.push({ ...t, paidCents: paid, openCents: open, reservedCents: reserved, shortfallCents: Math.max(0, open - reserved) })
  }

  if (input.taxType !== 'KLEINUNTERNEHMER') {
    const prev = input.previousVatPeriod
    if (prev && input.previousVatPeriodRows) {
      const prevTotals = summarizeTransactions(input.previousVatPeriodRows, input.taxType)
      addTarget(
        {
          type: 'VAT',
          label: 'VAT (Umsatzsteuer)',
          periodStart: prev.start.toISOString(),
          periodEnd: prev.end.toISOString(),
          periodLabel: prev.label,
          status: 'ENDED',
          targetCents: Math.max(0, prevTotals.vatPayableCents),
          dueNote: vatDueNote(prev.end),
        },
        prev.start
      )
    }
    addTarget(
      {
        type: 'VAT',
        label: 'VAT (Umsatzsteuer)',
        periodStart: input.vatPeriod.start.toISOString(),
        periodEnd: input.vatPeriod.end.toISOString(),
        periodLabel: input.vatPeriod.label,
        status: 'CURRENT',
        targetCents: Math.max(0, vatPeriodTotals.vatPayableCents),
        dueNote: vatDueNote(input.vatPeriod.end),
      },
      input.vatPeriod.start
    )
  }

  // Previous calendar year: income tax is assessed after the year ends (Steuerbescheid),
  // so last year's estimate stays open until it is paid or marked settled.
  if (input.priorYearStart && input.priorYearRows && input.priorYearRows.length > 0) {
    const priorYear = input.month.year - 1
    const priorProfit = summarizeTransactions(input.priorYearRows, input.taxType).profitCents
    const priorEstimate = estimateAnnualIncomeTax({ year: priorYear, annualProfit: Math.max(0, priorProfit) / 100, churchTax: church })
    addTarget(
      {
        type: 'INCOME_TAX',
        label: 'Income tax (Einkommensteuer)',
        periodStart: input.priorYearStart.toISOString(),
        periodEnd: input.yearStart.toISOString(),
        periodLabel: String(priorYear),
        status: 'ENDED',
        targetCents: Math.round(priorEstimate.total * 100),
        dueNote: 'Due as set in your Steuerbescheid — mark the year settled once it is paid',
      },
      input.priorYearStart
    )
  }

  addTarget(
    {
      type: 'INCOME_TAX',
      label: 'Income tax (Einkommensteuer)',
      periodStart: input.yearStart.toISOString(),
      periodEnd: (input.yearEnd ?? input.yearStart).toISOString(),
      periodLabel: String(input.month.year),
      status: 'CURRENT',
      targetCents: it.reserveCents,
      dueNote: 'Assessed after the year ends; advance payments (Vorauszahlungen) you record count as paid',
    },
    input.yearStart
  )

  const reserveTargetTotalCents = reserves.reduce((sum, r) => sum + r.openCents, 0)
  const reservedTotalCents = reserves.reduce((sum, r) => sum + r.reservedCents, 0)
  const reserveShortfallCents = reserves.reduce((sum, r) => sum + r.shortfallCents, 0)

  // ── Kleinunternehmer limits ──
  let klein: KleinunternehmerCheck | null = null
  if (input.taxType === 'KLEINUNTERNEHMER') {
    // Gesamtumsatz is measured without VAT (§19 Abs. 2 UStG). Rows from a year under standard
    // taxation still carry their VAT rate, so turnover is read with each row's stored rate.
    const turnover = (rows: TransactionRow[]) =>
      summarizeTransactions(rows, 'REGELBESTEUERUNG', { assumeStandardVatForUnconfirmedIncome: false }).businessIncomeNetCents
    klein = checkKleinunternehmer({
      year: input.month.year,
      priorYearTurnoverCents: input.priorYearRows ? turnover(input.priorYearRows) : 0,
      currentYearTurnoverCents: turnover(input.yearRows),
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
  if (input.taxType !== 'KLEINUNTERNEHMER' && month.assumedVatCount + year.assumedVatCount > 0) {
    limitations.push({
      code: 'ASSUMED_VAT',
      message: 'Some business income has no confirmed VAT rate. Until you check it, TaxKontrol assumes 19 % VAT on it (the cautious choice).',
    })
  }
  if (reserves.some(r => r.status === 'ENDED')) {
    limitations.push({
      code: 'ENDED_PERIOD_OPEN',
      message: 'A tax period has ended and its payment is not recorded yet. Record the payment to the Finanzamt on the Tax page, or mark the period settled.',
    })
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
    incomeTax: {
      estimate: it.estimate,
      projectedAnnualProfit: it.projectedAnnualProfit,
      profitYearToDateCents: year.profitCents,
      minimumOnProfitSoFarCents: it.minimumCents,
    },
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
