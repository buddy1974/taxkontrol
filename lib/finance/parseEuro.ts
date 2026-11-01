/**
 * Parses an amount typed by a person, German or international style.
 * Accepted: "1234", "1234,5", "1234.56", "1.234,56", "1.234", "1,234.56", "1,234,567".
 * "1,234" is refused: in German a comma is the decimal separator, so it may be a mistyped
 * "1,23" — the person has to write "1234" or "1.234".
 * Anything ambiguous or malformed returns null — the caller must then show an
 * error instead of guessing (never fall back to another value silently).
 */
export function parseEuroInput(input: unknown): number | null {
  if (typeof input === 'number') return Number.isFinite(input) ? input : null
  if (typeof input !== 'string') return null
  const s = input.trim().replace(/\s|€/g, '')
  if (s === '') return null
  let normalised: string | null = null
  if (/^-?\d+([.,]\d{1,2})?$/.test(s)) normalised = s.replace(',', '.') // 1234,56 / 1234.56
  else if (/^-?\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) normalised = s.replace(/\./g, '').replace(',', '.') // 1.234,56
  else if (/^-?\d{1,3}(,\d{3})+\.\d{1,2}$/.test(s) || /^-?\d{1,3}(,\d{3}){2,}$/.test(s)) normalised = s.replace(/,/g, '') // 1,234.56 / 1,234,567
  if (normalised === null) return null
  const n = Number(normalised)
  return Number.isFinite(n) ? n : null
}
