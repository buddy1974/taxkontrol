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
import { toCents, percentOf, splitGross, type MoneyInput } from './money'
import { summarizeTransactions, ASSUMED_STANDARD_VAT_RATE, type TransactionRow, type TransactionTotals } from './summary'
import { estimateAnnualIncomeTax, incomeTaxReserveYearToDate, type IncomeTaxEstimate } from './incomeTax'
import type { TaxType } from './transactionAmounts'
import { checkKleinunternehmer, type KleinunternehmerCheck } from './kleinunternehmer'
import { isPastDue, berlinDate, berlinMidnight } from '../time/berlin'
import { TaxStatusTimeline } from './taxStatus'
import { vatDueNote as vatDueNoteFor, type TaxPeriod } from './periods'
import { rulesForYear } from './rules'

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

/** A customer invoice (receivable) — needed for Soll-Versteuerung. */
export interface InvoiceRow {
  id: string
  customerName: string
  /** Invoice date (VAT period under Soll). */
  invoiceDate: Date
  totalAmount: MoneyInput
  /** VAT rate on the invoice; null = unknown (19 % assumed for VAT-registered users). */
  vatRate: MoneyInput | null
  /**
   * Part of the invoice paid WITHOUT a linked TaxKontrol booking (entered by hand / before
   * linking existed). That money is already in the cash records, so it is taxed there.
   */
  unlinkedPaidCents: number
  /** False for invoices recorded before invoice dates existed (date = when it was entered). */
  dateConfirmed?: boolean
  /**
   * Linked payments dated BEFORE the invoice day (Anzahlungen). Their VAT is due for the period
   * the money arrived (§13 Abs. 1 Nr. 1a S. 4 UStG) and stays there; the invoice's VAT is reduced
   * by exactly the VAT those bookings were taxed with (never by more — R4-7). Undefined = derived
   * from the rows given to computeFinancialPosition / vatPayableForRange.
   */
  prepayments?: TransactionRow[]
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
  /**
   * Status history. Without it, `taxType` (and the current period's filing rhythm) applies
   * to every date — old callers and simple tests.
   */
  timeline?: TaxStatusTimeline
  /**
   * Every tracked tax period (listTaxPeriods) with the non-future rows inside it. When
   * given, it replaces previousVatPeriod/priorYearRows for the reserve targets.
   */
  periods?: Array<TaxPeriod & { rows: TransactionRow[] }>
  /** Customer invoices (Soll-Versteuerung). */
  invoices?: InvoiceRow[]
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
  /** What the user entered as set aside for this period (in total, incl. what was paid from it). */
  reservedCents: number
  /** Set-aside money still there: max(0, reserved - paid). A payment is taken from the reserve. */
  reserveLeftCents: number
  /** What is still missing in the reserve: max(0, open - reserveLeft). */
  shortfallCents: number
  /** Human hint on when the Finanzamt usually expects it. */
  dueNote: string
  /** VAT only: how the estimate was made. */
  vatMethod?: 'SOLL' | 'IST'
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
  /**
   * What can be spent without touching money for taxes or bills (may be negative):
   * left from this month − unreserved tax of ENDED periods − unreserved tax of the
   * current periods that was caused before this month (this month's is already deducted).
   */
  safeToSpendCents: number
  /** Unreserved estimated tax of ended periods (already due or soon due). */
  endedPeriodShortfallCents: number
  /**
   * Codes of open questions that make a "safe to spend" answer unreliable (unclassified
   * money, assumed VAT, Kleinunternehmer limit, ...). Empty = no known material uncertainty.
   */
  uncertainties: string[]
  reserves: TaxReserveTarget[]
  reserveTargetTotalCents: number
  reservedTotalCents: number
  /** Set aside and not yet paid to the Finanzamt (what covers the open tax). */
  reserveLeftTotalCents: number
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


/** 10th day after the end of the VAT period (§18 Abs. 1 UStG). `periodEnd` is the exclusive end. */
export function vatDueNote(periodEnd: Date, opts: { yearly?: boolean; dauerfrist?: boolean } = {}): string {
  return vatDueNoteFor(periodEnd, opts)
}

/**
 * Output VAT of customer invoices dated in [start, end) under Soll-Versteuerung (§13 Abs. 1
 * Nr. 1a UStG): due for the period of the invoice, whether paid or not. Only invoices dated
 * while the user was VAT-registered with the Soll method count.
 */
/** Berlin start of the invoice's calendar day: linked payments before it are prepayments. */
function invoiceDayStart(inv: InvoiceRow): Date {
  const d = berlinDate(inv.invoiceDate)
  return berlinMidnight(d.year, d.month, d.day)
}

/** Linked income booked before the invoice day. */
function prepaymentRowsOf(inv: InvoiceRow, rows: TransactionRow[]): TransactionRow[] {
  if (inv.prepayments) return inv.prepayments
  const day = invoiceDayStart(inv)
  return rows.filter(r => r.receivableId === inv.id && r.type === 'INCOME' && !r.taxPaymentType && r.transactionDate < day)
}

function sollInvoiceVat(invoices: InvoiceRow[], timeline: TaxStatusTimeline, start: Date, end: Date, rows: TransactionRow[]) {
  let vatCents = 0
  let assumed = 0
  for (const inv of invoices) {
    if (inv.invoiceDate < start || inv.invoiceDate >= end) continue
    const st = timeline.statusAt(inv.invoiceDate)
    if (st.taxType === 'KLEINUNTERNEHMER' || st.vatMethod !== 'SOLL') continue
    const base = Math.max(0, Math.abs(toCents(inv.totalAmount)) - Math.max(0, inv.unlinkedPaidCents))
    if (base === 0) continue
    const rate = inv.vatRate === null || inv.vatRate === undefined ? null : Number(String(inv.vatRate))
    if (rate === null || !Number.isFinite(rate)) assumed++
    const invoiceVat = splitGross(base, rate === null || !Number.isFinite(rate) ? ASSUMED_STANDARD_VAT_RATE : rate).vatCents
    // VAT already taxed on prepayments (with the same reading as their cash taxation).
    const prepaidVat = Math.max(0, summarizeTransactions(prepaymentRowsOf(inv, rows), timeline).vatPayableCents)
    vatCents += Math.max(0, invoiceVat - prepaidVat)
  }
  return { vatCents, assumed }
}

/**
 * VAT payable for [start, end): cash rows read with the status valid on their date; under
 * Soll, invoices dated in the range are added and payments booked against an invoice
 * counted under Soll are not taxed a second time.
 */
export function vatPayableForRange(params: {
  rows: TransactionRow[]
  invoices: InvoiceRow[]
  timeline: TaxStatusTimeline
  start: Date
  end: Date
}): { vatPayableCents: number; assumedVatCount: number } {
  const { rows, invoices, timeline, start, end } = params
  // Soll invoice id → start of its invoice day. A linked payment from that day on is part of the
  // invoice (taxed with it); a linked payment before it is a prepayment and stays cash VAT.
  const sollInvoiceDay = new Map(
    invoices
      .filter(inv => {
        const st = timeline.statusAt(inv.invoiceDate)
        return st.taxType !== 'KLEINUNTERNEHMER' && st.vatMethod === 'SOLL'
      })
      .map(inv => [inv.id, invoiceDayStart(inv)] as const)
  )
  const cashRows = rows.filter(r => {
    const day = r.receivableId ? sollInvoiceDay.get(r.receivableId) : undefined
    return !(day && r.transactionDate >= day)
  })
  const cash = summarizeTransactions(cashRows, timeline)
  const inv = sollInvoiceVat(invoices, timeline, start, end, rows)
  return { vatPayableCents: cash.vatPayableCents + inv.vatCents, assumedVatCount: cash.assumedVatCount + inv.assumed }
}

/**
 * Fills InvoiceRow.prepayments where the caller did not: linked income dated before the invoice
 * day, taken from the VAT-period rows (VAT periods never overlap, so no row twice).
 */
function withPrepayments(input: PositionInput): InvoiceRow[] {
  const invoices = input.invoices ?? []
  if (invoices.every(inv => inv.prepayments !== undefined)) return invoices
  const vatRows = input.periods
    ? input.periods.filter(p => p.type === 'VAT').flatMap(p => p.rows)
    : [...(input.previousVatPeriodRows ?? []), ...input.vatPeriodRows]
  return invoices.map(inv => (inv.prepayments !== undefined ? inv : { ...inv, prepayments: prepaymentRowsOf(inv, vatRows) }))
}

export function computeFinancialPosition(input: PositionInput): FinancialPosition {
  const limitations: Limitation[] = []
  const uncertainties = new Set<string>()
  const timeline = input.timeline ?? TaxStatusTimeline.constant({ taxType: input.taxType })
  const invoices = withPrepayments(input)
  const month = summarizeTransactions(input.monthRows, timeline)
  const year = summarizeTransactions(input.yearRows, timeline)
  const vatPeriodTotals = summarizeTransactions(input.vatPeriodRows, timeline)
  let assumedVatCount = month.assumedVatCount + year.assumedVatCount

  // ── Income tax: estimate on the year so far, projected to a full year ──
  const church = input.churchTaxRate ? { rate: input.churchTaxRate } : null
  const it = incomeTaxReserveYearToDate({
    year: input.month.year,
    profitYearToDateCents: year.profitCents,
    monthsElapsed: input.month.monthsElapsed,
    churchTax: church,
  })
  const monthIncomeTax = month.profitCents > 0 ? Math.round(month.profitCents * it.estimate.effectiveRate) : 0
  // This month's VAT with the method valid then (Soll: invoices issued this month count too).
  const monthVatCalc = vatPayableForRange({ rows: input.monthRows, invoices, timeline, start: input.month.start, end: input.month.end })
  const monthVat = Math.max(0, monthVatCalc.vatPayableCents)
  assumedVatCount += monthVatCalc.assumedVatCount

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
  // Every tracked period stays open until the user records the payment or marks it settled:
  // the tax of a period is usually paid only after it ends, and an unpaid obligation must
  // not disappear because the calendar moved on or the status was changed later.
  const sameStart = (a: Date | null | undefined, b: Date) => !!a && a.getTime() === b.getTime()
  const reservedFor = (type: 'VAT' | 'INCOME_TAX', start: Date) =>
    input.reserves.filter(r => r.type === type && sameStart(r.periodStart, start)).reduce((sum, r) => sum + toCents(r.actuallyReserved), 0)
  const isSettled = (type: 'VAT' | 'INCOME_TAX', start: Date) =>
    input.reserves.some(r => r.type === type && sameStart(r.periodStart, start) && !!r.settledAt)
  const paidFor = (type: 'VAT' | 'INCOME_TAX', start: Date) => {
    const rows = (input.taxPaymentRows ?? []).filter(r => r.taxPaymentType === type && sameStart(r.taxPeriodStart, start))
    const totals = summarizeTransactions(rows, timeline)
    return type === 'VAT' ? totals.vatPaidToFinanzamtCents : totals.incomeTaxPaidCents
  }

  const reserves: TaxReserveTarget[] = []
  const addTarget = (
    t: Omit<TaxReserveTarget, 'paidCents' | 'openCents' | 'reservedCents' | 'reserveLeftCents' | 'shortfallCents'>,
    start: Date,
    /** Signed estimate (VAT: negative = credit / Vorsteuerüberhang); defaults to targetCents. */
    netCents: number = t.targetCents
  ) => {
    if (isSettled(t.type, start)) return
    const paid = paidFor(t.type, start)
    // A refund of a credit is measured against the signed estimate, not the clamped 0 (NF-01).
    const open = Math.max(0, netCents - paid)
    // An ended period disappears once it is fully paid (or settled).
    if (t.status === 'ENDED' && open === 0) return
    const reserved = reservedFor(t.type, start)
    // Money paid to the Finanzamt for this period came out of what was set aside for it (NF-03).
    const reserveLeft = Math.max(0, reserved - Math.max(0, paid))
    reserves.push({ ...t, paidCents: paid, openCents: open, reservedCents: reserved, reserveLeftCents: reserveLeft, shortfallCents: Math.max(0, open - reserveLeft) })
  }

  for (const p of input.periods ?? legacyPeriods(input)) {
    if (p.type === 'VAT') {
      const v = vatPayableForRange({ rows: p.rows, invoices, timeline, start: p.start, end: p.end })
      if (!timeline.vatLiableWithin(p.start, p.end) && v.vatPayableCents <= 0) continue
      assumedVatCount += v.assumedVatCount
      if (timeline.changesWithin(p.start, p.end)) {
        limitations.push({ code: 'STATUS_CHANGED_IN_PERIOD', message: `Your tax status changed during ${p.label}; each booking is calculated with the status valid on its date.` })
      }
      addTarget(
        {
          type: 'VAT',
          label: 'VAT (Umsatzsteuer)',
          periodStart: p.start.toISOString(),
          periodEnd: p.end.toISOString(),
          periodLabel: p.label,
          status: p.status,
          targetCents: Math.max(0, v.vatPayableCents),
          dueNote: vatDueNote(p.end, { yearly: p.vatFilingPeriod === 'YEARLY', dauerfrist: p.dauerfristverlaengerung }),
          vatMethod: timeline.statusAt(p.start).vatMethod,
        },
        p.start,
        v.vatPayableCents
      )
    } else if (p.status === 'CURRENT') {
      addTarget(
        {
          type: 'INCOME_TAX',
          label: 'Income tax (Einkommensteuer)',
          periodStart: p.start.toISOString(),
          periodEnd: p.end.toISOString(),
          periodLabel: p.label,
          status: 'CURRENT',
          targetCents: it.reserveCents,
          dueNote: 'Assessed after the year ends; advance payments (Vorauszahlungen) you record count as paid',
        },
        p.start
      )
    } else {
      // Income tax is assessed after the year ends (Steuerbescheid), often a year or two later.
      if (p.rows.length === 0) continue
      const profit = summarizeTransactions(p.rows, timeline).profitCents
      const est = estimateAnnualIncomeTax({ year: berlinDate(p.start).year, annualProfit: Math.max(0, profit) / 100, churchTax: church })
      addTarget(
        {
          type: 'INCOME_TAX',
          label: 'Income tax (Einkommensteuer)',
          periodStart: p.start.toISOString(),
          periodEnd: p.end.toISOString(),
          periodLabel: p.label,
          status: 'ENDED',
          targetCents: Math.round(est.total * 100),
          dueNote: 'Due as set in your Steuerbescheid — mark the year settled once it is paid',
        },
        p.start
      )
    }
  }

  const reserveTargetTotalCents = reserves.reduce((sum, r) => sum + r.openCents, 0)
  const reservedTotalCents = reserves.reduce((sum, r) => sum + r.reservedCents, 0)
  // What is still set aside after payments — the money that actually covers what is open (R4-4).
  const reserveLeftTotalCents = reserves.reduce((sum, r) => sum + r.reserveLeftCents, 0)
  const reserveShortfallCents = reserves.reduce((sum, r) => sum + r.shortfallCents, 0)
  const endedPeriodShortfallCents = reserves.filter(r => r.status === 'ENDED').reduce((sum, r) => sum + r.shortfallCents, 0)

  // A payment to the Finanzamt this month is paid from the reserve only as far as money was set
  // aside for that period; the rest left the account this month like any other payment
  // (otherwise paying an unreserved tax would make the same money look free again). Payments and
  // refunds count net, as in reserveLeft (R4-2).
  const inMonth = (r: TransactionRow) => r.transactionDate >= input.month.start && r.transactionDate < input.month.end
  const signedTax = (r: TransactionRow) => (r.type === 'EXPENSE' ? 1 : -1) * Math.abs(toCents(r.grossAmount))
  const uncoveredFor = (type: 'VAT' | 'INCOME_TAX', start: Date) => {
    const rows = (input.taxPaymentRows ?? []).filter(r => r.taxPaymentType === type && sameStart(r.taxPeriodStart, start))
    const netThisMonth = rows.filter(inMonth).reduce((s, r) => s + signedTax(r), 0)
    if (netThisMonth <= 0) return 0
    const netBefore = Math.max(0, rows.filter(r => r.transactionDate < input.month.start).reduce((s, r) => s + signedTax(r), 0))
    const reserveLeftAtMonthStart = Math.max(0, reservedFor(type, start) - netBefore)
    return Math.max(0, netThisMonth - reserveLeftAtMonthStart)
  }
  const paidPeriods = new Map<string, { type: 'VAT' | 'INCOME_TAX'; start: Date }>()
  for (const r of input.taxPaymentRows ?? []) {
    if ((r.taxPaymentType === 'VAT' || r.taxPaymentType === 'INCOME_TAX') && r.taxPeriodStart && inMonth(r)) {
      paidPeriods.set(`${r.taxPaymentType}|${r.taxPeriodStart.getTime()}`, { type: r.taxPaymentType, start: r.taxPeriodStart })
    }
  }
  const currentStart = new Map<'VAT' | 'INCOME_TAX', number>()
  for (const p of input.periods ?? []) if (p.status === 'CURRENT') currentStart.set(p.type, p.start.getTime())
  for (const r of reserves) if (r.status === 'CURRENT' && !currentStart.has(r.type)) currentStart.set(r.type, new Date(r.periodStart).getTime())

  // This month's taxes are already deducted in "left from this month". For the CURRENT period of
  // each tax type, what is unreserved (shortfall) plus what left uncovered this month is not free
  // money either — minus this month's own tax of that type, which is already deducted. One
  // combined term per type, so a payment of this month's tax is not deducted twice (R4-1) and
  // this month's VAT never offsets income tax (NF-02).
  const monthTaxOf = { VAT: monthVat, INCOME_TAX: monthIncomeTax }
  let currentPeriodDeductionCents = 0
  let otherUncoveredCents = 0
  for (const type of ['VAT', 'INCOME_TAX'] as const) {
    const cs = currentStart.get(type)
    const shortfall = reserves.filter(r => r.type === type && r.status === 'CURRENT').reduce((s, r) => s + r.shortfallCents, 0)
    const uncovered = cs === undefined ? 0 : uncoveredFor(type, new Date(cs))
    currentPeriodDeductionCents += Math.max(0, shortfall + uncovered - monthTaxOf[type])
  }
  for (const g of paidPeriods.values()) {
    if (currentStart.get(g.type) === g.start.getTime()) continue
    otherUncoveredCents += uncoveredFor(g.type, g.start)
  }
  const uncoveredTaxPaymentsCents = otherUncoveredCents
  const safeToSpendCents = leftFromThisMonthCents - endedPeriodShortfallCents - currentPeriodDeductionCents - uncoveredTaxPaymentsCents
  if (endedPeriodShortfallCents > 0) uncertainties.add('ENDED_PERIOD_UNRESERVED')

  // Soll: an unlinked income booking with exactly an invoice's amount is probably its payment;
  // then its VAT is counted twice (invoice + cash) until the user links them.
  const sollInvoices = invoices.filter(inv => {
    const st = timeline.statusAt(inv.invoiceDate)
    return st.taxType !== 'KLEINUNTERNEHMER' && st.vatMethod === 'SOLL' && Math.abs(toCents(inv.totalAmount)) - inv.unlinkedPaidCents > 0
  })
  if (sollInvoices.some(inv => inv.dateConfirmed === false)) {
    uncertainties.add('LEGACY_INVOICE_DATES')
    limitations.push({
      code: 'LEGACY_INVOICE_DATES',
      message: 'Some customer invoices were entered before TaxKontrol asked for the invoice date and VAT rate. Their VAT is counted in the period you entered them, at 19 % if unknown. Check them under “Customers owe me”.',
    })
  }
  if (sollInvoices.length > 0) {
    const amounts = new Set(sollInvoices.map(inv => Math.abs(toCents(inv.totalAmount)) - inv.unlinkedPaidCents))
    const allRows = (input.periods ?? []).flatMap(p => (p.type === 'VAT' ? p.rows : []))
    const suspicious = allRows.filter(r => r.type === 'INCOME' && !r.receivableId && !r.taxPaymentType && r.usage === 'BUSINESS' && amounts.has(Math.abs(toCents(r.grossAmount))))
    if (suspicious.length > 0) {
      uncertainties.add('POSSIBLE_UNLINKED_INVOICE_PAYMENT')
      limitations.push({
        code: 'POSSIBLE_UNLINKED_INVOICE_PAYMENT',
        message: `${suspicious.length} income booking(s) have exactly the amount of an open customer invoice. If one is the payment, record it on the invoice (“already booked”) and choose that booking — otherwise its VAT is counted twice.`,
      })
    }
  }

  // ── Kleinunternehmer limits ──
  let klein: KleinunternehmerCheck | null = null
  if (input.taxType === 'KLEINUNTERNEHMER') {
    // Gesamtumsatz is measured without VAT (§19 Abs. 2 UStG). Rows from a year under standard
    // taxation still carry their VAT rate, so turnover is read with each row's stored rate.
    // Incoming money not yet classified (e.g. bank import) is COUNTED: missing a hard limit is
    // the expensive error, so the check stays cautious until the user classifies it.
    const turnover = (rows: TransactionRow[]) => {
      const t = summarizeTransactions(rows, 'REGELBESTEUERUNG', { assumeStandardVatForUnconfirmedIncome: false })
      return { total: t.businessIncomeNetCents + t.unclearInflowCents, unclear: t.unclearInflowCents }
    }
    const prior = input.priorYearRows ? turnover(input.priorYearRows) : { total: 0, unclear: 0 }
    const current = turnover(input.yearRows)
    klein = checkKleinunternehmer({
      year: input.month.year,
      priorYearTurnoverCents: prior.total,
      currentYearTurnoverCents: current.total,
      hasPriorYearData: (input.priorYearRows?.length ?? 0) > 0,
    })
    const unclear = prior.unclear + current.unclear
    if (unclear > 0) {
      klein = { ...klein, unclassifiedCents: unclear }
      uncertainties.add('KLEIN_UNCLASSIFIED')
      limitations.push({
        code: 'KLEIN_UNCLASSIFIED',
        message: `The Kleinunternehmer limit check counts ${(unclear / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} of incoming money you have not classified yet as turnover. Classify it (business or private) to make the check exact.`,
      })
    }
    if (klein.status !== 'OK') uncertainties.add('KLEIN_LIMIT')
  }

  // Gewerbesteuer is not estimated (municipal Hebesatz unknown; Freiberufler do not pay it).
  const tradeTaxFreibetrag = rulesForYear(input.month.year).rules.gewerbesteuer.freibetrag
  if (it.projectedAnnualProfit > tradeTaxFreibetrag) {
    uncertainties.add('TRADE_TAX_NOT_RESERVED')
    limitations.push({
      code: 'TRADE_TAX_NOT_RESERVED',
      message: `Projected profit is above ${tradeTaxFreibetrag.toLocaleString('de-DE')} €. If you run a Gewerbe (not a Freiberuf), Gewerbesteuer may be due — TaxKontrol does not reserve it. Ask your Steuerberater for the amount (§11 GewStG).`,
    })
  }

  // ── Limitations the user must know about ──
  if (it.estimate.provisionalRules) {
    limitations.push({ code: 'PROVISIONAL_RULES', message: `Tax rules for ${input.month.year} are not final; the latest enacted rules were used.` })
  }
  if (month.unclearInflowCents > 0 || month.unclearOutflowCents > 0 || year.unclearInflowCents > 0 || year.unclearOutflowCents > 0) {
    uncertainties.add('UNCLEAR_TRANSACTIONS')
    limitations.push({ code: 'UNCLEAR_TRANSACTIONS', message: 'Some transactions are marked “not sure”. They are left out of profit and taxes until you classify them.' })
  }
  if (input.taxType === 'PAUSCHALIERUNG') {
    limitations.push({ code: 'PAUSCHALIERUNG', message: 'Special VAT flat-rate schemes are not modelled. VAT is estimated as under standard taxation.' })
  }
  if (input.taxType !== 'KLEINUNTERNEHMER') {
    const st = timeline.statusAt(input.now)
    limitations.push({ code: 'VAT_PERIOD', message: `VAT reserve is shown for ${input.vatPeriod.label}. Change your VAT filing period in Settings if it is different.` })
    limitations.push({
      code: 'VAT_METHOD',
      message:
        st.vatMethod === 'IST'
          ? 'VAT is estimated when money is received (Istversteuerung — you confirmed the Finanzamt approved it, §20 UStG).'
          : 'VAT is estimated with the invoice date (Sollversteuerung, the legal default): invoices you issued count even before the customer pays. If the Finanzamt approved Istversteuerung (§20 UStG), confirm it in Settings.',
    })
  }
  if (assumedVatCount > 0) {
    uncertainties.add('ASSUMED_VAT')
    limitations.push({
      code: 'ASSUMED_VAT',
      message: 'Some business income or customer invoices have no confirmed VAT rate. Until you check them, TaxKontrol assumes 19 % VAT (the cautious choice).',
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
    safeToSpendCents,
    endedPeriodShortfallCents,
    uncertainties: [...uncertainties],
    reserves,
    reserveTargetTotalCents,
    reservedTotalCents,
    reserveLeftTotalCents,
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
  // Safe to spend, not just "left from this month": unreserved taxes of earlier periods come first.
  const left = position.safeToSpendCents
  const remainingAfter = left - requestedCents
  return {
    requestedCents,
    leftCents: left,
    remainingAfterCents: remainingAfter,
    fits: requestedCents > 0 && remainingAfter >= 0,
    uncertainties: position.uncertainties,
    shareOfLeft: left > 0 ? Math.round((requestedCents / left) * 100) : null,
    reserveShortfallCents: position.reserveShortfallCents,
    bufferWarning: left > 0 && requestedCents > percentOf(left, 70),
  }
}

/** Old callers: the current periods plus the one previous VAT period / prior year. */
function legacyPeriods(input: PositionInput): Array<TaxPeriod & { rows: TransactionRow[] }> {
  const out: Array<TaxPeriod & { rows: TransactionRow[] }> = []
  if (input.previousVatPeriod && input.previousVatPeriodRows) {
    out.push({ ...input.previousVatPeriod, type: 'VAT', status: 'ENDED', rows: input.previousVatPeriodRows })
  }
  out.push({ ...input.vatPeriod, type: 'VAT', status: 'CURRENT', rows: input.vatPeriodRows })
  if (input.priorYearStart && input.priorYearRows) {
    out.push({ start: input.priorYearStart, end: input.yearStart, label: String(input.month.year - 1), type: 'INCOME_TAX', status: 'ENDED', rows: input.priorYearRows })
  }
  out.push({ start: input.yearStart, end: input.yearEnd ?? input.yearStart, label: String(input.month.year), type: 'INCOME_TAX', status: 'CURRENT', rows: input.yearRows })
  return out
}
