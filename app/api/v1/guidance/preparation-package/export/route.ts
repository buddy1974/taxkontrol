import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { buildPreparationPackage } from '@/lib/guidance/buildPreparationPackage'
import { buildUserContext } from '@/lib/guidance/buildUserContext'
import { computeConfidence } from '@/lib/guidance/confidence'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const now = new Date()
    const yearStart = new Date(now.getFullYear(), 0, 1)
    const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
    const currentMonth = now.getMonth() + 1

    const [pkg, userRecord, txIncome, txExpenses, userCtx] = await Promise.all([
      buildPreparationPackage(user.id),

      db.user.findUnique({
        where: { id: user.id },
        select: { name: true, email: true, businessName: true, taxType: true, taxId: true, vatId: true },
      }),

      db.transaction.aggregate({
        where: { userId: user.id, type: 'INCOME', transactionDate: { gte: yearStart, lt: yearEnd } },
        _sum: { netAmount: true },
        _count: { id: true },
      }),

      db.transaction.aggregate({
        where: { userId: user.id, type: 'EXPENSE', transactionDate: { gte: yearStart, lt: yearEnd } },
        _sum: { businessAmount: true },
        _count: { id: true },
      }),

      buildUserContext(user.id),
    ])

    const confidence = computeConfidence(userCtx, currentMonth)

    const exportPackage = {
      meta: {
        generatedAt: now.toISOString(),
        reportingYear: now.getFullYear(),
        reportingPeriod: `${yearStart.toLocaleDateString('de-DE')} – ${now.toLocaleDateString('de-DE')}`,
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
        taxType: userRecord?.taxType ?? 'KLEINUNTERNEHMER',
        taxId: userRecord?.taxId ?? null,
        vatId: userRecord?.vatId ?? null,
      },

      financialSummary: {
        year: now.getFullYear(),
        totalIncome: Number(txIncome._sum.netAmount ?? 0),
        totalExpenses: Number(txExpenses._sum.businessAmount ?? 0),
        netProfit: Number(txIncome._sum.netAmount ?? 0) - Number(txExpenses._sum.businessAmount ?? 0),
        incomeTransactionCount: txIncome._count.id,
        expenseTransactionCount: txExpenses._count.id,
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
    console.error('Preparation package export error:', err)
    return NextResponse.json({ error: 'Could not generate export package' }, { status: 500 })
  }
}
