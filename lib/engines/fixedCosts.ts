export type FixedCostFrequency = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export function toMonthlyAmount(amount: number, frequency: FixedCostFrequency): number {
  if (frequency === 'MONTHLY') return amount
  if (frequency === 'QUARTERLY') return amount / 3
  if (frequency === 'YEARLY') return amount / 12
  return amount
}

export function totalMonthlyFixedCosts(
  costs: { amount: number; frequency: FixedCostFrequency; isActive: boolean }[]
): number {
  return costs
    .filter(c => c.isActive)
    .reduce((sum, c) => sum + toMonthlyAmount(c.amount, c.frequency), 0)
}
