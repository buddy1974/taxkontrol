/**
 * Regression tests for the independent adversarial review of 2026-11-01
 * (docs/release/INDEPENDENT-REVIEW-2026-11-01.md, kept in the review worktree).
 * Each block names the finding; the assertions are what German tax law / a cautious
 * planning tool requires, not what the old implementation did.
 */
import { describe, it, expect } from 'vitest'
import { evaluateDecision } from '@/lib/decision/safeToSpendDecision'
import { detectRiskSignals } from '@/lib/decision/riskSignals'
import { computeFinancialPosition, spendCheck, type PositionInput, type InvoiceRow } from '@/lib/finance/position'
import { listTaxPeriods, vatDueNote, vatPeriodFor } from '@/lib/finance/periods'
import { monthsElapsedForProjection } from '@/lib/finance/loadPosition'
import { incomeTaxReserveYearToDate } from '@/lib/finance/incomeTax'
import { TaxStatusTimeline, SINCE_ALWAYS, type TaxStatusEntry } from '@/lib/finance/taxStatus'
import { summarizeTransactions, type TransactionRow } from '@/lib/finance/summary'
import { berlinMonthRange, berlinYearRange, berlinQuarterRange, berlinMidnight } from '@/lib/time/berlin'
import { parseEuroInput } from '@/lib/finance/parseEuro'
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

/** Position as loadFinancialPosition builds it: every tracked period with its rows. */
function position(now: Date, timeline: TaxStatusTimeline, rows: TransactionRow[], extra: Partial<PositionInput> = {}) {
  const t = new Date(now)
  const year = t.getUTCFullYear()
  const month = t.getUTCMonth() + 1
  const m = berlinMonthRange(year, month)
  const y = berlinYearRange(year)
  const st = timeline.statusAt(now)
  const vp = vatPeriodFor(now, st.vatFilingPeriod)
  const inR = (s: Date, e: Date) => rows.filter(r => r.transactionDate >= s && r.transactionDate < e && r.transactionDate <= now)
  const periods = listTaxPeriods(timeline, now).map(p => ({ ...p, rows: inR(p.start, p.end) }))
  const prior = inR(berlinYearRange(year - 1).start, y.start)
  const input: PositionInput = {
    now,
    taxType: st.taxType,
    churchTaxRate: null,
    timeline,
    month: { start: m.start, end: m.end, year, month, day: t.getUTCDate(), monthsElapsed: month },
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
    taxPaymentRows: [],
    ...extra,
  }
  return computeFinancialPosition(input)
}

function ctxFrom(p: ReturnType<typeof position>, over: Partial<DecisionContext> = {}): DecisionContext {
  return {
    userId: 'u',
    taxType: p.taxType,
    currentMonthIncome: p.month.businessIncomeNetCents / 100,
    currentMonthExpenses: 0,
    totalFixedCosts: 0,
    taxOwed: p.reserveTargetTotalCents / 100,
    taxReserved: p.reservedTotalCents / 100,
    totalPayables: 0,
    totalSalaries: 0,
    safeToSpend: p.safeToSpendCents / 100,
    endedPeriodShortfall: p.endedPeriodShortfallCents / 100,
    uncertainties: p.uncertainties,
    monthsWithData: 6,
    totalTransactions: 40,
    hasProfile: true,
    openCaseCount: 0,
    openCaseEscalated: false,
    persona: null,
    ...over,
  }
}

describe('IR-01 — safe-to-spend respects unpaid tax of ended periods', () => {
  it('the reviewer’s context (no breakdown, 5,000 € reserve gap) is no longer SAFE', () => {
    const ctx = {
      userId: 'u', taxType: 'REGELBESTEUERUNG', currentMonthIncome: 3000, currentMonthExpenses: 500, totalFixedCosts: 0,
      taxOwed: 5000, taxReserved: 0, totalPayables: 0, totalSalaries: 0, safeToSpend: 2000, monthsWithData: 6,
      totalTransactions: 40, hasProfile: true, openCaseCount: 0, openCaseEscalated: false, persona: null,
    }
    const r = evaluateDecision(ctx, { amount: 1000, purpose: 'Laptop', decisionType: 'BUY_EQUIPMENT' }, [], detectRiskSignals(ctx, 1000))
    expect(r.resultLevel).not.toBe('SAFE')
  })

  it('unreserved VAT of the ended quarter is taken off safe-to-spend and blocks SAFE', () => {
    const tl = new TaxStatusTimeline([regel()])
    const now = d('2026-01-20')
    const rows = [
      row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2025-11-10') }), // Q4 2025: 1,900 € VAT
      row({ type: 'INCOME', grossAmount: 3000, vatRate: 0, transactionDate: d('2026-01-05') }), // this month, no VAT
    ]
    const p = position(now, tl, rows)
    const ended = p.reserves.find(r => r.type === 'VAT' && r.status === 'ENDED' && r.periodLabel === 'Q4 2025')
    expect(ended?.openCents).toBe(190000)
    expect(p.endedPeriodShortfallCents).toBeGreaterThanOrEqual(190000)
    expect(p.safeToSpendCents).toBeLessThanOrEqual(p.leftFromThisMonthCents - 190000)
    expect(p.uncertainties).toContain('ENDED_PERIOD_UNRESERVED')

    const ctx = ctxFrom(p)
    const r = evaluateDecision(ctx, { amount: 100, purpose: 'Chair', decisionType: 'SPEND' }, [], detectRiskSignals(ctx, 100))
    expect(r.resultLevel).not.toBe('SAFE')
    expect(spendCheck(p, 100).leftCents).toBe(p.safeToSpendCents)
  })

  it('once the ended period is reserved, it no longer reduces safe-to-spend', () => {
    const tl = new TaxStatusTimeline([regel()])
    const now = d('2026-01-20')
    const rows = [row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2025-11-10') })]
    const q4 = berlinQuarterRange(2025, 4)
    const p = position(now, tl, rows, { reserves: [{ type: 'VAT', periodStart: q4.start, actuallyReserved: 1900 }] })
    expect(p.endedPeriodShortfallCents).toBe(0)
    expect(p.uncertainties).not.toContain('ENDED_PERIOD_UNRESERVED')
  })

  it('uncertain figures (unclassified money) are never SAFE', () => {
    const tl = new TaxStatusTimeline([regel()])
    const now = d('2026-06-20')
    const rows = [
      row({ type: 'INCOME', grossAmount: 5000, vatRate: 0, transactionDate: d('2026-06-02') }),
      row({ type: 'INCOME', grossAmount: 800, usage: 'UNSURE', needsReview: true, transactionDate: d('2026-06-03') }),
    ]
    const p = position(now, tl, rows)
    expect(p.uncertainties).toContain('UNCLEAR_TRANSACTIONS')
    const ctx = ctxFrom(p, { safeToSpend: 100_000 })
    expect(evaluateDecision(ctx, { amount: 10, purpose: 'Pen', decisionType: 'SPEND' }, [], []).resultLevel).not.toBe('SAFE')
  })

  it('with complete, reserved records SAFE is still possible', () => {
    const ctx = ctxFrom(position(d('2026-06-20'), new TaxStatusTimeline([regel()]), []), {
      safeToSpend: 5000, currentMonthIncome: 3000, taxOwed: 0, taxReserved: 0, uncertainties: [], endedPeriodShortfall: 0,
    })
    expect(evaluateDecision(ctx, { amount: 100, purpose: 'Pen', decisionType: 'SPEND' }, [], []).resultLevel).toBe('SAFE')
  })
})

describe('IR-02 — Sollversteuerung (legal default) vs. approved Istversteuerung', () => {
  const now = d('2026-11-15')
  const invoice = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
    id: 'inv1', customerName: 'Kunde', invoiceDate: d('2026-10-20'), totalAmount: 11900, vatRate: 19, unlinkedPaidCents: 0, ...over,
  })
  const currentVat = (p: ReturnType<typeof position>) => p.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')

  it('Soll: VAT of an unpaid invoice is due for the invoice period', () => {
    const p = position(now, new TaxStatusTimeline([regel()]), [], { invoices: [invoice()] })
    expect(currentVat(p)?.targetCents).toBe(190000)
    expect(currentVat(p)?.vatMethod).toBe('SOLL')
  })

  it('Ist (confirmed approval): only money received counts', () => {
    const p = position(now, new TaxStatusTimeline([regel({ vatMethod: 'IST' })]), [], { invoices: [invoice()] })
    expect(currentVat(p)?.targetCents).toBe(0)
  })

  it('Soll: the linked payment in a later period is not taxed a second time', () => {
    const tl = new TaxStatusTimeline([regel()])
    const later = d('2027-01-15')
    const pay = row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2027-01-10'), receivableId: 'inv1' })
    const p = position(later, tl, [pay], { invoices: [invoice({ invoiceDate: d('2026-10-20') })] })
    expect(p.reserves.find(r => r.type === 'VAT' && r.periodLabel === 'Q1 2027')?.targetCents ?? 0).toBe(0)
    expect(p.reserves.find(r => r.type === 'VAT' && r.periodLabel === 'Q4 2026')?.targetCents).toBe(190000)
  })

  it('Soll: an invoice part paid without a linked booking is taxed with that cash booking only', () => {
    const tl = new TaxStatusTimeline([regel()])
    const cash = row({ type: 'INCOME', grossAmount: 5950, vatRate: 19, transactionDate: d('2026-10-25') })
    const p = position(now, tl, [cash], { invoices: [invoice({ unlinkedPaidCents: 595000 })] })
    expect(currentVat(p)?.targetCents).toBe(190000) // 950 (cash) + 950 (unpaid rest of invoice)
  })

  it('an invoice without VAT rate is estimated at 19 % and flagged', () => {
    const p = position(now, new TaxStatusTimeline([regel()]), [], { invoices: [invoice({ vatRate: null })] })
    expect(currentVat(p)?.targetCents).toBe(190000)
    expect(p.uncertainties).toContain('ASSUMED_VAT')
  })

  it('a Kleinunternehmer’s invoices carry no VAT', () => {
    const p = position(now, TaxStatusTimeline.constant({ taxType: 'KLEINUNTERNEHMER' }), [], { invoices: [invoice()] })
    expect(p.reserves.some(r => r.type === 'VAT')).toBe(false)
  })

  it('a VAT-method limitation always tells the user which method is used', () => {
    const p = position(now, new TaxStatusTimeline([regel()]), [])
    expect(p.limitations.find(l => l.code === 'VAT_METHOD')?.message).toMatch(/Sollversteuerung/)
  })
})

describe('IR-03 — a status change is not retroactive', () => {
  const switchDay = berlinMidnight(2026, 1, 5)
  const tl = new TaxStatusTimeline([regel(), { ...regel({ taxType: 'KLEINUNTERNEHMER' }), validFrom: switchDay }])
  const q4Row = row({ type: 'INCOME', grossAmount: 23800, vatRate: 19, transactionDate: d('2025-11-10') })

  it('Regel → Kleinunternehmer on 5 Jan: the Q4 VAT stays open', () => {
    const p = position(d('2026-01-07'), tl, [q4Row])
    const q4 = p.reserves.find(r => r.type === 'VAT' && r.periodLabel === 'Q4 2025')
    expect(q4?.status).toBe('ENDED')
    expect(q4?.targetCents).toBe(380000)
    expect(p.taxType).toBe('KLEINUNTERNEHMER')
  })

  it('last year’s profit is read with last year’s status (net, not gross)', () => {
    const switched = position(d('2026-01-07'), tl, [q4Row])
    const always = position(d('2026-01-07'), new TaxStatusTimeline([regel()]), [q4Row])
    const it2025 = (p: typeof switched) => p.reserves.find(r => r.type === 'INCOME_TAX' && r.periodLabel === '2025')?.targetCents
    expect(it2025(switched)).toBe(it2025(always))
    expect(summarizeTransactions([q4Row], tl).profitCents).toBe(2_000_000)
  })

  it('rows after the switch are read as Kleinunternehmer (no VAT)', () => {
    const jan = row({ type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: d('2026-01-06') })
    expect(summarizeTransactions([jan], tl).outputVatCents).toBe(0)
    expect(summarizeTransactions([jan], tl).businessIncomeNetCents).toBe(119000)
  })

  it('a period with a status change is flagged', () => {
    const mid = new TaxStatusTimeline([regel({ taxType: 'KLEINUNTERNEHMER' }), { ...regel(), validFrom: berlinMidnight(2026, 5, 15) }])
    const p = position(d('2026-05-20'), mid, [])
    expect(p.limitations.some(l => l.code === 'STATUS_CHANGED_IN_PERIOD')).toBe(true)
  })
})

describe('IR-04 — the Kleinunternehmer check counts unclassified income', () => {
  it('110,000 € of bank-imported (UNSURE) income exceeds the limit and says why', () => {
    const tl = TaxStatusTimeline.constant({ taxType: 'KLEINUNTERNEHMER' })
    const rows = [
      row({ type: 'INCOME', grossAmount: 110000, usage: 'UNSURE', needsReview: true, transactionDate: d('2026-06-01') }),
      row({ type: 'INCOME', grossAmount: 20000, transactionDate: d('2025-06-01') }),
    ]
    const p = position(d('2026-11-15'), tl, rows)
    expect(p.kleinunternehmer?.status).toBe('CURRENT_LIMIT_EXCEEDED')
    expect(p.kleinunternehmer?.unclassifiedCents).toBe(11_000_000)
    expect(p.uncertainties).toEqual(expect.arrayContaining(['KLEIN_UNCLASSIFIED', 'KLEIN_LIMIT']))
  })

  it('private money (classified) is still not turnover', () => {
    const tl = TaxStatusTimeline.constant({ taxType: 'KLEINUNTERNEHMER' })
    const rows = [
      row({ type: 'INCOME', grossAmount: 110000, usage: 'PRIVATE', transactionDate: d('2026-06-01') }),
      row({ type: 'INCOME', grossAmount: 20000, transactionDate: d('2025-06-01') }),
    ]
    expect(position(d('2026-11-15'), tl, rows).kleinunternehmer?.status).toBe('OK')
  })
})

describe('IR-05 — every unpaid ended period stays tracked; Dauerfristverlängerung', () => {
  it('monthly filer on 3 March: January and February are both tracked', () => {
    const tl = new TaxStatusTimeline([regel({ vatFilingPeriod: 'MONTHLY', dauerfristverlaengerung: true })])
    const labels = listTaxPeriods(tl, d('2026-03-03')).filter(p => p.type === 'VAT').map(p => p.label)
    expect(labels).toEqual(expect.arrayContaining(['01/2026', '02/2026', '03/2026']))
  })

  it('January VAT with DFV is due on 10 March and still open on 3 March', () => {
    const tl = new TaxStatusTimeline([regel({ vatFilingPeriod: 'MONTHLY', dauerfristverlaengerung: true })])
    const rows = [row({ type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: d('2026-01-15') })]
    const p = position(d('2026-03-03'), tl, rows)
    const jan = p.reserves.find(r => r.type === 'VAT' && r.periodLabel === '01/2026')
    expect(jan?.openCents).toBe(19000)
    expect(jan?.dueNote).toMatch(/10\.03\.2026/)
    expect(vatDueNote(berlinMonthRange(2026, 1).end)).toMatch(/10\.02\.2026/)
  })

  it('income tax of the year before last stays open until settled', () => {
    const tl = new TaxStatusTimeline([regel()])
    const rows = [row({ type: 'INCOME', grossAmount: 60000, transactionDate: d('2024-05-01') })]
    const p = position(d('2026-02-01'), tl, rows)
    expect(p.reserves.find(r => r.type === 'INCOME_TAX' && r.periodLabel === '2024')?.status).toBe('ENDED')
  })

  it('a filing-period change keeps the old rhythm for earlier periods', () => {
    const tl = new TaxStatusTimeline([regel(), { ...regel({ vatFilingPeriod: 'MONTHLY' }), validFrom: berlinMidnight(2026, 1, 1) }])
    const labels = listTaxPeriods(tl, d('2026-02-10')).filter(p => p.type === 'VAT').map(p => p.label)
    expect(labels).toEqual(expect.arrayContaining(['Q4 2025', '01/2026', '02/2026']))
    expect(labels).not.toContain('Q1 2026')
  })
})

describe('IR-11 — Gewerbesteuer is flagged, not silently ignored', () => {
  it('projected profit above 24,500 € adds a limitation and an uncertainty', () => {
    const tl = new TaxStatusTimeline([regel()])
    const rows = [row({ type: 'INCOME', grossAmount: 40000, transactionDate: d('2026-02-01') })]
    const p = position(d('2026-06-15'), tl, rows)
    expect(p.limitations.some(l => l.code === 'TRADE_TAX_NOT_RESERVED')).toBe(true)
    expect(p.uncertainties).toContain('TRADE_TAX_NOT_RESERVED')
  })
})

describe('IR-12 — the current month counts only as far as it has gone', () => {
  it('2 March with data since January = 2.06 months; projection ≈ 232,000 €, not 160,000 €', () => {
    const months = monthsElapsedForProjection({ year: 2026, month: 3, day: 2 }, 1)
    expect(months).toBeCloseTo(2 + 2 / 31, 5)
    const r = incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: 4_000_000, monthsElapsed: months })
    expect(r.projectedAnnualProfit).toBeGreaterThan(230_000)
    const old = incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: 4_000_000, monthsElapsed: 3 })
    expect(r.reserveCents).toBeGreaterThan(old.reserveCents)
  })

  it('never below one month (one early invoice is not extrapolated from a few days)', () => {
    expect(monthsElapsedForProjection({ year: 2026, month: 1, day: 3 }, 1)).toBe(1)
  })
})

describe('IR-17 — "1,234" is ambiguous in a German product', () => {
  it('is refused; unambiguous forms still parse', () => {
    expect(parseEuroInput('1,234')).toBeNull()
    expect(parseEuroInput('1.234')).toBe(1234)
    expect(parseEuroInput('1,234.56')).toBe(1234.56)
    expect(parseEuroInput('1,234,567')).toBe(1234567)
    expect(parseEuroInput('1234,5')).toBe(1234.5)
  })
})

describe('Internal review of the remediation (round 2)', () => {
  it('F2 — paying an unreserved tax does not make the same money "free" again', () => {
    const tl = new TaxStatusTimeline([regel()])
    const now = d('2026-11-20')
    const q3 = berlinQuarterRange(2026, 3)
    const rows = [
      row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-08-10') }),
      row({ type: 'INCOME', grossAmount: 5950, vatRate: 0, transactionDate: d('2026-11-05') }),
    ]
    const before = position(now, tl, rows)
    const payment = row({ type: 'EXPENSE', grossAmount: 1900, transactionDate: d('2026-11-10'), taxPaymentType: 'VAT', taxPeriodStart: q3.start })
    const after = position(now, tl, rows, { taxPaymentRows: [payment] })
    expect(after.reserves.find(r => r.periodLabel === 'Q3 2026')).toBeUndefined()
    expect(after.safeToSpendCents).toBe(before.safeToSpendCents)
    // Paid from money that WAS set aside: no extra deduction.
    const reserved = position(now, tl, rows, { taxPaymentRows: [payment], reserves: [{ type: 'VAT', periodStart: q3.start, actuallyReserved: 1900 }] })
    expect(reserved.safeToSpendCents).toBe(before.safeToSpendCents + 190000)
  })

  it('F3 — a filing-period change inside a period never creates overlapping periods', () => {
    const tl = new TaxStatusTimeline([regel({ vatFilingPeriod: 'MONTHLY' }), { ...regel({ vatFilingPeriod: 'QUARTERLY' }), validFrom: berlinMidnight(2026, 11, 1) }])
    const vat = listTaxPeriods(tl, d('2026-11-20')).filter(p => p.type === 'VAT').sort((a, b) => a.start.getTime() - b.start.getTime())
    for (let i = 1; i < vat.length; i++) expect(vat[i].start.getTime()).toBeGreaterThanOrEqual(vat[i - 1].end.getTime())
    expect(vat.map(p => p.label)).toContain('10/2026')
  })

  it('F5 — an Ist invoice paid after switching to Kleinunternehmer is still taxed (§20 S. 3 UStG)', () => {
    const tl = new TaxStatusTimeline([regel({ vatMethod: 'IST' }), { ...regel({ taxType: 'KLEINUNTERNEHMER' }), validFrom: berlinMidnight(2026, 1, 1) }])
    const pay = row({ type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: d('2026-02-10'), receivableId: 'inv', statusDate: d('2025-12-15') })
    const p = position(d('2026-02-20'), tl, [pay], {
      invoices: [{ id: 'inv', customerName: 'K', invoiceDate: d('2025-12-15'), totalAmount: 1190, vatRate: 19, unlinkedPaidCents: 0 }],
    })
    expect(p.reserves.find(r => r.type === 'VAT' && r.periodLabel === 'Q1 2026')?.targetCents).toBe(19000)
  })

  it('F4 — an unlinked booking with an open Soll invoice’s amount is flagged (VAT may count twice)', () => {
    const tl = new TaxStatusTimeline([regel()])
    const p = position(d('2026-11-20'), tl, [row({ type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: d('2026-11-15') })], {
      invoices: [{ id: 'inv', customerName: 'K', invoiceDate: d('2026-10-01'), totalAmount: 11900, vatRate: 19, unlinkedPaidCents: 0 }],
    })
    expect(p.uncertainties).toContain('POSSIBLE_UNLINKED_INVOICE_PAYMENT')
  })

  it('F6 — invoices without a confirmed date are counted (cautious) and flagged', () => {
    const tl = new TaxStatusTimeline([regel()])
    const p = position(d('2026-11-20'), tl, [], {
      invoices: [{ id: 'inv', customerName: 'K', invoiceDate: d('2026-11-02'), totalAmount: 1190, vatRate: null, unlinkedPaidCents: 0, dateConfirmed: false }],
    })
    expect(p.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.targetCents).toBe(19000)
    expect(p.uncertainties).toEqual(expect.arrayContaining(['LEGACY_INVOICE_DATES', 'ASSUMED_VAT']))
  })
})
