/**
 * Regression tests for the second independent finance review (2026-11-01).
 * Each case reproduces a confirmed defect of the RC2 code and pins the fix.
 */
import { describe, it, expect } from 'vitest'
import { computeFinancialPosition, vatDueNote, type PositionInput } from '@/lib/finance/position'
import { summarizeTransactions, type TransactionRow } from '@/lib/finance/summary'
import { checkKleinunternehmer } from '@/lib/finance/kleinunternehmer'
import { estimateAnnualIncomeTax, incomeTaxReserveYearToDate } from '@/lib/finance/incomeTax'
import { berlinMonthRange, berlinQuarterRange, berlinYearRange } from '@/lib/time/berlin'

const at = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d, 12))
function tx(partial: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'grossAmount'>): TransactionRow {
  return { vatRate: 0, usage: 'BUSINESS', businessPct: 100, transactionDate: at(2026, 10, 5), ...partial }
}

/** Position on 2 January 2027 for a VAT-registered user filing quarterly. */
function januaryInput(over: Partial<PositionInput> = {}): PositionInput {
  const jan = berlinMonthRange(2027, 1)
  const q1 = berlinQuarterRange(2027, 1)
  const q4 = berlinQuarterRange(2026, 4)
  const y27 = berlinYearRange(2027)
  const y26 = berlinYearRange(2026)
  const q4Rows = [tx({ type: 'INCOME', grossAmount: 17850, vatRate: 19, transactionDate: at(2026, 11, 3) })] // 2,850 € VAT
  const priorRows = [...q4Rows, tx({ type: 'INCOME', grossAmount: 71400, vatRate: 19, transactionDate: at(2026, 6, 3) })]
  return {
    now: new Date('2027-01-02T10:00:00Z'),
    taxType: 'REGELBESTEUERUNG',
    churchTaxRate: null,
    month: { start: jan.start, end: jan.end, year: 2027, month: 1, day: 2, monthsElapsed: 1 },
    yearStart: y27.start,
    yearEnd: y27.end,
    priorYearStart: y26.start,
    vatPeriod: { start: q1.start, end: q1.end, label: 'Q1 2027' },
    previousVatPeriod: { start: q4.start, end: q4.end, label: 'Q4 2026' },
    previousVatPeriodRows: q4Rows,
    monthRows: [],
    vatPeriodRows: [],
    yearRows: [],
    priorYearRows: priorRows,
    fixedCosts: [],
    employees: [],
    payables: [],
    receivables: [],
    reserves: [],
    taxPaymentRows: [],
    ...over,
  }
}

describe('finding 1: tax of an ended period does not vanish at the turn of the period', () => {
  it('Q4 VAT and last year’s income tax stay open on 2 January', () => {
    const p = computeFinancialPosition(januaryInput())
    const vat = p.reserves.find(r => r.type === 'VAT' && r.status === 'ENDED')
    const it26 = p.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'ENDED')
    expect(vat?.openCents).toBe(285000)
    expect(vat?.periodLabel).toBe('Q4 2026')
    expect(vat?.dueNote).toContain('10.01.2027')
    const expectedIt = Math.round(estimateAnnualIncomeTax({ year: 2026, annualProfit: 75000 }).total * 100)
    expect(it26?.openCents).toBe(expectedIt)
    expect(p.reserveShortfallCents).toBe(285000 + expectedIt)
    expect(p.limitations.map(l => l.code)).toContain('ENDED_PERIOD_OPEN')
  })

  it('a recorded payment closes the period; a partial payment leaves the rest open', () => {
    const q4 = berlinQuarterRange(2026, 4)
    const payment = (amount: number) =>
      tx({ type: 'EXPENSE', grossAmount: amount, taxPaymentType: 'VAT', taxPeriodStart: q4.start, transactionDate: at(2027, 1, 2) })
    const partial = computeFinancialPosition(januaryInput({ taxPaymentRows: [payment(2000)] }))
    expect(partial.reserves.find(r => r.type === 'VAT' && r.status === 'ENDED')?.openCents).toBe(85000)
    const full = computeFinancialPosition(januaryInput({ taxPaymentRows: [payment(2850)] }))
    expect(full.reserves.find(r => r.type === 'VAT' && r.status === 'ENDED')).toBeUndefined()
  })

  it('a period the user marked settled is no longer counted', () => {
    const y26 = berlinYearRange(2026)
    const p = computeFinancialPosition(
      januaryInput({ reserves: [{ type: 'INCOME_TAX', periodStart: y26.start, actuallyReserved: 0, settledAt: new Date() }] })
    )
    expect(p.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'ENDED')).toBeUndefined()
  })

  it('money set aside for the ended period reduces its shortfall', () => {
    const q4 = berlinQuarterRange(2026, 4)
    const p = computeFinancialPosition(januaryInput({ reserves: [{ type: 'VAT', periodStart: q4.start, actuallyReserved: 2850 }] }))
    const vat = p.reserves.find(r => r.type === 'VAT' && r.status === 'ENDED')
    expect(vat?.reservedCents).toBe(285000)
    expect(vat?.shortfallCents).toBe(0)
  })

  it('VAT due notes: 10th day after the period, across DST and year ends', () => {
    expect(vatDueNote(berlinQuarterRange(2026, 4).end)).toContain('10.01.2027')
    expect(vatDueNote(berlinMonthRange(2026, 3).end)).toContain('10.04.2026') // DST switch on 29.3.
    expect(vatDueNote(berlinMonthRange(2026, 10).end)).toContain('10.11.2026') // back to CET on 25.10.
  })
})

describe('finding 2: payments to the Finanzamt are not business expenses', () => {
  const q3 = berlinQuarterRange(2026, 3)
  const october = [
    tx({ type: 'INCOME', grossAmount: 5950, vatRate: 19 }), // 5,000 net
    tx({ type: 'EXPENSE', grossAmount: 2850, taxPaymentType: 'VAT', taxPeriodStart: q3.start }),
    tx({ type: 'EXPENSE', grossAmount: 1200, taxPaymentType: 'INCOME_TAX', taxPeriodStart: berlinYearRange(2026).start }),
  ]

  it('profit, VAT, outflow and private money ignore them', () => {
    const t = summarizeTransactions(october, 'REGELBESTEUERUNG')
    expect(t.profitCents).toBe(500000)
    expect(t.deductibleExpenseCents).toBe(0)
    expect(t.vatPayableCents).toBe(95000)
    expect(t.outflowGrossCents).toBe(0)
    expect(t.privateOutflowCents).toBe(0)
    expect(t.vatPaidToFinanzamtCents).toBe(285000)
    expect(t.incomeTaxPaidCents).toBe(120000)
  })

  it('Anlage EKS: VAT paid is an expense, a VAT refund a receipt, income tax neither', () => {
    const refund = tx({ type: 'INCOME', grossAmount: 300, taxPaymentType: 'VAT', taxPeriodStart: q3.start })
    const t = summarizeTransactions([...october, refund], 'REGELBESTEUERUNG')
    expect(t.businessReceiptsCents).toBe(595000 + 30000)
    expect(t.businessExpensesPaidCents).toBe(285000)
    expect(t.vatPaidToFinanzamtCents).toBe(255000)
  })
})

describe('finding 3: business income with an unconfirmed VAT rate is not booked at 0 % VAT', () => {
  const unconfirmed = tx({ type: 'INCOME', grossAmount: 1190, vatRate: 0, needsReview: true })

  it('standard taxation: 19 % assumed until the user confirms', () => {
    const t = summarizeTransactions([unconfirmed], 'REGELBESTEUERUNG')
    expect(t.businessIncomeNetCents).toBe(100000)
    expect(t.outputVatCents).toBe(19000)
    expect(t.assumedVatCount).toBe(1)
  })

  it('a confirmed 0 % income (review done) stays 0 %', () => {
    const t = summarizeTransactions([{ ...unconfirmed, needsReview: false }], 'REGELBESTEUERUNG')
    expect(t.outputVatCents).toBe(0)
    expect(t.assumedVatCount).toBe(0)
  })

  it('Kleinunternehmer: never', () => {
    const t = summarizeTransactions([unconfirmed], 'KLEINUNTERNEHMER')
    expect(t.outputVatCents).toBe(0)
    expect(t.businessIncomeNetCents).toBe(119000)
  })
})

describe('findings 4 and 5: one payment settles one commitment', () => {
  const oct = berlinMonthRange(2026, 10)
  const base = (over: Partial<PositionInput>): PositionInput => ({
    ...januaryInput(),
    now: new Date('2026-10-25T10:00:00Z'),
    month: { start: oct.start, end: oct.end, year: 2026, month: 10, day: 25, monthsElapsed: 10 },
    yearStart: berlinYearRange(2026).start,
    vatPeriod: { ...berlinQuarterRange(2026, 4), label: 'Q4 2026' },
    previousVatPeriod: null,
    priorYearRows: null,
    ...over,
  })

  it('a shared legal form ("GmbH") is not a name match', () => {
    const p = computeFinancialPosition(
      base({
        monthRows: [tx({ type: 'EXPENSE', grossAmount: '39.99', merchant: 'Vodafone GmbH' })],
        fixedCosts: [{ id: 'f1', name: 'Telekom GmbH', amount: '39.99', frequency: 'MONTHLY', dayOfMonth: 3, usage: 'BUSINESS' }],
      })
    )
    expect(p.commitments.map(c => c.id)).toEqual(['f1'])
  })

  it('one rent payment does not pay two rents', () => {
    const p = computeFinancialPosition(
      base({
        monthRows: [tx({ type: 'EXPENSE', grossAmount: 500, description: 'Miete November' })],
        fixedCosts: [
          { id: 'office', name: 'Miete Büro', amount: 500, frequency: 'MONTHLY', dayOfMonth: 1, usage: 'BUSINESS' },
          { id: 'flat', name: 'Miete Wohnung', amount: 500, frequency: 'MONTHLY', dayOfMonth: 1, usage: 'PRIVATE' },
        ],
      })
    )
    expect(p.commitments).toHaveLength(1)
  })

  it('a partly paid supplier bill keeps its open rest', () => {
    const p = computeFinancialPosition(
      base({
        monthRows: [tx({ type: 'EXPENSE', grossAmount: 500, merchant: 'Holz AG', description: 'Zahlung an Holz AG' })],
        payables: [{ id: 'p1', supplierName: 'Holz AG', outstandingAmount: 500, totalAmount: 1000, paidAmount: 500, dueDate: new Date('2026-10-28T00:00:00Z') }],
      })
    )
    expect(p.commitments.find(c => c.id === 'p1')?.amountCents).toBe(50000)
  })

  it('a bill booked by hand in full (nothing recorded in TaxKontrol) is still not counted twice', () => {
    const p = computeFinancialPosition(
      base({
        monthRows: [tx({ type: 'EXPENSE', grossAmount: 1000, merchant: 'Holz AG' })],
        payables: [{ id: 'p1', supplierName: 'Holz AG', outstandingAmount: 1000, totalAmount: 1000, paidAmount: 0, dueDate: new Date('2026-10-28T00:00:00Z') }],
      })
    )
    expect(p.commitments.find(c => c.id === 'p1')).toBeUndefined()
  })
})

describe('findings 6 and 7: Kleinunternehmer monitor', () => {
  it('founding year at 85,000 €: the 25,000 € limit is exceeded, not "approaching 100,000 €"', () => {
    const k = checkKleinunternehmer({ year: 2026, priorYearTurnoverCents: 0, currentYearTurnoverCents: 8_500_000, hasPriorYearData: false })
    expect(k.status).toBe('FOUNDING_YEAR_LIMIT_EXCEEDED')
  })

  it('last year under standard taxation: turnover is measured without the VAT that was charged', () => {
    const y26 = berlinYearRange(2026)
    const jan = berlinMonthRange(2027, 1)
    const p = computeFinancialPosition({
      ...januaryInput(),
      taxType: 'KLEINUNTERNEHMER',
      month: { start: jan.start, end: jan.end, year: 2027, month: 1, day: 10, monthsElapsed: 1 },
      priorYearStart: y26.start,
      previousVatPeriod: null,
      priorYearRows: [tx({ type: 'INCOME', grossAmount: 29750, vatRate: 19, transactionDate: at(2026, 5, 1) })], // 25,000 net
    })
    expect(p.kleinunternehmer?.priorYearTurnoverCents).toBe(2_500_000)
    expect(p.kleinunternehmer?.status).not.toBe('PRIOR_YEAR_LIMIT_EXCEEDED')
  })
})

describe('finding 8: projection after one large month', () => {
  it('the minimum on the profit so far is shown next to the projection', () => {
    const r = incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: 3_000_000, monthsElapsed: 1 })
    const floor = Math.round(estimateAnnualIncomeTax({ year: 2026, annualProfit: 30000 }).total * 100)
    expect(r.minimumCents).toBe(floor)
    expect(r.reserveCents).toBeGreaterThan(r.minimumCents)
  })
})
