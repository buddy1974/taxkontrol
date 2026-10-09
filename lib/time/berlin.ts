/**
 * German calendar helpers. Tax periods (months, quarters, years) follow the
 * German calendar day in Europe/Berlin, not the server's timezone (UTC on
 * Vercel). These helpers return UTC instants for Berlin-local boundaries so
 * database range queries (`gte start`, `lt end`) are correct all year,
 * including across daylight-saving changes.
 */

export const BERLIN_TZ = 'Europe/Berlin'

export interface BerlinDate {
  year: number
  /** 1–12 */
  month: number
  day: number
}

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BERLIN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function zonedParts(instant: Date) {
  const parts: Record<string, number> = {}
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return parts as { year: number; month: number; day: number; hour: number; minute: number; second: number }
}

/** The Berlin calendar date of an instant. */
export function berlinDate(instant: Date = new Date()): BerlinDate {
  const p = zonedParts(instant)
  return { year: p.year, month: p.month, day: p.day }
}

/** Offset of Berlin local time vs UTC at the given instant, in ms. */
function berlinOffsetMs(instant: Date): number {
  const p = zonedParts(instant)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000
}

/**
 * UTC instant of Berlin-local midnight at the start of the given calendar day.
 * Month/day overflow is normalised (month 13 -> January of next year).
 */
export function berlinMidnight(year: number, month: number, day = 1): Date {
  const naive = Date.UTC(year, month - 1, day)
  let instant = naive - berlinOffsetMs(new Date(naive))
  // Re-check once: the offset can differ at the corrected instant (DST edge).
  instant = naive - berlinOffsetMs(new Date(instant))
  return new Date(instant)
}

export interface DateRange {
  /** inclusive */
  start: Date
  /** exclusive */
  end: Date
}

export function berlinMonthRange(year: number, month: number): DateRange {
  return { start: berlinMidnight(year, month, 1), end: berlinMidnight(year, month + 1, 1) }
}

export function berlinQuarterRange(year: number, quarter: 1 | 2 | 3 | 4): DateRange {
  const firstMonth = (quarter - 1) * 3 + 1
  return { start: berlinMidnight(year, firstMonth, 1), end: berlinMidnight(year, firstMonth + 3, 1) }
}

export function berlinYearRange(year: number): DateRange {
  return { start: berlinMidnight(year, 1, 1), end: berlinMidnight(year + 1, 1, 1) }
}

export function quarterOf(month: number): 1 | 2 | 3 | 4 {
  return (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4
}

/** Ranges for "now" in Berlin: current month, quarter and year. */
export function currentBerlinPeriods(now: Date = new Date()) {
  const d = berlinDate(now)
  return {
    today: d,
    month: berlinMonthRange(d.year, d.month),
    quarter: berlinQuarterRange(d.year, quarterOf(d.month)),
    year: berlinYearRange(d.year),
    /** Elapsed months of the year including the current one (1–12). */
    monthsElapsed: d.month,
  }
}

/**
 * Parses a calendar date "YYYY-MM-DD" (as sent by <input type="date">) into a
 * stable instant: 12:00 UTC on that day, which is the same calendar day in
 * Berlin in summer and winter. Returns null for invalid input.
 */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day, 12))
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return date
}

/** "YYYY-MM-DD" of an instant in Berlin. */
export function toBerlinIsoDate(instant: Date): string {
  const d = berlinDate(instant)
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

const MONTH_FORMAT = new Intl.DateTimeFormat('de-DE', { timeZone: BERLIN_TZ, month: 'long', year: 'numeric' })
export function formatBerlinMonth(instant: Date): string {
  return MONTH_FORMAT.format(instant)
}

/** Start of today (Berlin) as an instant. */
export function startOfBerlinToday(now: Date = new Date()): Date {
  const d = berlinDate(now)
  return berlinMidnight(d.year, d.month, d.day)
}

/**
 * A due date is overdue only once its calendar day (Berlin) has passed —
 * something due today is not overdue yet.
 */
export function isPastDue(dueDate: Date | null, now: Date = new Date()): boolean {
  if (!dueDate) return false
  const due = berlinDate(dueDate)
  return berlinMidnight(due.year, due.month, due.day + 1) <= startOfBerlinToday(now)
}
