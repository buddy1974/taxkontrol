import { describe, it, expect } from 'vitest'
import { evaluateDecision } from '@/lib/decision/safeToSpendDecision'
import type { DecisionContext } from '@/lib/decision/decisionTypes'

const base: DecisionContext = {
  userId: 'u',
  taxType: 'KLEINUNTERNEHMER',
  currentMonthIncome: 0,
  currentMonthExpenses: 400,
  totalFixedCosts: 0,
  taxOwed: 0,
  taxReserved: 0,
  totalPayables: 0,
  totalSalaries: 0,
  safeToSpend: -400,
  monthsWithData: 3,
  totalTransactions: 12,
  hasProfile: true,
  openCaseCount: 0,
  openCaseEscalated: false,
  persona: null,
}
const input = { amount: 100, purpose: 'Laptop', decisionType: 'BUY_EQUIPMENT' as const }

describe('decision centre', () => {
  it('does not recommend spending when the month is already short, even without income', () => {
    const r = evaluateDecision(base, input, [], [])
    expect(r.resultLevel).toBe('NOT_RECOMMENDED')
    expect(r.reasons[0]).toMatch(/already about €400.00 short/)
    expect(r.whatIfRemaining).toBe(-500)
  })

  it('refuses to judge without any transactions', () => {
    expect(evaluateDecision({ ...base, totalTransactions: 0, monthsWithData: 0, hasProfile: false }, input, [], []).resultLevel).toBe('INSUFFICIENT_DATA')
  })

  it('is SAFE only with enough room and complete records', () => {
    expect(evaluateDecision({ ...base, safeToSpend: 2000, currentMonthIncome: 3000 }, input, [], []).resultLevel).toBe('SAFE')
  })
})
