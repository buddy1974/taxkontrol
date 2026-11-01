/**
 * Income tax ESTIMATE for a sole trader / freelancer.
 *
 * This is deliberately a planning estimate, not an assessment:
 * - single assessment (Grundtarif), no other income, no Sonderausgaben,
 *   no Vorsorgeaufwendungen, no Kinderfreibeträge;
 * - Gewerbesteuer is not included (it depends on the municipality and is largely
 *   credited against income tax via §35 EStG);
 * - the taxable income is the business profit as recorded in TaxKontrol.
 * Every result carries these assumptions so the UI can show them.
 */
import { rulesForYear, type IncomeTaxTariff, type SoliRules } from './rules'

/** §32a Abs. 1 EStG: tax in full euros for a taxable income (zvE). */
export function tariffIncomeTax(zve: number, t: IncomeTaxTariff): number {
  const x = Math.floor(Math.max(0, zve))
  let tax: number
  if (x <= t.grundfreibetrag) {
    tax = 0
  } else if (x <= t.zone2Upper) {
    const y = (x - t.grundfreibetrag) / 10000
    tax = (t.zone2.a * y + t.zone2.b) * y
  } else if (x <= t.zone3Upper) {
    const z = (x - t.zone2Upper) / 10000
    tax = (t.zone3.a * z + t.zone3.b) * z + t.zone3.c
  } else if (x < t.zone5Lower) {
    tax = t.zone4.rate * x - t.zone4.minus
  } else {
    tax = t.zone5.rate * x - t.zone5.minus
  }
  return Math.floor(tax)
}

/** §3, §4 SolZG for a single assessment, in euros (rounded down to cents). */
export function solidaritySurcharge(incomeTax: number, s: SoliRules): number {
  if (incomeTax <= s.freigrenzeSingle) return 0
  const full = incomeTax * s.rate
  const capped = (incomeTax - s.freigrenzeSingle) * s.milderungsRate
  return floorToCent(Math.min(full, capped))
}

/** Rounds down to a full cent, tolerating binary noise (553.3499999 -> 553.35). */
export function floorToCent(euros: number): number {
  return Math.floor(euros * 100 + 1e-6) / 100
}

export interface IncomeTaxEstimateInput {
  year: number
  /** Expected profit for the whole year in euros. */
  annualProfit: number
  churchTax?: { rate: number } | null
}

export interface IncomeTaxEstimate {
  year: number
  provisionalRules: boolean
  annualProfit: number
  incomeTax: number
  solidaritySurcharge: number
  churchTax: number
  total: number
  /** total / annualProfit (0 when no profit). */
  effectiveRate: number
  assumptions: string[]
  basis: string
}

export const INCOME_TAX_ASSUMPTIONS = [
  'Single assessment (no joint assessment with a spouse)',
  'No other income (e.g. employment, rent) and no other deductions',
  'Gewerbesteuer not included',
  'Based only on the income and expenses recorded in TaxKontrol',
]

export function estimateAnnualIncomeTax(input: IncomeTaxEstimateInput): IncomeTaxEstimate {
  const { rules, provisional } = rulesForYear(input.year)
  const profit = Math.max(0, input.annualProfit)
  const incomeTax = tariffIncomeTax(profit, rules.tariff)
  const soli = solidaritySurcharge(incomeTax, rules.soli)
  const churchRate = input.churchTax?.rate ?? 0
  const church = floorToCent(incomeTax * (churchRate / 100))
  const total = incomeTax + soli + church
  return {
    year: input.year,
    provisionalRules: provisional,
    annualProfit: profit,
    incomeTax,
    solidaritySurcharge: soli,
    churchTax: church,
    total,
    effectiveRate: profit > 0 ? total / profit : 0,
    assumptions: [
      ...INCOME_TAX_ASSUMPTIONS,
      ...(provisional ? [`The ${input.year} tax rules are not final yet — the ${rules.year} rules were used`] : []),
    ],
    basis: `${rules.tariffBasis}; SolZG`,
  }
}

/**
 * Income tax reserve for the year so far: the year-to-date profit is projected
 * to a full year, the annual tax on that projection is estimated, and the
 * year-to-date share of it is the reserve target.
 */
export function incomeTaxReserveYearToDate(params: {
  year: number
  profitYearToDateCents: number
  monthsElapsed: number
  churchTax?: { rate: number } | null
}): { reserveCents: number; estimate: IncomeTaxEstimate; projectedAnnualProfit: number; minimumCents: number } {
  const months = Math.min(12, Math.max(1, params.monthsElapsed))
  const ytd = params.profitYearToDateCents / 100
  const projectedAnnualProfit = Math.max(0, (ytd / months) * 12)
  const estimate = estimateAnnualIncomeTax({ year: params.year, annualProfit: projectedAnnualProfit, churchTax: params.churchTax })
  const reserveCents = ytd > 0 ? Math.round(ytd * estimate.effectiveRate * 100) : 0
  // Tax on the profit so far if nothing more were earned this year: the floor of what is owed.
  // With few months of records (or one large invoice) the projection can be far above it.
  const minimumCents = ytd > 0 ? Math.round(estimateAnnualIncomeTax({ year: params.year, annualProfit: ytd, churchTax: params.churchTax }).total * 100) : 0
  return { reserveCents, estimate, projectedAnnualProfit, minimumCents }
}
