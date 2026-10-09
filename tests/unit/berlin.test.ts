import { describe, it, expect } from 'vitest'
import {
  berlinDate,
  berlinMidnight,
  berlinMonthRange,
  berlinQuarterRange,
  berlinYearRange,
  currentBerlinPeriods,
  parseCalendarDate,
  toBerlinIsoDate,
} from '@/lib/time/berlin'

describe('Berlin calendar boundaries', () => {
  it('winter midnight is 23:00 UTC the previous day', () => {
    expect(berlinMidnight(2026, 1, 1).toISOString()).toBe('2025-12-31T23:00:00.000Z')
  })

  it('summer midnight is 22:00 UTC the previous day', () => {
    expect(berlinMidnight(2026, 7, 1).toISOString()).toBe('2026-06-30T22:00:00.000Z')
  })

  it('handles the DST switch months', () => {
    // DST starts 2026-03-29, ends 2026-10-25
    expect(berlinMonthRange(2026, 3)).toEqual({
      start: new Date('2026-02-28T23:00:00.000Z'),
      end: new Date('2026-03-31T22:00:00.000Z'),
    })
    expect(berlinMonthRange(2026, 10)).toEqual({
      start: new Date('2026-09-30T22:00:00.000Z'),
      end: new Date('2026-10-31T23:00:00.000Z'),
    })
  })

  it('normalises month overflow into the next year', () => {
    expect(berlinMonthRange(2026, 12).end.toISOString()).toBe('2026-12-31T23:00:00.000Z')
  })

  it('builds quarters and years', () => {
    expect(berlinQuarterRange(2026, 4).start.toISOString()).toBe('2026-09-30T22:00:00.000Z')
    expect(berlinYearRange(2026).end.toISOString()).toBe('2026-12-31T23:00:00.000Z')
  })

  it('assigns a late-evening UTC instant to the next Berlin day', () => {
    // 2026-10-31 23:30 UTC is already 1 November in Berlin (CET, UTC+1)
    expect(berlinDate(new Date('2026-10-31T23:30:00Z'))).toEqual({ year: 2026, month: 11, day: 1 })
    const p = currentBerlinPeriods(new Date('2026-12-31T23:30:00Z'))
    expect(p.today).toEqual({ year: 2027, month: 1, day: 1 })
    expect(p.monthsElapsed).toBe(1)
  })
})

describe('parseCalendarDate', () => {
  it('parses date-only strings to a stable midday instant', () => {
    const d = parseCalendarDate('2026-03-29')!
    expect(d.toISOString()).toBe('2026-03-29T12:00:00.000Z')
    expect(toBerlinIsoDate(d)).toBe('2026-03-29')
  })

  it('rejects invalid dates', () => {
    expect(parseCalendarDate('2026-02-30')).toBeNull()
    expect(parseCalendarDate('not a date')).toBeNull()
    expect(parseCalendarDate(undefined)).toBeNull()
  })
})
