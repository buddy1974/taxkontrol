/**
 * Tax periods (pure). Which VAT filing periods and income-tax years exist between a
 * tracking start and today, under the status valid at each time. Used by the financial
 * position AND by the Tax page API, so both always agree on which periods are open.
 */
import { berlinDate, berlinMonthRange, berlinQuarterRange, berlinYearRange, quarterOf, type DateRange } from '../time/berlin'
import type { TaxStatusTimeline, VatFilingPeriod } from './taxStatus'

export type PeriodRange = DateRange & { label: string }

export function vatPeriodFor(now: Date, period: VatFilingPeriod): PeriodRange {
  const d = berlinDate(now)
  if (period === 'MONTHLY') {
    const r = berlinMonthRange(d.year, d.month)
    return { ...r, label: `${String(d.month).padStart(2, '0')}/${d.year}` }
  }
  if (period === 'YEARLY') return { ...berlinYearRange(d.year), label: String(d.year) }
  const q = quarterOf(d.month)
  return { ...berlinQuarterRange(d.year, q), label: `Q${q} ${d.year}` }
}

/** The VAT filing period just before the one containing `now`. */
export function previousVatPeriodFor(now: Date, period: VatFilingPeriod): PeriodRange {
  const current = vatPeriodFor(now, period)
  return vatPeriodFor(new Date(current.start.getTime() - 1), period)
}

export interface TaxPeriod extends PeriodRange {
  type: 'VAT' | 'INCOME_TAX'
  /** CURRENT = contains today; ENDED = over. */
  status: 'CURRENT' | 'ENDED'
  vatFilingPeriod?: VatFilingPeriod
  dauerfristverlaengerung?: boolean
}

/**
 * Tax periods are tracked from the start of the year before last: income tax for a year is
 * often assessed only one or two years later (Steuerbescheid), and every unpaid VAT period
 * stays open until the user records the payment or marks it settled — it never drops out
 * because the calendar moved on.
 */
export function trackingStartFor(now: Date): Date {
  return berlinYearRange(berlinDate(now).year - 2).start
}

export function listTaxPeriods(timeline: TaxStatusTimeline, now: Date, trackingStart: Date = trackingStartFor(now)): TaxPeriod[] {
  const periods: TaxPeriod[] = []
  // VAT: walk the filing periods with the filing period valid at each period's start.
  const everVatLiable = timeline.vatLiableWithin(trackingStart, new Date(now.getTime() + 1))
  let cursor = trackingStart
  for (let guard = 0; cursor.getTime() <= now.getTime() && guard < 200; guard++) {
    const st = timeline.statusAt(cursor)
    let p = vatPeriodFor(cursor, st.vatFilingPeriod)
    // A rhythm change inside a period must never produce overlapping periods (the same
    // booking would be taxed twice): the new period then starts where the last one ended.
    if (p.start.getTime() < cursor.getTime()) p = { ...p, start: cursor, label: `${p.label} (rest)` }
    // Once the user was VAT-registered at any time in the tracked window, every VAT period is
    // listed: a payment of an invoice issued while VAT-registered can fall into a later
    // Kleinunternehmer period and its VAT is still owed (§20 S. 3 UStG). The position shows
    // such a period only when it has VAT.
    if (everVatLiable) {
      periods.push({
        ...p,
        type: 'VAT',
        status: p.end.getTime() <= now.getTime() ? 'ENDED' : 'CURRENT',
        vatFilingPeriod: st.vatFilingPeriod,
        dauerfristverlaengerung: st.dauerfristverlaengerung,
      })
    }
    cursor = p.end
  }
  // Income tax: calendar years.
  const first = berlinDate(trackingStart).year
  const last = berlinDate(now).year
  for (let y = first; y <= last; y++) {
    const r = berlinYearRange(y)
    periods.push({ ...r, label: String(y), type: 'INCOME_TAX', status: y < last ? 'ENDED' : 'CURRENT' })
  }
  return periods
}

const berlinDayFormat = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * When the Finanzamt usually expects the VAT of a period. `periodEnd` is the exclusive end.
 * Advance returns: 10th day after the period (§18 Abs. 1 UStG), one month later with
 * Dauerfristverlängerung (§§46–48 UStDV). Yearly filers (no advance returns): the annual
 * return; a difference is payable one month after filing (§18 Abs. 4 UStG).
 */
export function vatDueNote(periodEnd: Date, opts: { yearly?: boolean; dauerfrist?: boolean } = {}): string {
  if (opts.yearly) return 'Paid with the annual VAT return (due one month after you file it, §18 Abs. 4 UStG)'
  const end = berlinDate(periodEnd)
  // periodEnd is Berlin midnight of the 1st of the next month; add one month for DFV.
  const base = opts.dauerfrist ? new Date(Date.UTC(end.year, end.month, 1)) : new Date(Date.UTC(end.year, end.month - 1, 1))
  const tenth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 10, 12))
  return opts.dauerfrist
    ? `Usually due by ${berlinDayFormat.format(tenth)} (§18 UStG with Dauerfristverlängerung)`
    : `Usually due by ${berlinDayFormat.format(tenth)} (§18 UStG; one month later with Dauerfristverlängerung)`
}
