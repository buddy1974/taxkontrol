/**
 * Versioned German rule values used by TaxKontrol's estimates.
 *
 * Every value carries its legal basis. Sources and verification notes live in
 * docs/finance/RULES.md (research date 2026-10-09). Do NOT edit a value here
 * without updating that document. Never add a year whose law is not enacted:
 * for such years the latest enacted rules are used and the result is flagged
 * as provisional (see `rulesForYear`).
 */

export const RULES_VERIFIED_ON = '2026-10-09'

/** §12 UStG: 19 % standard, 7 % reduced. 0 for tax-free / Kleinunternehmer / private. */
export const ALLOWED_VAT_RATES: readonly number[] = [0, 7, 19]

export interface IncomeTaxTariff {
  /** §32a Abs. 1 EStG zone limits in full euros (upper bound inclusive). */
  grundfreibetrag: number
  zone2Upper: number
  zone2: { a: number; b: number }
  zone3Upper: number
  zone3: { a: number; b: number; c: number }
  zone4: { rate: number; minus: number }
  zone5Lower: number
  zone5: { rate: number; minus: number }
}

export interface SoliRules {
  rate: number
  /** Freigrenze on the income tax amount (single assessment). */
  freigrenzeSingle: number
  /** Milderungszone: surcharge capped at this share of the excess over the Freigrenze. */
  milderungsRate: number
}

export interface YearRules {
  year: number
  /** Source law for the tariff. */
  tariffBasis: string
  tariff: IncomeTaxTariff
  soli: SoliRules
  kleinunternehmer: { priorYearLimit: number; currentYearLimit: number; basis: string }
  ustVoranmeldung: { monthlyAbovePriorYearTax: number; exemptUpToPriorYearTax: number; basis: string }
  gewerbesteuer: { freibetrag: number; messzahl: number; mindestHebesatz: number; anrechnungsFaktor: number }
  grundsicherung: {
    name: string
    /** §11b Abs. 2 SGB II flat deduction per month. */
    pauschale: number
    /** §11b Abs. 3 SGB II bands on monthly earned income. */
    bands: Array<{ from: number; to: number; rate: number }>
    /** Upper limit of the 10 % band with at least one minor child. */
    upperWithChild: number
    regelbedarfSingle: number
    basis: string
  }
}

const TARIFF_2025: IncomeTaxTariff = {
  grundfreibetrag: 12096,
  zone2Upper: 17443,
  zone2: { a: 932.3, b: 1400 },
  zone3Upper: 68480,
  zone3: { a: 176.64, b: 2397, c: 1015.13 },
  zone4: { rate: 0.42, minus: 10911.92 },
  zone5Lower: 277826,
  zone5: { rate: 0.45, minus: 19246.67 },
}

const TARIFF_2026: IncomeTaxTariff = {
  grundfreibetrag: 12348,
  zone2Upper: 17799,
  zone2: { a: 914.51, b: 1400 },
  zone3Upper: 69878,
  zone3: { a: 173.1, b: 2397, c: 1034.87 },
  zone4: { rate: 0.42, minus: 11135.63 },
  zone5Lower: 277826,
  zone5: { rate: 0.45, minus: 19470.38 },
}

const GRUNDSICHERUNG_BANDS = [
  { from: 100, to: 520, rate: 0.2 },
  { from: 520, to: 1000, rate: 0.3 },
  { from: 1000, to: 1200, rate: 0.1 },
]

const KLEINUNTERNEHMER_SINCE_2025 = {
  priorYearLimit: 25000,
  currentYearLimit: 100000,
  basis: '§19 Abs. 1 UStG (gültig ab 1.1.2025), BMF-Schreiben 18.03.2025',
}

const UST_VA = {
  monthlyAbovePriorYearTax: 9000,
  exemptUpToPriorYearTax: 2000,
  basis: '§18 Abs. 1, 2 UStG',
}

export const ENACTED_RULES: Record<number, YearRules> = {
  2025: {
    year: 2025,
    tariffBasis: '§32a EStG i.d.F. Steuerfortentwicklungsgesetz v. 30.12.2024 (VZ 2025)',
    tariff: TARIFF_2025,
    soli: { rate: 0.055, freigrenzeSingle: 19950, milderungsRate: 0.119 },
    kleinunternehmer: KLEINUNTERNEHMER_SINCE_2025,
    ustVoranmeldung: UST_VA,
    gewerbesteuer: { freibetrag: 24500, messzahl: 0.035, mindestHebesatz: 2.0, anrechnungsFaktor: 4.0 },
    grundsicherung: {
      name: 'Bürgergeld',
      pauschale: 100,
      bands: GRUNDSICHERUNG_BANDS,
      upperWithChild: 1500,
      regelbedarfSingle: 563,
      basis: '§11b SGB II, §3 Bürgergeld-V',
    },
  },
  2026: {
    year: 2026,
    tariffBasis: '§32a EStG (VZ 2026)',
    tariff: TARIFF_2026,
    soli: { rate: 0.055, freigrenzeSingle: 20350, milderungsRate: 0.119 },
    kleinunternehmer: KLEINUNTERNEHMER_SINCE_2025,
    ustVoranmeldung: UST_VA,
    gewerbesteuer: { freibetrag: 24500, messzahl: 0.035, mindestHebesatz: 2.0, anrechnungsFaktor: 4.0 },
    grundsicherung: {
      // Renamed from Bürgergeld on 1.7.2026; §11b allowances unchanged.
      name: 'Grundsicherungsgeld',
      pauschale: 100,
      bands: GRUNDSICHERUNG_BANDS,
      upperWithChild: 1500,
      regelbedarfSingle: 563,
      basis: '§11b SGB II, §3 GrusiGV (ab 1.7.2026)',
    },
  },
}

const ENACTED_YEARS = Object.keys(ENACTED_RULES).map(Number).sort((a, b) => a - b)

export interface ResolvedRules {
  rules: YearRules
  /** The year asked for. */
  requestedYear: number
  /** True when the requested year has no enacted rules and a nearby year was used. */
  provisional: boolean
}

/**
 * Rules for a calendar year. Years after the latest enacted year use the latest
 * enacted rules and are flagged provisional; years before the earliest supported
 * year use the earliest rules and are also flagged.
 */
export function rulesForYear(year: number): ResolvedRules {
  const exact = ENACTED_RULES[year]
  if (exact) return { rules: exact, requestedYear: year, provisional: false }
  const fallbackYear = year > ENACTED_YEARS[ENACTED_YEARS.length - 1] ? ENACTED_YEARS[ENACTED_YEARS.length - 1] : ENACTED_YEARS[0]
  return { rules: ENACTED_RULES[fallbackYear], requestedYear: year, provisional: true }
}
