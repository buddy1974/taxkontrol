/**
 * Kleinunternehmer (§19 UStG) turnover monitor, rules valid since 1.1.2025:
 * - prior-year Gesamtumsatz must not exceed 25,000 €, and
 * - current-year Gesamtumsatz must not exceed 100,000 €. The transaction that
 *   crosses 100,000 € is already taxed normally (BMF 18.03.2025).
 * Gesamtumsatz is measured on amounts received, without VAT. Sales of fixed
 * assets do not count — TaxKontrol cannot detect those, so the user is told.
 */
import { rulesForYear } from './rules'

export type KleinunternehmerStatus =
  | 'OK'
  | 'APPROACHING_CURRENT_LIMIT'
  | 'CURRENT_LIMIT_EXCEEDED'
  | 'PRIOR_YEAR_LIMIT_EXCEEDED'
  | 'NEXT_YEAR_AT_RISK'
  | 'FOUNDING_YEAR_LIMIT_EXCEEDED'

export interface KleinunternehmerCheck {
  status: KleinunternehmerStatus
  year: number
  priorYearTurnoverCents: number
  currentYearTurnoverCents: number
  priorYearLimitCents: number
  currentYearLimitCents: number
  message: string
  basis: string
  /** Incoming money not classified yet that the check counted as turnover (cautious). */
  unclassifiedCents?: number
}

/** Share of the 100,000 € limit at which we start warning. */
const APPROACH_SHARE = 0.8

export function checkKleinunternehmer(params: {
  year: number
  priorYearTurnoverCents: number
  currentYearTurnoverCents: number
  /** False when no data for the prior year exists (e.g. founded this year). */
  hasPriorYearData: boolean
}): KleinunternehmerCheck {
  const { rules } = rulesForYear(params.year)
  const prior = rules.kleinunternehmer.priorYearLimit * 100
  const current = rules.kleinunternehmer.currentYearLimit * 100
  const base = {
    year: params.year,
    priorYearTurnoverCents: params.priorYearTurnoverCents,
    currentYearTurnoverCents: params.currentYearTurnoverCents,
    priorYearLimitCents: prior,
    currentYearLimitCents: current,
    basis: rules.kleinunternehmer.basis,
  }

  if (params.hasPriorYearData && params.priorYearTurnoverCents > prior) {
    return {
      ...base,
      status: 'PRIOR_YEAR_LIMIT_EXCEEDED',
      message: `Your recorded turnover last year was above ${rules.kleinunternehmer.priorYearLimit.toLocaleString('de-DE')} €. The Kleinunternehmer rule probably does not apply to you this year. Please check with your Steuerberater.`,
    }
  }
  if (params.currentYearTurnoverCents > current) {
    return {
      ...base,
      status: 'CURRENT_LIMIT_EXCEEDED',
      message: `Your recorded turnover this year is above ${rules.kleinunternehmer.currentYearLimit.toLocaleString('de-DE')} €. From the sale that crossed this limit you must charge VAT. Contact your Steuerberater now.`,
    }
  }
  // Founding year first: there the 25,000 € limit applies to this year's turnover, so being
  // "close to 100,000 €" would be a falsely reassuring message for someone far above 25,000 €.
  // Founding year: the BMF applies the 25,000 € limit to actual turnover.
  if (!params.hasPriorYearData && params.currentYearTurnoverCents > prior) {
    return {
      ...base,
      status: 'FOUNDING_YEAR_LIMIT_EXCEEDED',
      message: `If you started your business this year: in the first business year the tax office applies a ${rules.kleinunternehmer.priorYearLimit.toLocaleString('de-DE')} € limit. Your recorded turnover is above it. If your business is older, enter last year's turnover in your records. Please talk to your Steuerberater about charging VAT.`,
    }
  }
  if (params.currentYearTurnoverCents >= current * APPROACH_SHARE) {
    return {
      ...base,
      status: 'APPROACHING_CURRENT_LIMIT',
      message: `Your turnover this year is close to the ${rules.kleinunternehmer.currentYearLimit.toLocaleString('de-DE')} € limit. Once you cross it, you must charge VAT immediately.`,
    }
  }
  if (params.currentYearTurnoverCents > prior) {
    return {
      ...base,
      status: 'NEXT_YEAR_AT_RISK',
      message: `Your turnover this year is above ${rules.kleinunternehmer.priorYearLimit.toLocaleString('de-DE')} €. You can stay Kleinunternehmer this year, but probably not next year.`,
    }
  }
  return { ...base, status: 'OK', message: 'Your recorded turnover is within the Kleinunternehmer limits.' }
}
