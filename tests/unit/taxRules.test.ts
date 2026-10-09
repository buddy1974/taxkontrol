import { describe, it, expect } from 'vitest'
import { tariffIncomeTax, solidaritySurcharge, estimateAnnualIncomeTax, incomeTaxReserveYearToDate } from '@/lib/finance/incomeTax'
import { ENACTED_RULES, rulesForYear } from '@/lib/finance/rules'
import { estimateGrundsicherungIncome, monthsInPeriod } from '@/lib/finance/grundsicherung'
import { checkKleinunternehmer } from '@/lib/finance/kleinunternehmer'

// Reference values computed independently from the §32a EStG formula text
// (Python, decimal arithmetic) — see docs/finance/RULES.md.
const REFERENCE: Record<number, Array<[number, number]>> = {
  2025: [[12096, 0], [12348, 35], [15000, 485], [17799, 1100], [20000, 1639], [30000, 4303], [50000, 10691], [69879, 18437], [100000, 31088], [300000, 115753]],
  2026: [[12348, 0], [15000, 435], [17799, 1034], [20000, 1570], [30000, 4217], [50000, 10548], [69878, 18213], [69879, 18213], [100000, 30864], [300000, 115529]],
}

describe('§32a EStG tariff', () => {
  for (const [year, cases] of Object.entries(REFERENCE)) {
    it.each(cases)(`${year}: zvE %i € → %i € income tax`, (zve, tax) => {
      expect(tariffIncomeTax(zve, ENACTED_RULES[Number(year)].tariff)).toBe(tax)
    })
  }

  it('is continuous at every zone boundary (difference ≤ 1 €)', () => {
    for (const r of Object.values(ENACTED_RULES)) {
      const t = r.tariff
      for (const b of [t.grundfreibetrag, t.zone2Upper, t.zone3Upper, t.zone5Lower - 1]) {
        expect(Math.abs(tariffIncomeTax(b + 1, t) - tariffIncomeTax(b, t))).toBeLessThanOrEqual(1)
      }
    }
  })

  it('never produces tax on income at or below the Grundfreibetrag', () => {
    expect(tariffIncomeTax(-5000, ENACTED_RULES[2026].tariff)).toBe(0)
    expect(tariffIncomeTax(12348, ENACTED_RULES[2026].tariff)).toBe(0)
  })
})

describe('Solidaritätszuschlag 2026', () => {
  const soli = ENACTED_RULES[2026].soli
  it('is zero up to the Freigrenze', () => {
    expect(solidaritySurcharge(20350, soli)).toBe(0)
  })
  it('uses the Milderungszone above it', () => {
    expect(solidaritySurcharge(25000, soli)).toBe(553.35)
  })
  it('caps at 5.5 % of the income tax', () => {
    expect(solidaritySurcharge(40000, soli)).toBe(2200)
  })
})

describe('income tax estimate', () => {
  it('flags years without enacted rules as provisional', () => {
    expect(rulesForYear(2027).provisional).toBe(true)
    expect(rulesForYear(2026).provisional).toBe(false)
    expect(estimateAnnualIncomeTax({ year: 2027, annualProfit: 50000 }).provisionalRules).toBe(true)
  })

  it('adds church tax on the income tax amount', () => {
    const e = estimateAnnualIncomeTax({ year: 2026, annualProfit: 50000, churchTax: { rate: 9 } })
    expect(e.incomeTax).toBe(10548)
    expect(e.churchTax).toBe(949.32)
    expect(e.solidaritySurcharge).toBe(0)
  })

  it('YTD reserve: 30,000 € profit after 6 months → projected 60,000 € → 7,116.50 € reserve', () => {
    const r = incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: 3_000_000, monthsElapsed: 6 })
    expect(r.projectedAnnualProfit).toBe(60000)
    expect(r.estimate.incomeTax).toBe(14233)
    expect(r.reserveCents).toBe(711650)
  })

  it('YTD reserve is zero for a loss and for profits below the Grundfreibetrag', () => {
    expect(incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: -100000, monthsElapsed: 3 }).reserveCents).toBe(0)
    expect(incomeTaxReserveYearToDate({ year: 2026, profitYearToDateCents: 500000, monthsElapsed: 6 }).reserveCents).toBe(0)
  })
})

describe('Grundsicherungsgeld / Bürgergeld income (§11b SGB II)', () => {
  it('800 €/month profit → 268 € deductions → 532 € countable', () => {
    const r = estimateGrundsicherungIncome({ year: 2026, months: 6, receiptsCents: 6 * 120000, expensesCents: 6 * 40000 })
    expect(r.monthlyIncomeCents).toBe(80000)
    expect(r.monthlyPauschaleCents).toBe(10000)
    expect(r.monthlyErwerbstaetigenFreibetragCents).toBe(16800)
    expect(r.monthlyCountableCents).toBe(53200)
    expect(r.periodCountableCents).toBe(6 * 53200)
    expect(r.benefitName).toBe('Grundsicherungsgeld')
  })

  it('1,300 €/month → 348 € deductions → 952 € countable', () => {
    const r = estimateGrundsicherungIncome({ year: 2026, months: 6, receiptsCents: 6 * 130000, expensesCents: 0 })
    expect(r.monthlyDeductionsCents).toBe(34800)
    expect(r.monthlyCountableCents).toBe(95200)
  })

  it('with a minor child the 10 % band reaches 1,500 €', () => {
    const r = estimateGrundsicherungIncome({ year: 2026, months: 1, receiptsCents: 130000, expensesCents: 0, hasMinorChild: true })
    expect(r.monthlyDeductionsCents).toBe(35800)
    expect(r.monthlyCountableCents).toBe(94200)
  })

  it('income below 100 € is fully covered by the flat amount', () => {
    const r = estimateGrundsicherungIncome({ year: 2026, months: 1, receiptsCents: 8000, expensesCents: 0 })
    expect(r.monthlyCountableCents).toBe(0)
  })

  it('a loss gives zero countable income and a note', () => {
    const r = estimateGrundsicherungIncome({ year: 2026, months: 6, receiptsCents: 100000, expensesCents: 300000 })
    expect(r.monthlyCountableCents).toBe(0)
    expect(r.notes[0]).toMatch(/loss/)
  })

  it('uses the Bürgergeld name for 2025 periods', () => {
    expect(estimateGrundsicherungIncome({ year: 2025, months: 1, receiptsCents: 0, expensesCents: 0 }).benefitName).toBe('Bürgergeld')
  })

  it('counts months inclusively', () => {
    expect(monthsInPeriod({ year: 2026, month: 1 }, { year: 2026, month: 6 })).toBe(6)
    expect(monthsInPeriod({ year: 2025, month: 11 }, { year: 2026, month: 4 })).toBe(6)
  })
})

describe('Kleinunternehmer limits (§19 UStG since 2025)', () => {
  const k = (prior: number, current: number, hasPrior = true) =>
    checkKleinunternehmer({ year: 2026, priorYearTurnoverCents: prior * 100, currentYearTurnoverCents: current * 100, hasPriorYearData: hasPrior }).status

  it.each([
    [20000, 10000, true, 'OK'],
    [25001, 1000, true, 'PRIOR_YEAR_LIMIT_EXCEEDED'],
    [25000, 26000, true, 'NEXT_YEAR_AT_RISK'],
    [10000, 85000, true, 'APPROACHING_CURRENT_LIMIT'],
    [10000, 100001, true, 'CURRENT_LIMIT_EXCEEDED'],
    [0, 26000, false, 'FOUNDING_YEAR_LIMIT_EXCEEDED'],
    [0, 24000, false, 'OK'],
  ])('prior %i €, current %i € (prior data: %s) → %s', (prior, current, hasPrior, status) => {
    expect(k(prior, current, hasPrior)).toBe(status)
  })
})
