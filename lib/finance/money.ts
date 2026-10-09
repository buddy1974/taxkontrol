/**
 * Money helpers. All financial arithmetic in TaxKontrol is done in integer
 * euro-cents so that sums, VAT splits and business/private allocations always
 * add up exactly. Values are converted to euros (2-decimal numbers) only at the
 * edges (API responses, UI).
 */

/** Something Prisma.Decimal-like, a number, or a numeric string. */
export type MoneyInput = number | string | { toString(): string } | null | undefined

/**
 * Parses a euro amount into integer cents. Decimal strings are parsed exactly
 * (no binary floating point); numbers are rounded half away from zero.
 * Returns 0 for null/undefined/non-numeric input.
 */
export function toCents(value: MoneyInput): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0
    // toPrecision(15) strips binary noise such as 1.005 -> 1.00499999...
    return roundHalfAwayFromZero(Number((value * 100).toPrecision(15)))
  }
  const str = value.toString().trim()
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(str)
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) {
    const n = Number(str)
    return Number.isFinite(n) ? toCents(n) : 0
  }
  const sign = match[1] === '-' ? -1 : 1
  const whole = match[2] === '' ? 0 : Number(match[2])
  const frac = (match[3] ?? '').padEnd(3, '0')
  let cents = whole * 100 + Number(frac.slice(0, 2))
  // Round on the third decimal (half away from zero).
  if (Number(frac[2]) >= 5) cents += 1
  return sign * cents
}

/** Integer cents -> euro number with two decimals (for JSON/UI). */
export function fromCents(cents: number): number {
  return Math.round(cents) / 100
}

export function roundHalfAwayFromZero(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value)
}

export function sumCents(values: number[]): number {
  return values.reduce((a, b) => a + b, 0)
}

/** percentage (e.g. 30 for 30 %) of an amount in cents, rounded to a cent. */
export function percentOf(cents: number, percent: number): number {
  return roundHalfAwayFromZero((cents * percent) / 100)
}

/**
 * Splits a gross amount into net + VAT for a VAT rate given in percent.
 * net + vat === gross always holds.
 */
export function splitGross(grossCents: number, vatRatePercent: number): { netCents: number; vatCents: number } {
  if (!vatRatePercent) return { netCents: grossCents, vatCents: 0 }
  const netCents = roundHalfAwayFromZero((grossCents * 100) / (100 + vatRatePercent))
  return { netCents, vatCents: grossCents - netCents }
}

/**
 * Allocates an amount between a business share and the remainder.
 * business + rest === total always holds.
 */
export function allocate(totalCents: number, businessPercent: number): { businessCents: number; restCents: number } {
  const businessCents = percentOf(totalCents, businessPercent)
  return { businessCents, restCents: totalCents - businessCents }
}

/** Formats cents as a German euro string, e.g. 123456 -> "1.234,56 €". */
export function formatEuro(cents: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(fromCents(cents))
}
