import { db } from '@/lib/db'
import type { ExtendedUserContext, PersonaProfile } from './guidanceTypes'

export async function getPersonaProfile(userId: string): Promise<PersonaProfile | null> {
  const p = await db.userPersonaProfile.findUnique({ where: { userId } })
  if (!p) return null
  return {
    businessType: p.businessType,
    industryCategory: p.industryCategory,
    businessDescription: p.businessDescription,
    employeeCount: p.employeeCount,
    paymentStyle: p.paymentStyle,
    cashPercentage: p.cashPercentage,
    invoicePercentage: p.invoicePercentage,
    transferPercentage: p.transferPercentage,
    operatingDaysPerWeek: p.operatingDaysPerWeek,
    averageMonthlyRevenue: p.averageMonthlyRevenue ? Number(p.averageMonthlyRevenue) : null,
    averageMonthlyExpenses: p.averageMonthlyExpenses ? Number(p.averageMonthlyExpenses) : null,
    seasonalBusiness: p.seasonalBusiness,
    highSeasonMonths: p.highSeasonMonths,
    lowSeasonMonths: p.lowSeasonMonths,
    guidanceComplexity: p.guidanceComplexity,
    bureaucracyConfidence: p.bureaucracyConfidence,
    organizationLevel: p.organizationLevel,
  }
}

export async function buildUserContext(userId: string): Promise<ExtendedUserContext> {
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)

  const [
    user,
    yearTransactions,
    uncategorizedCount,
    documentCount,
    fixedCostCount,
    jobcenterReadyCount,
    dailyCloseCount,
    taxReserves,
    overduePayablesCount,
    overdueReceivablesCount,
  ] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { taxType: true },
    }),

    db.transaction.findMany({
      where: { userId, transactionDate: { gte: yearStart, lt: yearEnd } },
      select: { transactionDate: true, categoryId: true },
    }),

    db.transaction.count({
      where: { userId, categoryId: null, transactionDate: { gte: yearStart, lt: yearEnd } },
    }),

    db.document.count({
      where: { userId, status: { in: ['PROCESSED', 'DONE'] } },
    }),

    db.fixedCost.count({ where: { userId, isActive: true } }),

    db.jobcenterRecord.count({
      where: { userId, status: { in: ['READY', 'SUBMITTED'] } },
    }),

    db.dailyClose.count({ where: { userId } }),

    db.taxReserve.findMany({
      where: { userId },
      select: { missing: true },
    }),

    db.payable.count({
      where: {
        userId,
        status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: now },
      },
    }),

    db.receivable.count({
      where: {
        userId,
        status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: now },
      },
    }),
  ])

  const monthsWithTransactions = [
    ...new Set(yearTransactions.map(t => new Date(t.transactionDate).getMonth() + 1)),
  ].sort((a, b) => a - b)

  const taxMissing = taxReserves.reduce((sum, r) => sum + Number(r.missing), 0)

  const hasCompletedReports = jobcenterReadyCount > 0 || dailyCloseCount >= 3

  return {
    taxType: user?.taxType ?? 'KLEINUNTERNEHMER',
    monthsWithTransactions,
    totalTransactionCount: yearTransactions.length,
    hasUploadedDocuments: documentCount > 0,
    uploadedDocumentCount: documentCount,
    uncategorizedCount,
    hasFixedCosts: fixedCostCount > 0,
    hasCompletedReports,
    overduePayablesCount,
    overdueReceivablesCount,
    taxMissing,
  }
}
