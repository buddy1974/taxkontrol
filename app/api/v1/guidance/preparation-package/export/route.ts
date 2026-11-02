import { requireFeature } from '@/lib/entitlements'
import { logError } from '@/lib/log'
import { EntitlementFeature } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { buildPreparationPackage } from '@/lib/guidance/buildPreparationPackage'
import { buildUserContext } from '@/lib/guidance/buildUserContext'
import { computeConfidence } from '@/lib/guidance/confidence'
import { summarizeTransactions } from '@/lib/finance/summary'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { fromCents } from '@/lib/finance/money'
import { berlinDate, berlinYearRange, endOfBerlinToday } from '@/lib/time/berlin'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gate = await requireFeature(user.id, EntitlementFeature.PREPARATION)
  if (gate) return gate

  try {
    const now = new Date()
    const today = berlinDate(now)
    const { start: yearStart, end: yearEnd } = berlinYearRange(today.year)
    const currentMonth = today.month

    const [pkg, userRecord, yearRows, userCtx] = await Promise.all([
      buildPreparationPackage(user.id),

      db.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, businessName: true, taxType: true, taxId: true, vatId: true },
      }),

      db.transaction.findMany({
        where: { userId: user.id, transactionDate: { gte: yearStart, lt: new Date(Math.min(yearEnd.getTime(), endOfBerlinToday(now).getTime())) } },
        select: {
          type: true, grossAmount: true, vatRate: true, usage: true, businessPct: true,
          transactionDate: true, needsReview: true, taxPaymentType: true, taxPeriodStart: true,
        },
      }),

      buildUserContext(user.id),
    ])

    const confidence = computeConfidence(userCtx, currentMonth)
    // Same maths as every other screen (lib/finance): only business income is income,
    // private deposits/loans and unclear money are not, tax payments are not expenses.
    const timeline = await loadTaxStatusTimeline(user.id)
    const totals = summarizeTransactions(yearRows, timeline)

    const exportPackage = {
      meta: {
        generatedAt: now.toISOString(),
        reportingYear: today.year,
        reportingPeriod: `${yearStart.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })} – ${now.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`,
        disclaimer: [
          'This document is for preparation purposes only.',
          'It is NOT a tax declaration, legal document, or official submission.',
          'Use this to prepare for your Steuerberater appointment.',
          'Organized records may reduce time spent sorting documents with your Steuerberater.',
          'Always confirm all figures and filings with a qualified Steuerberater.',
          'TaxKontrol does not provide legal or tax advice.',
        ].join(' '),
      },

      userProfile: {
        name: userRecord?.name ?? user.name ?? 'Unknown',
        email: user.email,
        businessName: userRecord?.businessName ?? null,
        taxType: timeline.statusAt(now).taxType,
        taxId: userRecord?.taxId ?? null,
        vatId: userRecord?.vatId ?? null,
      },

      financialSummary: {
        year: today.year,
        isEstimate: true,
        totalIncome: fromCents(totals.businessIncomeNetCents),
        totalExpenses: fromCents(totals.deductibleExpenseCents),
        netProfit: fromCents(totals.profitCents),
        notCountedPrivateOrLoans: fromCents(totals.nonBusinessInflowCents),
        unclearNotCounted: fromCents(totals.unclearInflowCents + totals.unclearOutflowCents),
        vatPaidToFinanzamt: fromCents(totals.vatPaidToFinanzamtCents),
        incomeTaxPaid: fromCents(totals.incomeTaxPaidCents),
        incomeTransactionCount: yearRows.filter(r => r.type === 'INCOME').length,
        expenseTransactionCount: yearRows.filter(r => r.type === 'EXPENSE').length,
      },

      uploadedDocuments: pkg.uploadedDocuments,
      missingDocuments: pkg.missingDocuments,
      categorizedTransactions: pkg.categorizedTransactions,
      uncategorizedTransactions: pkg.uncategorizedTransactions,

      unresolvedIssues: pkg.unresolvedIssues.map(i => ({
        title: i.title,
        description: i.description,
        priority: i.priority,
        category: i.category,
        dueDate: i.dueDate?.toISOString() ?? null,
      })),

      preparationScore: pkg.preparationScore,
      confidenceLevel: confidence.level,
      confidenceScore: confidence.score,

      suggestedQuestionsForSteuerberater: pkg.suggestedQuestionsForSteuerberater,
    }

    return NextResponse.json(exportPackage, { status: 200 })
  } catch (err) {
    logError('Preparation package export error', err)
    return NextResponse.json({ error: 'Could not generate export package' }, { status: 500 })
  }
}
