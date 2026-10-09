import { describe, it, expect } from 'vitest'
import { computeFinancialPosition, matchesFixedCost, spendCheck, type PositionInput } from '@/lib/finance/position'
import { summarizeTransactions, type TransactionRow } from '@/lib/finance/summary'
import { berlinMonthRange, berlinQuarterRange, berlinYearRange } from '@/lib/time/berlin'

const NOW = new Date('2026-10-15T10:00:00Z')
const month = berlinMonthRange(2026, 10)
const quarter = berlinQuarterRange(2026, 4)
const year = berlinYearRange(2026)

const d = (day: number) => new Date(Date.UTC(2026, 9, day, 12))

function tx(partial: Partial<TransactionRow> & Pick<TransactionRow, 'type' | 'grossAmount'>): TransactionRow {
  return { vatRate: 0, usage: 'BUSINESS', businessPct: 100, transactionDate: d(5), ...partial }
}

function input(over: Partial<PositionInput> = {}): PositionInput {
  const rows = over.monthRows ?? []
  return {
    now: NOW,
    taxType: 'REGELBESTEUERUNG',
    churchTaxRate: null,
    month: { start: month.start, end: month.end, year: 2026, month: 10, day: 15, monthsElapsed: 10 },
    yearStart: year.start,
    vatPeriod: { start: quarter.start, end: quarter.end, label: 'Q4 2026' },
    monthRows: rows,
    vatPeriodRows: over.vatPeriodRows ?? rows,
    yearRows: over.yearRows ?? rows,
    priorYearRows: null,
    fixedCosts: [],
    employees: [],
    payables: [],
    receivables: [],
    reserves: [],
    ...over,
  }
}

// Scenario: designer under standard VAT taxation.
const designerMonth: TransactionRow[] = [
  tx({ type: 'INCOME', grossAmount: 2380, vatRate: 19, merchant: 'Kunde A' }),
  tx({ type: 'EXPENSE', grossAmount: 119, vatRate: 19, merchant: 'Adobe' }),
  tx({ type: 'EXPENSE', grossAmount: '59.50', vatRate: 19, usage: 'MIXED', businessPct: 70, merchant: 'Telekom' }),
]

describe('summarizeTransactions', () => {
  it('standard VAT business month', () => {
    const t = summarizeTransactions(designerMonth, 'REGELBESTEUERUNG')
    expect(t.businessIncomeGrossCents).toBe(238000)
    expect(t.businessIncomeNetCents).toBe(200000)
    expect(t.deductibleExpenseCents).toBe(13500) // 100 + 35
    expect(t.inputVatCents).toBe(2565) // 19 + 6.65
    expect(t.vatPayableCents).toBe(35435) // 380 − 25.65
    expect(t.profitCents).toBe(186500)
    expect(t.privateOutflowCents).toBe(1785)
    expect(t.outflowGrossCents).toBe(17850)
  })

  it('Kleinunternehmer: no VAT at all, expenses gross', () => {
    const t = summarizeTransactions(
      [tx({ type: 'INCOME', grossAmount: 1000 }), tx({ type: 'EXPENSE', grossAmount: 119, vatRate: 19 })],
      'KLEINUNTERNEHMER'
    )
    expect(t.vatPayableCents).toBe(0)
    expect(t.deductibleExpenseCents).toBe(11900)
    expect(t.profitCents).toBe(88100)
  })

  it('loans and private deposits are not profit; unclear money is set aside', () => {
    const t = summarizeTransactions(
      [
        tx({ type: 'INCOME', grossAmount: 1500 }),
        tx({ type: 'INCOME', grossAmount: 5000, usage: 'PRIVATE', merchant: 'Bank loan' }),
        tx({ type: 'INCOME', grossAmount: 200, usage: 'UNSURE' }),
      ],
      'KLEINUNTERNEHMER'
    )
    expect(t.profitCents).toBe(150000)
    expect(t.nonBusinessInflowCents).toBe(500000)
    expect(t.unclearInflowCents).toBe(20000)
    expect(t.needsReviewCount).toBe(1)
  })

  it('treats legacy Kleinunternehmer rows that split VAT as gross expenses', () => {
    // A stored row may carry vatRate 19 from before the fix; KU never deducts it.
    const t = summarizeTransactions([tx({ type: 'EXPENSE', grossAmount: 238, vatRate: 19 })], 'KLEINUNTERNEHMER')
    expect(t.deductibleExpenseCents).toBe(23800)
  })
})

describe('computeFinancialPosition', () => {
  it('projects income tax over the months that have records', () => {
    // Same October profit: recorded since January (10 months) vs. only in October (1 month).
    const sparse = computeFinancialPosition(input({ monthRows: designerMonth }))
    const fresh = computeFinancialPosition(
      input({ monthRows: designerMonth, month: { start: month.start, end: month.end, year: 2026, month: 10, day: 15, monthsElapsed: 1 } })
    )
    expect(sparse.incomeTax.projectedAnnualProfit).toBeCloseTo(2238, 0)
    expect(sparse.monthTaxCents.incomeTax).toBe(0) // below the Grundfreibetrag
    expect(fresh.incomeTax.projectedAnnualProfit).toBeCloseTo(22380, 0)
    expect(fresh.monthTaxCents.incomeTax).toBeGreaterThan(0)
  })

  it('standard month: subtracts this month’s taxes and nothing invented', () => {
    const p = computeFinancialPosition(
      input({ monthRows: designerMonth, month: { start: month.start, end: month.end, year: 2026, month: 10, day: 15, monthsElapsed: 1 } })
    )
    expect(p.monthTaxCents.vat).toBe(35435)
    expect(p.monthTaxCents.incomeTax).toBeGreaterThan(0)
    expect(p.leftFromThisMonthCents).toBe(238000 - 17850 - p.monthTaxCents.total)
    expect(p.limitations.map(l => l.code)).toContain('NOT_BANK_BALANCE')
  })

  it('negative cash flow stays negative (no silent floor at 0)', () => {
    const p = computeFinancialPosition(input({ monthRows: [tx({ type: 'INCOME', grossAmount: 500 }), tx({ type: 'EXPENSE', grossAmount: 2000 })] }))
    expect(p.leftFromThisMonthCents).toBeLessThan(0)
    expect(p.monthTaxCents.incomeTax).toBe(0)
  })

  it('does not count a monthly fixed cost twice when it is already booked', () => {
    const rows = [tx({ type: 'INCOME', grossAmount: 3000 }), tx({ type: 'EXPENSE', grossAmount: 800, description: 'Büromiete Oktober' })]
    const p = computeFinancialPosition(
      input({
        monthRows: rows,
        fixedCosts: [
          { id: 'rent', name: 'Büromiete', amount: 800, frequency: 'MONTHLY', dayOfMonth: 1, usage: 'BUSINESS' },
          { id: 'adobe', name: 'Adobe Creative Cloud', amount: 119, frequency: 'MONTHLY', dayOfMonth: 20, usage: 'BUSINESS' },
        ],
      })
    )
    expect(p.commitments.map(c => c.id)).toEqual(['adobe'])
    expect(p.commitmentsTotalCents).toBe(11900)
  })

  it('quarterly and yearly costs become a monthly provision, not a payment', () => {
    const p = computeFinancialPosition(
      input({ fixedCosts: [{ id: 'ins', name: 'Versicherung', amount: 300, frequency: 'QUARTERLY', dayOfMonth: 1, usage: 'BUSINESS' }] })
    )
    expect(p.commitments[0]).toMatchObject({ kind: 'FIXED_COST_PROVISION', amountCents: 10000 })
  })

  it('counts unpaid monthly salaries, skips paid ones and flags hourly wages', () => {
    const p = computeFinancialPosition(
      input({
        employees: [
          { id: 'e1', name: 'Anna', salaryType: 'MONTHLY', salaryAmount: 556, paidThisMonth: false },
          { id: 'e2', name: 'Ben', salaryType: 'MONTHLY', salaryAmount: 1200, paidThisMonth: true },
          { id: 'e3', name: 'Cem', salaryType: 'HOURLY', salaryAmount: 14, paidThisMonth: false },
        ],
      })
    )
    expect(p.commitments.filter(c => c.kind === 'SALARY').map(c => c.id)).toEqual(['e1'])
    expect(p.limitations.map(l => l.code)).toEqual(expect.arrayContaining(['HOURLY_WAGES', 'EMPLOYER_COSTS']))
  })

  it('subtracts supplier bills due this month or undated, not next month’s', () => {
    const p = computeFinancialPosition(
      input({
        payables: [
          { id: 'p1', supplierName: 'Overdue', outstandingAmount: 100, dueDate: new Date('2026-10-01T00:00:00Z') },
          { id: 'p2', supplierName: 'Later', outstandingAmount: 200, dueDate: new Date('2026-11-20T00:00:00Z') },
          { id: 'p3', supplierName: 'Undated', outstandingAmount: 50, dueDate: null },
          { id: 'p4', supplierName: 'Due today', outstandingAmount: 30, dueDate: new Date('2026-10-15T12:00:00Z') },
        ],
      })
    )
    expect(p.commitments.map(c => c.id).sort()).toEqual(['p1', 'p3', 'p4'])
    // due today counts as a commitment but is not overdue
    expect(p.payables).toEqual({ openCents: 38000, overdueCents: 10000, overdueCount: 1 })
  })

  it('reserve targets are per period and use what the user actually reserved', () => {
    const p = computeFinancialPosition(
      input({
        monthRows: designerMonth,
        reserves: [
          { type: 'VAT', periodStart: quarter.start, actuallyReserved: 300 },
          { type: 'VAT', periodStart: berlinQuarterRange(2026, 3).start, actuallyReserved: 999 }, // other period: ignored
        ],
      })
    )
    const vat = p.reserves.find(r => r.type === 'VAT')!
    expect(vat.targetCents).toBe(35435)
    expect(vat.reservedCents).toBe(30000)
    expect(vat.shortfallCents).toBe(5435)
  })

  it('Kleinunternehmer has no VAT reserve and gets a limit check', () => {
    const p = computeFinancialPosition(input({ taxType: 'KLEINUNTERNEHMER', monthRows: [tx({ type: 'INCOME', grossAmount: 1000 })] }))
    expect(p.reserves.map(r => r.type)).toEqual(['INCOME_TAX'])
    expect(p.kleinunternehmer?.status).toBe('OK')
  })

  it('spend check reports a shortfall instead of a yes/no on missing data', () => {
    const p = computeFinancialPosition(input({ monthRows: [tx({ type: 'INCOME', grossAmount: 1000 })] }))
    const c = spendCheck(p, 5000_00)
    expect(c.fits).toBe(false)
    expect(c.remainingAfterCents).toBeLessThan(0)
  })
})

describe('matchesFixedCost', () => {
  it('needs both a name match and a similar amount', () => {
    const cost = { name: 'Adobe Creative Cloud', amountCents: 11900 }
    expect(matchesFixedCost(cost, tx({ type: 'EXPENSE', grossAmount: 119, merchant: 'ADOBE' }))).toBe(true)
    expect(matchesFixedCost(cost, tx({ type: 'EXPENSE', grossAmount: 59, merchant: 'Adobe' }))).toBe(false)
    expect(matchesFixedCost(cost, tx({ type: 'EXPENSE', grossAmount: 119, merchant: 'Lidl' }))).toBe(false)
    expect(matchesFixedCost(cost, tx({ type: 'INCOME', grossAmount: 119, merchant: 'Adobe' }))).toBe(false)
  })
})
