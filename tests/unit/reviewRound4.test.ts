/**
 * Independent review round 4 (2026-11-02) of 2f68d49..800f440 — pure repro tests.
 * Assertions encode the REQUIRED behaviour; a failing test = defect.
 */
import { describe, it, expect } from 'vitest'
import { computeFinancialPosition, vatPayableForRange, type PositionInput, type ReserveRow } from '@/lib/finance/position'
import { listTaxPeriods, vatPeriodFor } from '@/lib/finance/periods'
import { TaxStatusTimeline, SINCE_ALWAYS } from '@/lib/finance/taxStatus'
import { type TransactionRow } from '@/lib/finance/summary'
import { berlinMonthRange, berlinYearRange, berlinQuarterRange } from '@/lib/time/berlin'

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const row = (p: Partial<TransactionRow> & { type: 'INCOME' | 'EXPENSE'; grossAmount: number; transactionDate: Date }): TransactionRow => ({
  vatRate: 0,
  usage: 'BUSINESS',
  businessPct: 100,
  needsReview: false,
  ...p,
})
const regel = new TaxStatusTimeline([
  { validFrom: SINCE_ALWAYS, taxType: 'REGELBESTEUERUNG', vatMethod: 'SOLL', vatFilingPeriod: 'QUARTERLY', dauerfristverlaengerung: false },
])

/** Mirrors loadFinancialPosition (tracked periods w/o tax rows, tax rows separate). */
function position(now: Date, timeline: TaxStatusTimeline, rows: TransactionRow[], reserves: ReserveRow[] = []) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const m = berlinMonthRange(year, month)
  const y = berlinYearRange(year)
  const st = timeline.statusAt(now)
  const vp = vatPeriodFor(now, st.vatFilingPeriod)
  const inR = (s: Date, e: Date) => rows.filter(r => r.transactionDate >= s && r.transactionDate < e && r.transactionDate <= now)
  const nonTax = rows.filter(r => !r.taxPaymentType)
  const periods = listTaxPeriods(timeline, now).map(p => ({ ...p, rows: nonTax.filter(r => r.transactionDate >= p.start && r.transactionDate < p.end && r.transactionDate <= now) }))
  const input: PositionInput = {
    now,
    taxType: st.taxType,
    churchTaxRate: null,
    timeline,
    month: { start: m.start, end: m.end, year, month, day: now.getUTCDate(), monthsElapsed: month },
    yearStart: y.start,
    yearEnd: y.end,
    priorYearStart: berlinYearRange(year - 1).start,
    vatPeriod: vp,
    periods,
    monthRows: inR(m.start, m.end),
    vatPeriodRows: inR(vp.start, vp.end),
    yearRows: inR(y.start, y.end),
    priorYearRows: null,
    fixedCosts: [],
    employees: [],
    payables: [],
    receivables: [],
    reserves,
    taxPaymentRows: rows.filter(r => !!r.taxPaymentType && r.transactionDate <= now),
    invoices: [],
  }
  return computeFinancialPosition(input)
}

describe('R4-1 — paying the current year’s income tax (Vorauszahlung) from cash double-deducts this month’s income tax', () => {
  const now = d('2026-12-15')
  const yearStart = berlinYearRange(2026).start
  // 10,000 € net profit every month of 2026 (Regelbesteuerung, 19 % VAT).
  const income = Array.from({ length: 12 }, (_, i) => row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d(`2026-${String(i + 1).padStart(2, '0')}-05`) }))
  const itPay = (amount: number) => row({ type: 'EXPENSE', grossAmount: amount, transactionDate: d('2026-12-10'), taxPaymentType: 'INCOME_TAX', taxPeriodStart: yearStart })

  it('paying exactly the open estimated income tax from cash leaves safe-to-spend unchanged', () => {
    const p0 = position(now, regel, income)
    const it0 = p0.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'CURRENT')!
    expect(it0.openCents).toBeGreaterThan(0)
    expect(p0.monthTaxCents.incomeTax).toBeGreaterThan(0)
    const p1 = position(now, regel, [...income, itPay(it0.openCents / 100)])
    // Before: the unreserved liability (incl. this month's share) is deducted once.
    // After: the liability is gone and the same money left the account — nothing more.
    expect(p1.safeToSpendCents).toBe(p0.safeToSpendCents)
  })

  it('a Vorauszahlung larger than the estimate costs exactly the extra amount, not extra + this month’s tax', () => {
    const p0 = position(now, regel, income)
    const open = p0.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'CURRENT')!.openCents
    const p1 = position(now, regel, [...income, itPay((open + 100000) / 100)])
    expect(p1.safeToSpendCents).toBe(p0.safeToSpendCents - 100000)
  })
})

describe('R4-2 — reserve model vs. uncovered-payment model disagree after a refund (Low, conservative)', () => {
  it('payment → refund → payment again of a fully reserved ended VAT quarter is covered by the reserve', () => {
    const now = d('2026-11-15')
    const q3 = berlinQuarterRange(2026, 3).start
    const base = [row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-08-10') })]
    const reserves: ReserveRow[] = [{ type: 'VAT', periodStart: q3, actuallyReserved: 1900 }]
    const pReservedOnly = position(now, regel, base, reserves)
    expect(pReservedOnly.endedPeriodShortfallCents).toBe(0)
    const tax = [
      row({ type: 'EXPENSE', grossAmount: 1900, transactionDate: d('2026-10-05'), taxPaymentType: 'VAT', taxPeriodStart: q3 }),
      row({ type: 'INCOME', grossAmount: 1900, transactionDate: d('2026-10-20'), taxPaymentType: 'VAT', taxPeriodStart: q3 }),
      row({ type: 'EXPENSE', grossAmount: 1900, transactionDate: d('2026-11-10'), taxPaymentType: 'VAT', taxPeriodStart: q3 }),
    ]
    // In October (after the refund) the period showed reserveLeft 1,900 € / shortfall 0: the
    // November payment is paid from that reserve, so it must not be deducted from this month again.
    const p = position(now, regel, [...base, ...tax], reserves)
    expect(p.safeToSpendCents).toBe(pReservedOnly.safeToSpendCents)
  })
})

describe('R4-7 — a linked booking dated before the invoice (prepayment) is taxed at its OWN rate; the invoice VAT is dropped', () => {
  it('invoice 11,900 € at 19 %, its payment (bank line booked at 0 %, linked) dated 5 days earlier → 1,900 € VAT stays due', () => {
    const q4 = berlinQuarterRange(2026, 4)
    const invoices = [{ id: 'inv1', customerName: 'K', invoiceDate: d('2026-10-10'), totalAmount: 11900, vatRate: 19, unlinkedPaidCents: 0, dateConfirmed: true }]
    const rows = [row({ type: 'INCOME', grossAmount: 11900, vatRate: 0, transactionDate: d('2026-10-05'), receivableId: 'inv1', statusDate: d('2026-10-10') })]
    const v = vatPayableForRange({ rows, invoices, timeline: regel, start: q4.start, end: q4.end })
    expect(v.vatPayableCents).toBe(190000)
  })
})
