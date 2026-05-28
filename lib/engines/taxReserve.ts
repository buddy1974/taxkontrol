import { db } from '@/lib/db'

export interface TaxReserveCalc {
  vatShouldHave: number
  incomeTaxShouldHave: number
}

/**
 * Computes the current-month tax reserve targets from live transaction data.
 * VAT: sum of VAT collected on INCOME transactions (0 for Kleinunternehmer).
 * INCOME_TAX: taxable profit (income - expenses) * incomeTaxReserveRate.
 * Both floor at 0.
 */
export async function computeMonthlyTaxReserve(
  userId: string,
  startOfMonth: Date,
  startOfNextMonth: Date
): Promise<TaxReserveCalc> {
  const [user, incomeAgg, expenseAgg, vatAgg] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { taxType: true, taxProfile: { select: { incomeTaxReserveRate: true } } },
    }),
    db.transaction.aggregate({
      where: { userId, type: 'INCOME', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { netAmount: true },
    }),
    db.transaction.aggregate({
      where: { userId, type: 'EXPENSE', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { businessAmount: true },
    }),
    db.transaction.aggregate({
      where: { userId, type: 'INCOME', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { vatAmount: true },
    }),
  ])

  if (!user) return { vatShouldHave: 0, incomeTaxShouldHave: 0 }

  const isKleinunternehmer = user.taxType === 'KLEINUNTERNEHMER'
  const incomeTaxReserveRate = Number(user.taxProfile?.incomeTaxReserveRate ?? 30) / 100

  const vatShouldHave = isKleinunternehmer
    ? 0
    : Number(vatAgg._sum.vatAmount ?? 0)

  const totalIncome = Number(incomeAgg._sum.netAmount ?? 0)
  const totalExpenses = Number(expenseAgg._sum.businessAmount ?? 0)
  const taxableProfit = Math.max(0, totalIncome - totalExpenses)
  const incomeTaxShouldHave = taxableProfit * incomeTaxReserveRate

  return { vatShouldHave, incomeTaxShouldHave }
}
