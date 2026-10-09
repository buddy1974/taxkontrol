import { describe, it, expect } from 'vitest'
import { toCents, fromCents, splitGross, allocate, percentOf, formatEuro } from '@/lib/finance/money'

describe('toCents', () => {
  it('parses decimal strings exactly', () => {
    expect(toCents('119.00')).toBe(11900)
    expect(toCents('0.1')).toBe(10)
    expect(toCents('1.005')).toBe(101) // half away from zero on 3rd decimal
    expect(toCents('-2.345')).toBe(-235)
    expect(toCents('12')).toBe(1200)
  })

  it('handles numbers without binary noise', () => {
    expect(toCents(1.005)).toBe(101)
    expect(toCents(0.1 + 0.2)).toBe(30)
    expect(toCents(-0.5)).toBe(-50)
  })

  it('handles Decimal-like objects and empty input', () => {
    expect(toCents({ toString: () => '99.99' })).toBe(9999)
    expect(toCents(null)).toBe(0)
    expect(toCents(undefined)).toBe(0)
    expect(toCents('abc')).toBe(0)
    expect(toCents(Number.NaN)).toBe(0)
  })
})

describe('splitGross', () => {
  it('splits 119 € at 19 % into 100 + 19', () => {
    expect(splitGross(11900, 19)).toEqual({ netCents: 10000, vatCents: 1900 })
  })

  it('splits 107 € at 7 % into 100 + 7', () => {
    expect(splitGross(10700, 7)).toEqual({ netCents: 10000, vatCents: 700 })
  })

  it('always sums back to gross', () => {
    for (const gross of [1, 2, 99, 1234, 99999, 123457]) {
      for (const rate of [0, 7, 19]) {
        const { netCents, vatCents } = splitGross(gross, rate)
        expect(netCents + vatCents).toBe(gross)
      }
    }
  })

  it('returns no VAT at rate 0', () => {
    expect(splitGross(5000, 0)).toEqual({ netCents: 5000, vatCents: 0 })
  })
})

describe('allocate / percentOf', () => {
  it('allocates without losing cents', () => {
    const { businessCents, restCents } = allocate(1001, 50)
    expect(businessCents + restCents).toBe(1001)
    expect(businessCents).toBe(501)
  })

  it('computes percentages', () => {
    expect(percentOf(10000, 30)).toBe(3000)
    expect(percentOf(333, 33)).toBe(110)
  })
})

describe('formatting', () => {
  it('formats German euro amounts', () => {
    expect(fromCents(123456)).toBe(1234.56)
    expect(formatEuro(123456).replace(/\s/g, ' ')).toBe('1.234,56 €')
  })
})
