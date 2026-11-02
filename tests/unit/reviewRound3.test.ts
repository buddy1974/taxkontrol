/**
 * Independent financial review (2026-11-02) of commit 2f68d49 — repro tests.
 * Every assertion encodes what a cautious tool / German law REQUIRES. A failing test = defect.
 */
import { describe, it, expect } from 'vitest'
import { evaluateDecision } from '@/lib/decision/safeToSpendDecision'
import { computeFinancialPosition, type PositionInput, type InvoiceRow, type ReserveRow } from '@/lib/finance/position'
import { listTaxPeriods, vatPeriodFor } from '@/lib/finance/periods'
import { TaxStatusTimeline, SINCE_ALWAYS, type TaxStatusEntry } from '@/lib/finance/taxStatus'
import { type TransactionRow } from '@/lib/finance/summary'
import { berlinMonthRange, berlinYearRange, berlinQuarterRange, berlinMidnight } from '@/lib/time/berlin'
import { checkKleinunternehmer } from '@/lib/finance/kleinunternehmer'
import type { DecisionContext } from '@/lib/decision/decisionTypes'

const d = (s: string) => new Date(`${s}T12:00:00Z`)
const row = (p: Partial<TransactionRow> & { type: 'INCOME' | 'EXPENSE'; grossAmount: number; transactionDate: Date }): TransactionRow => ({
  vatRate: 0,
  usage: 'BUSINESS',
  businessPct: 100,
  needsReview: false,
  ...p,
})
const regel = (over: Partial<TaxStatusEntry> = {}): TaxStatusEntry => ({
  validFrom: SINCE_ALWAYS,
  taxType: 'REGELBESTEUERUNG',
  vatMethod: 'SOLL',
  vatFilingPeriod: 'QUARTERLY',
  dauerfristverlaengerung: false,
  ...over,
})

/** Mirrors loadFinancialPosition: tracked periods with non-tax rows, tax rows separate, invoices <= now. */
function position(now: Date, timeline: TaxStatusTimeline, rows: TransactionRow[], extra: Partial<PositionInput> = {}) {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() + 1
  const m = berlinMonthRange(year, month)
  const y = berlinYearRange(year)
  const st = timeline.statusAt(now)
  const vp = vatPeriodFor(now, st.vatFilingPeriod)
  const inR = (s: Date, e: Date) => rows.filter(r => r.transactionDate >= s && r.transactionDate < e && r.transactionDate <= now)
  const nonTax = rows.filter(r => !r.taxPaymentType)
  const inRN = (s: Date, e: Date) => nonTax.filter(r => r.transactionDate >= s && r.transactionDate < e && r.transactionDate <= now)
  const periods = listTaxPeriods(timeline, now).map(p => ({ ...p, rows: inRN(p.start, p.end) }))
  const prior = inR(berlinYearRange(year - 1).start, y.start)
  const invoices = (extra.invoices ?? []).filter(i => i.invoiceDate <= now)
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
    priorYearRows: prior.length ? prior : null,
    fixedCosts: [],
    employees: [],
    payables: [],
    receivables: [],
    reserves: [],
    taxPaymentRows: rows.filter(r => !!r.taxPaymentType && r.transactionDate <= now),
    ...extra,
    invoices,
  }
  return computeFinancialPosition(input)
}

function ctxFrom(p: ReturnType<typeof position>): DecisionContext {
  return {
    userId: 'u', taxType: p.taxType, currentMonthIncome: p.month.businessIncomeNetCents / 100, currentMonthExpenses: 0,
    totalFixedCosts: 0, taxOwed: p.reserveTargetTotalCents / 100, taxReserved: p.reservedTotalCents / 100, totalPayables: 0,
    totalSalaries: 0, safeToSpend: p.safeToSpendCents / 100, endedPeriodShortfall: p.endedPeriodShortfallCents / 100,
    uncertainties: p.uncertainties, monthsWithData: 6, totalTransactions: 40, hasProfile: true, openCaseCount: 0,
    openCaseEscalated: false, persona: null,
  }
}

describe('NF-01 — a Finanzamt refund of a Vorsteuerüberhang becomes a phantom liability', () => {
  it('Q3 with 1,900 € input VAT surplus, refund recorded → no VAT open for Q3', () => {
    const tl = new TaxStatusTimeline([regel()])
    const q3 = berlinQuarterRange(2026, 3)
    const now = d('2026-11-20')
    const rows = [
      row({ type: 'EXPENSE', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-08-10') }), // input VAT 1,900
      // Finanzamt refunds the 1,900 € surplus (recorded on the Tax page as REFUND)
      row({ type: 'INCOME', grossAmount: 1900, transactionDate: d('2026-10-20'), taxPaymentType: 'VAT', taxPeriodStart: q3.start }),
    ]
    const p = position(now, tl, rows)
    const q3Target = p.reserves.find(r => r.type === 'VAT' && r.periodStart === q3.start.toISOString())
    // Expected: nothing open for Q3 (the refund was exactly what was owed to the user).
    expect(q3Target?.openCents ?? 0).toBe(0)
    expect(p.endedPeriodShortfallCents).toBe(0)
  })
})

describe('NF-02 — reserving this month’s tax makes earlier unreserved tax look spendable', () => {
  it('setting aside the current month’s VAT must not raise safe-to-spend', () => {
    const tl = new TaxStatusTimeline([regel()])
    const now = d('2026-11-20')
    const rows = [
      row({ type: 'INCOME', grossAmount: 50000, vatRate: 0, transactionDate: d('2026-03-10') }), // earlier profit → income tax
      row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-11-05') }), // this month: 1,900 € VAT
    ]
    const q4 = berlinQuarterRange(2026, 4)
    const none = position(now, tl, rows)
    const reserved: ReserveRow[] = [{ type: 'VAT', periodStart: q4.start, actuallyReserved: 1900 }]
    const withReserve = position(now, tl, rows, { reserves: reserved })
    // The 1,900 € set aside IS this month's VAT, which "left from this month" already deducts.
    // Setting it aside must not free up 1,900 € of the unreserved income tax of March.
    expect(withReserve.safeToSpendCents).toBe(none.safeToSpendCents)
  })
})

describe('NF-03 — the reserve is counted twice when a tax payment is made from it', () => {
  it('ENDED Q3: 1,900 € due, 1,000 € set aside, 1,000 € paid from it → 900 € still unreserved', () => {
    const tl = new TaxStatusTimeline([regel()])
    const q3 = berlinQuarterRange(2026, 3)
    const now = d('2026-11-20')
    const rows = [
      row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-08-10') }),
      row({ type: 'EXPENSE', grossAmount: 1000, transactionDate: d('2026-11-10'), taxPaymentType: 'VAT', taxPeriodStart: q3.start }),
    ]
    const reserves: ReserveRow[] = [{ type: 'VAT', periodStart: q3.start, actuallyReserved: 1000 }]
    const p = position(now, tl, rows, { reserves })
    const q3t = p.reserves.find(r => r.periodStart === q3.start.toISOString())!
    expect(q3t.openCents).toBe(90000)
    // The model itself says the 1,000 € payment came out of the reserve (uncovered = 0), so the
    // reserve that is left is 0 and the 900 € still owed is NOT set aside.
    expect(q3t.shortfallCents).toBe(90000)
    expect(p.endedPeriodShortfallCents).toBe(90000)
  })

  it('…and the decision centre then says SAFE for an unpaid ended VAT balance', () => {
    const tl = new TaxStatusTimeline([regel()])
    const q3 = berlinQuarterRange(2026, 3)
    const now = d('2026-11-20')
    const rows = [
      row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-08-10') }),
      row({ type: 'EXPENSE', grossAmount: 1000, transactionDate: d('2026-11-10'), taxPaymentType: 'VAT', taxPeriodStart: q3.start }),
      row({ type: 'INCOME', grossAmount: 6000, vatRate: 0, transactionDate: d('2026-11-12') }),
    ]
    const q4 = berlinQuarterRange(2026, 4)
    const y = berlinYearRange(2026)
    // User set aside 1,000 € for Q3 and fully reserved the current periods.
    const pre = position(now, tl, rows)
    const itTarget = pre.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'CURRENT')!.openCents
    const reserves: ReserveRow[] = [
      { type: 'VAT', periodStart: q3.start, actuallyReserved: 1000 },
      { type: 'VAT', periodStart: q4.start, actuallyReserved: 0 },
      { type: 'INCOME_TAX', periodStart: y.start, actuallyReserved: itTarget / 100 },
    ]
    const p = position(now, tl, rows, { reserves })
    const r = evaluateDecision(ctxFrom(p), { amount: 100, purpose: 'x', decisionType: 'SPEND' }, [], [])
    expect(p.reserves.some(x => x.status === 'ENDED' && x.openCents > 0)).toBe(true)
    expect(r.resultLevel).not.toBe('SAFE')
  })
})

describe('NF-04 — Soll: an Anzahlung (payment before the invoice date) moves between periods', () => {
  // Invoice dated 15.01.2027 (entered ahead, allowed up to +366 days), customer pays 10.12.2026 (linked).
  const inv: InvoiceRow = { id: 'inv1', customerName: 'K', invoiceDate: d('2027-01-15'), totalAmount: 11900, vatRate: 19, unlinkedPaidCents: 0, dateConfirmed: true }
  const pay = row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-12-10'), receivableId: 'inv1', statusDate: inv.invoiceDate })
  const tl = new TaxStatusTimeline([regel()])
  const q4 = berlinQuarterRange(2026, 4)

  it('§13 Abs. 1 Nr. 1a S. 4 UStG: VAT on the prepayment is due for Q4 2026 and STAYS there', () => {
    const before = position(d('2027-01-05'), tl, [pay], { invoices: [inv] })
    const after = position(d('2027-01-20'), tl, [pay], { invoices: [inv] })
    const q4Before = before.reserves.find(r => r.type === 'VAT' && r.periodStart === q4.start.toISOString())
    const q4After = after.reserves.find(r => r.type === 'VAT' && r.periodStart === q4.start.toISOString())
    expect(q4Before?.targetCents).toBe(190000)
    // Actual: once the invoice date arrives, Q4 (already ENDED and possibly already paid) loses its VAT.
    expect(q4After?.targetCents ?? 0).toBe(190000)
  })
})

// NF-05 (rhythm correction orphaning payments) is fixed at the route: see tests/integration/reviewRound3.test.ts.

describe('Checks that should hold (sanity)', () => {
  it('§19 limits 25,000 / 100,000 €, the crossing sale already exceeds', () => {
    const c = checkKleinunternehmer({ year: 2026, priorYearTurnoverCents: 2_000_000, currentYearTurnoverCents: 10_000_001, hasPriorYearData: true })
    expect(c.status).toBe('CURRENT_LIMIT_EXCEEDED')
    const ok = checkKleinunternehmer({ year: 2026, priorYearTurnoverCents: 2_500_000, currentYearTurnoverCents: 10_000_000, hasPriorYearData: true })
    expect(ok.status).not.toBe('CURRENT_LIMIT_EXCEEDED')
    expect(checkKleinunternehmer({ year: 2026, priorYearTurnoverCents: 2_500_001, currentYearTurnoverCents: 0, hasPriorYearData: true }).status).toBe('PRIOR_YEAR_LIMIT_EXCEEDED')
  })
  it('Berlin boundary: a booking at 23:30 Berlin on 30 Sep is Q3, 00:30 on 1 Oct is Q4', () => {
    const tl = new TaxStatusTimeline([regel()])
    const q3 = berlinQuarterRange(2026, 3)
    const lateQ3 = new Date(berlinMidnight(2026, 10, 1).getTime() - 30 * 60000)
    const earlyQ4 = new Date(berlinMidnight(2026, 10, 1).getTime() + 30 * 60000)
    const p = position(d('2026-11-20'), tl, [
      row({ type: 'INCOME', grossAmount: 119, vatRate: 19, transactionDate: lateQ3 }),
      row({ type: 'INCOME', grossAmount: 238, vatRate: 19, transactionDate: earlyQ4 }),
    ])
    expect(p.reserves.find(r => r.periodStart === q3.start.toISOString())?.targetCents).toBe(1900)
  })
})
