export type DecisionInput = {
  totalIncome: number
  totalExpenses: number
  totalFixedCosts: number
  taxOwed: number
  totalPayables: number
  totalSalaries: number
  requested: number
}

export type DecisionResult = {
  canSpend: boolean
  safeToSpend: number
  requested: number
  shortfall: number
  message: string
  breakdown: {
    totalIncome: number
    totalExpenses: number
    totalFixedCosts: number
    taxOwed: number
    totalPayables: number
    totalSalaries: number
  }
}

export function canISpend(input: DecisionInput): DecisionResult {
  const safeToSpend = Math.max(
    0,
    input.totalIncome -
    input.totalExpenses -
    input.totalFixedCosts -
    input.taxOwed -
    input.totalPayables -
    input.totalSalaries
  )

  const canSpend = input.requested <= safeToSpend
  const shortfall = Math.max(0, input.requested - safeToSpend)

  return {
    canSpend,
    safeToSpend,
    requested: input.requested,
    shortfall,
    message: canSpend
      ? `Yes, you can spend €${input.requested.toFixed(2)}. You have €${safeToSpend.toFixed(2)} available after all obligations.`
      : `No. You only have €${safeToSpend.toFixed(2)} safe to spend. You are short by €${shortfall.toFixed(2)}.`,
    breakdown: {
      totalIncome: input.totalIncome,
      totalExpenses: input.totalExpenses,
      totalFixedCosts: input.totalFixedCosts,
      taxOwed: input.taxOwed,
      totalPayables: input.totalPayables,
      totalSalaries: input.totalSalaries,
    },
  }
}
