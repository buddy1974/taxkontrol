import { toCents, type MoneyInput } from './money'

/** Monthly share of recurring costs in cents (quarterly / 3, yearly / 12). */
export function monthlyFixedCostCents(costs: Array<{ amount: MoneyInput; frequency: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | string }>): number {
  return costs.reduce((sum, c) => {
    const cents = Math.abs(toCents(c.amount))
    if (c.frequency === 'MONTHLY') return sum + cents
    if (c.frequency === 'QUARTERLY') return sum + Math.round(cents / 3)
    if (c.frequency === 'YEARLY') return sum + Math.round(cents / 12)
    return sum
  }, 0)
}
