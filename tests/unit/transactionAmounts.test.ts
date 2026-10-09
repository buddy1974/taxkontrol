import { describe, it, expect } from 'vitest'
import { computeTransactionAmounts, TransactionValidationError, centsToDecimalString } from '@/lib/finance/transactionAmounts'

const regel = { taxType: 'REGELBESTEUERUNG' as const }
const klein = { taxType: 'KLEINUNTERNEHMER' as const }

describe('computeTransactionAmounts — Regelbesteuerung', () => {
  it('business income 2,380 € at 19 %: 2,000 € income, 380 € VAT owed', () => {
    const a = computeTransactionAmounts({ ...regel, type: 'INCOME', grossAmount: 2380, vatRate: 19, usage: 'BUSINESS', businessPct: 100 })
    expect(a.netCents).toBe(200000)
    expect(a.businessCents).toBe(200000)
    expect(a.outputVatCents).toBe(38000)
    expect(a.privateCents).toBe(0)
    expect(a.db.businessAmount).toBe('2000.00')
  })

  it('mixed phone bill 59.50 € at 19 %, 70 % business: only the business share and its VAT are deductible', () => {
    const a = computeTransactionAmounts({ ...regel, type: 'EXPENSE', grossAmount: '59.50', vatRate: 19, usage: 'MIXED', businessPct: 70 })
    expect(a.netCents).toBe(5000)
    expect(a.vatCents).toBe(950)
    expect(a.businessCents).toBe(3500)
    expect(a.deductibleVatCents).toBe(665)
    expect(a.privateCents).toBe(1785) // 59.50 − 35.00 − 6.65
    expect(a.businessCents + a.deductibleVatCents + a.privateCents).toBe(a.grossCents)
  })

  it('private expense is not deductible at all', () => {
    const a = computeTransactionAmounts({ ...regel, type: 'EXPENSE', grossAmount: 119, vatRate: 19, usage: 'PRIVATE', businessPct: 100 })
    expect(a.businessPct).toBe(0)
    expect(a.businessCents).toBe(0)
    expect(a.deductibleVatCents).toBe(0)
    expect(a.privateCents).toBe(11900)
  })

  it('ignores a client-supplied 100 % for a PRIVATE expense (server decides from usage)', () => {
    const a = computeTransactionAmounts({ ...regel, type: 'EXPENSE', grossAmount: 50, vatRate: 0, usage: 'PRIVATE', businessPct: 100 })
    expect(a.businessCents).toBe(0)
  })

  it('a private deposit or loan coming in is not income', () => {
    const a = computeTransactionAmounts({ ...regel, type: 'INCOME', grossAmount: 5000, vatRate: 0, usage: 'PRIVATE', businessPct: 0 })
    expect(a.businessCents).toBe(0)
    expect(a.outputVatCents).toBe(0)
    expect(a.privateCents).toBe(500000)
  })

  it('unclear money is excluded and flagged for review', () => {
    const inc = computeTransactionAmounts({ ...regel, type: 'INCOME', grossAmount: 300, vatRate: 0, usage: 'UNSURE', businessPct: 100 })
    expect(inc.businessCents).toBe(0)
    expect(inc.unclearCents).toBe(30000)
    expect(inc.needsReview).toBe(true)
    const exp = computeTransactionAmounts({ ...regel, type: 'EXPENSE', grossAmount: 80, vatRate: 19, usage: 'UNSURE', businessPct: 100 })
    expect(exp.businessCents).toBe(0)
    expect(exp.deductibleVatCents).toBe(0)
    expect(exp.unclearCents).toBe(8000)
  })
})

describe('computeTransactionAmounts — Kleinunternehmer', () => {
  it('books expenses at the gross amount (no input VAT deduction)', () => {
    const a = computeTransactionAmounts({ ...klein, type: 'EXPENSE', grossAmount: 119, vatRate: 19, usage: 'BUSINESS', businessPct: 100 })
    expect(a.vatRate).toBe(0)
    expect(a.vatCents).toBe(0)
    expect(a.businessCents).toBe(11900)
    expect(a.deductibleVatCents).toBe(0)
  })

  it('rejects VAT on Kleinunternehmer income with an explanation', () => {
    expect(() =>
      computeTransactionAmounts({ ...klein, type: 'INCOME', grossAmount: 119, vatRate: 19, usage: 'BUSINESS', businessPct: 100 })
    ).toThrow(/Kleinunternehmer/)
  })

  it('in lenient mode (stored legacy rows) flags such income instead of throwing', () => {
    const a = computeTransactionAmounts({ ...klein, type: 'INCOME', grossAmount: 119, vatRate: 19, usage: 'BUSINESS', businessPct: 100 }, false)
    expect(a.needsReview).toBe(true)
    expect(a.businessCents).toBe(11900)
  })
})

describe('validation', () => {
  const base = { ...regel, type: 'EXPENSE' as const, vatRate: 19, usage: 'BUSINESS' as const, businessPct: 100 }

  it.each([
    [{ grossAmount: 0 }, 'grossAmount'],
    [{ grossAmount: -10 }, 'grossAmount'],
    [{ grossAmount: 'abc' }, 'grossAmount'],
    [{ grossAmount: 20_000_000 }, 'grossAmount'],
    [{ grossAmount: 10, vatRate: 16 }, 'vatRate'],
    [{ grossAmount: 10, usage: 'MIXED' as const, businessPct: 0 }, 'businessPct'],
    [{ grossAmount: 10, usage: 'MIXED' as const, businessPct: 100 }, 'businessPct'],
  ])('rejects %o', (override, field) => {
    try {
      computeTransactionAmounts({ ...base, ...override } as Parameters<typeof computeTransactionAmounts>[0])
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(TransactionValidationError)
      expect((e as TransactionValidationError).field).toBe(field)
    }
  })

  it('rejects MIXED for income', () => {
    expect(() => computeTransactionAmounts({ ...regel, type: 'INCOME', grossAmount: 10, vatRate: 0, usage: 'MIXED', businessPct: 50 })).toThrow(TransactionValidationError)
  })

  it('formats decimal strings exactly', () => {
    expect(centsToDecimalString(1785)).toBe('17.85')
    expect(centsToDecimalString(5)).toBe('0.05')
    expect(centsToDecimalString(-120)).toBe('-1.20')
  })
})
