/**
 * Estimate of countable self-employed income for Grundsicherungsgeld
 * (until 30.6.2026: Bürgergeld) — Anlage EKS preparation.
 *
 * Method (§3 GrusiGV / §3 Bürgergeld-V, §11b SGB II):
 *  1. Income = business receipts actually received in the period
 *     minus necessary business expenses actually paid in the period
 *     (cash basis, "ohne Rücksicht auf steuerrechtliche Vorschriften").
 *  2. Divide by the number of months of the period -> monthly income.
 *  3. From the monthly income deduct the flat 100 € (§11b Abs. 2) and the
 *     earned-income allowance bands (§11b Abs. 3).
 *  4. The rest is the estimated countable (anrechenbare) income per month.
 *
 * This is NOT the tax profit: VAT received counts as a receipt and VAT paid to
 * the Finanzamt counts as an expense; depreciation does not exist here.
 * The Jobcenter decides which expenses it accepts as necessary.
 */
import { rulesForYear } from './rules'

export interface GrundsicherungInput {
  /** Year of the period start — selects the rule set. */
  year: number
  months: number
  receiptsCents: number
  expensesCents: number
  hasMinorChild?: boolean
  /** Income tax actually paid in the period (recorded tax payments). */
  incomeTaxPaidCents?: number
}

export interface GrundsicherungResult {
  benefitName: string
  provisionalRules: boolean
  months: number
  receiptsCents: number
  expensesCents: number
  /** Income over the whole period (may be negative). */
  periodIncomeCents: number
  monthlyIncomeCents: number
  monthlyPauschaleCents: number
  monthlyErwerbstaetigenFreibetragCents: number
  monthlyDeductionsCents: number
  monthlyCountableCents: number
  periodCountableCents: number
  bands: Array<{ from: number; to: number; rate: number; amountCents: number }>
  notes: string[]
  basis: string
}

export function estimateGrundsicherungIncome(input: GrundsicherungInput): GrundsicherungResult {
  const { rules, provisional } = rulesForYear(input.year)
  const g = rules.grundsicherung
  const months = Math.max(1, Math.round(input.months))

  const periodIncomeCents = input.receiptsCents - input.expensesCents
  const monthlyIncomeCents = Math.round(periodIncomeCents / months)
  const income = Math.max(0, monthlyIncomeCents)

  const pauschale = Math.min(income, g.pauschale * 100)

  const bands = g.bands.map((band, i) => {
    const isLast = i === g.bands.length - 1
    const upper = (isLast && input.hasMinorChild ? g.upperWithChild : band.to) * 100
    const lower = band.from * 100
    const portion = Math.max(0, Math.min(income, upper) - lower)
    return { from: band.from, to: upper / 100, rate: band.rate, amountCents: Math.round(portion * band.rate) }
  })
  const freibetrag = bands.reduce((s, b) => s + b.amountCents, 0)
  const deductions = Math.min(income, pauschale + freibetrag)
  const countable = income - deductions

  const notes = [
    'Estimate only. The Jobcenter decides which expenses it accepts and sets the final amount.',
    'Above 400 € monthly income you may prove higher actual costs (insurance, travel) instead of the 100 € flat amount.',
    'Self-employed people usually get a provisional decision for 6 months and must submit the final Anlage EKS afterwards.',
  ]
  if (periodIncomeCents < 0) notes.unshift('The period shows a loss. A loss is not deducted from other income.')
  if ((input.incomeTaxPaidCents ?? 0) > 0) {
    notes.push(
      `You recorded ${(input.incomeTaxPaidCents! / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })} income tax paid in this period. Taxes paid on income are deducted in addition to the 100 € flat amount (§11b Abs. 1 S. 1 Nr. 1 SGB II). This estimate does not include that deduction — show the payment to the Jobcenter.`
    )
  }
  if (provisional) notes.push(`Rules for ${input.year} are not final — the ${rules.year} values were used.`)

  return {
    benefitName: g.name,
    provisionalRules: provisional,
    months,
    receiptsCents: input.receiptsCents,
    expensesCents: input.expensesCents,
    periodIncomeCents,
    monthlyIncomeCents,
    monthlyPauschaleCents: pauschale,
    monthlyErwerbstaetigenFreibetragCents: freibetrag,
    monthlyDeductionsCents: deductions,
    monthlyCountableCents: countable,
    periodCountableCents: countable * months,
    bands,
    notes,
    basis: g.basis,
  }
}

/** Whole months between two calendar dates (inclusive), at least 1. */
export function monthsInPeriod(start: { year: number; month: number }, end: { year: number; month: number }): number {
  return Math.max(1, (end.year - start.year) * 12 + (end.month - start.month) + 1)
}
