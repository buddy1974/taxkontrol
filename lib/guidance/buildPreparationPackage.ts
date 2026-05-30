import { db } from '@/lib/db'
import { buildUserContext } from './buildUserContext'
import { computeConfidence } from './confidence'
import { detectMissingData } from './missingData'
import { computePreparationScore } from './preparationScore'
import { getOpenIssues } from './openIssues'
import type { PreparationPackage } from './guidanceTypes'

function buildSteuerberaterQuestions(
  taxType: string,
  missingItems: string[],
  uncategorizedCount: number,
  overduePayablesCount: number
): string[] {
  const questions: string[] = [
    'What documents do I need to bring for my tax filing this year?',
    'Is my current tax reserve estimate realistic for my situation?',
  ]

  if (taxType === 'KLEINUNTERNEHMER') {
    questions.push('Am I still within the Kleinunternehmer revenue limit, or should I switch to Regelbesteuerung?')
  }

  if (taxType === 'REGELBESTEUERUNG') {
    questions.push('Are my Vorsteuer deductions complete and correctly categorized?')
    questions.push('Do I need to submit quarterly VAT returns, or is monthly required?')
  }

  if (missingItems.length > 0) {
    questions.push('How should I handle periods where I have incomplete transaction records?')
  }

  if (uncategorizedCount > 0) {
    questions.push('Can you help me categorize transactions I was unsure about?')
  }

  if (overduePayablesCount > 0) {
    questions.push('Are my outstanding supplier payments deductible in the correct tax period?')
  }

  questions.push('Do I need to make any advance tax payments (Vorauszahlungen) this year?')
  questions.push('What is the best way to separate business and private expenses going forward?')

  return questions
}

export async function buildPreparationPackage(userId: string): Promise<PreparationPackage> {
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)

  const [userCtx, documents, txStats, openIssues] = await Promise.all([
    buildUserContext(userId),

    db.document.findMany({
      where: { userId, status: { in: ['PROCESSED', 'DONE'] } },
      select: { id: true, fileName: true, status: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),

    db.transaction.aggregate({
      where: { userId, transactionDate: { gte: yearStart, lt: yearEnd } },
      _count: { id: true },
    }),

    getOpenIssues(userId),
  ])

  const confidence = computeConfidence(userCtx, currentMonth)
  const missingData = detectMissingData(userCtx, currentMonth)
  const prep = computePreparationScore(userCtx, currentMonth)

  const totalTx = txStats._count.id
  const categorizedTransactions = Math.max(0, totalTx - userCtx.uncategorizedCount)

  const questions = buildSteuerberaterQuestions(
    userCtx.taxType,
    prep.missingItems,
    userCtx.uncategorizedCount,
    userCtx.overduePayablesCount
  )

  return {
    uploadedDocuments: documents,
    missingDocuments: missingData.map(d => d.description),
    categorizedTransactions,
    uncategorizedTransactions: userCtx.uncategorizedCount,
    unresolvedIssues: openIssues,
    preparationScore: prep.score,
    confidenceLevel: confidence.level,
    suggestedQuestionsForSteuerberater: questions,
  }
}
