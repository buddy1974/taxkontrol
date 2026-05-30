import { db } from '@/lib/db'
import { computeMonthlyTaxReserve } from '@/lib/engines/taxReserve'
import type { DecisionContext } from './decisionTypes'

export async function buildDecisionContext(userId: string): Promise<DecisionContext> {
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)

  const [
    userRecord,
    income,
    expenses,
    taxReserves,
    fixedCosts,
    payablesAgg,
    employees,
    reserveCalc,
    yearTransactions,
    openCases,
    personaProfile,
  ] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { taxType: true } }),

    db.transaction.aggregate({
      where: { userId, type: 'INCOME', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { netAmount: true },
    }),

    db.transaction.aggregate({
      where: { userId, type: 'EXPENSE', transactionDate: { gte: startOfMonth, lt: startOfNextMonth } },
      _sum: { businessAmount: true },
    }),

    db.taxReserve.findMany({
      where: { userId },
      select: { actuallyReserved: true },
    }),

    db.fixedCost.findMany({
      where: { userId, isActive: true },
      select: { amount: true, frequency: true },
    }),

    db.payable.aggregate({
      where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
      _sum: { outstandingAmount: true },
    }),

    db.employee.findMany({
      where: { userId, isActive: true },
      select: { salaryAmount: true },
    }),

    computeMonthlyTaxReserve(userId, startOfMonth, startOfNextMonth),

    db.transaction.findMany({
      where: { userId, transactionDate: { gte: yearStart, lt: yearEnd } },
      select: { transactionDate: true },
    }),

    db.guidanceCase.findMany({
      where: { userId, status: { notIn: ['RESOLVED'] } },
      select: { status: true },
    }),

    db.userPersonaProfile.findUnique({
      where: { userId },
      select: { businessType: true, organizationLevel: true, bureaucracyConfidence: true },
    }),
  ])

  const currentMonthIncome = Number(income._sum.netAmount ?? 0)
  const currentMonthExpenses = Number(expenses._sum.businessAmount ?? 0)

  const totalFixedCosts = (fixedCosts as Array<{ amount: unknown; frequency: string }>).reduce(
    (sum, fc) => {
      const monthly =
        fc.frequency === 'YEARLY' ? Number(fc.amount) / 12
        : fc.frequency === 'QUARTERLY' ? Number(fc.amount) / 3
        : Number(fc.amount)
      return sum + monthly
    },
    0
  )

  const taxOwed = reserveCalc.vatShouldHave + reserveCalc.incomeTaxShouldHave
  const taxReserved = (taxReserves as Array<{ actuallyReserved: unknown }>).reduce(
    (sum, r) => sum + Number(r.actuallyReserved),
    0
  )
  const totalPayables = Number(payablesAgg._sum.outstandingAmount ?? 0)
  const totalSalaries = (employees as Array<{ salaryAmount: unknown }>).reduce(
    (sum, e) => sum + Number(e.salaryAmount),
    0
  )

  const safeToSpend = Math.max(
    0,
    currentMonthIncome - currentMonthExpenses - totalFixedCosts - taxOwed - totalPayables - totalSalaries
  )

  const monthsWithData = new Set(
    (yearTransactions as Array<{ transactionDate: Date }>).map(t =>
      new Date(t.transactionDate).getMonth()
    )
  ).size

  const openCaseEscalated = (openCases as Array<{ status: string }>).some(
    c => c.status === 'ESCALATED'
  )

  return {
    userId,
    taxType: userRecord?.taxType ?? 'KLEINUNTERNEHMER',
    currentMonthIncome,
    currentMonthExpenses,
    totalFixedCosts,
    taxOwed,
    taxReserved,
    totalPayables,
    totalSalaries,
    safeToSpend,
    monthsWithData,
    totalTransactions: yearTransactions.length,
    hasProfile: personaProfile !== null,
    openCaseCount: openCases.length,
    openCaseEscalated,
    persona: personaProfile
      ? {
          businessType: personaProfile.businessType,
          organizationLevel: personaProfile.organizationLevel,
          bureaucracyConfidence: personaProfile.bureaucracyConfidence,
        }
      : null,
  }
}
