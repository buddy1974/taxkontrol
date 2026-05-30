import { db } from '@/lib/db'
import type { ExtendedUserContext } from '@/lib/guidance/guidanceTypes'
import type { ReadinessSummary } from './finanzamtTypes'
import { mapLetterTypeToDocuments } from './documentRequestMapper'

const WHAT_WANTS: Record<string, string> = {
  DOCUMENT_REQUEST: 'The Finanzamt is requesting specific documents to verify your tax records. This is usually a routine Belegprüfung (document check).',
  REQUEST_DOCUMENTS: 'The Finanzamt is requesting specific documents to verify your tax records. This is usually a routine Belegprüfung (document check).',
  PAYMENT_REMINDER: 'The Finanzamt believes you owe a specific amount and is asking you to pay it. This may be from a previous tax assessment.',
  TAX_ESTIMATE: 'Because no tax declaration was filed, the Finanzamt has estimated your tax liability (Schätzung). Their estimate is usually higher than the actual amount.',
  MISSING_DECLARATION: 'The Finanzamt has noted that a required tax declaration has not been submitted. Filing it — even late — can reduce or avoid penalties.',
  DEADLINE_NOTICE: 'The Finanzamt has set a deadline by which you must respond or take a specific action.',
  UNKNOWN: 'The purpose of this letter could not be determined automatically. Please review it carefully with a Steuerberater.',
}

const WHY_MATTERS: Record<string, string> = {
  DOCUMENT_REQUEST: 'If you do not respond to a document request, the Finanzamt may estimate your taxes (Schätzung), which is almost always higher than your actual liability.',
  REQUEST_DOCUMENTS: 'If you do not respond to a document request, the Finanzamt may estimate your taxes (Schätzung), which is almost always higher than your actual liability.',
  PAYMENT_REMINDER: 'Unpaid tax amounts collect a surcharge (Säumniszuschlag) of 1% per month after a short grace period. Acting promptly avoids this extra cost.',
  TAX_ESTIMATE: 'An unchallenged tax estimate becomes legally binding. Filing your actual tax return can replace the estimate — the sooner you file, the better your outcome.',
  MISSING_DECLARATION: 'Late filings can trigger penalties of up to 10% of tax owed (Verspätungszuschlag). Filing voluntarily now is significantly better than waiting for enforcement.',
  DEADLINE_NOTICE: 'Missing a Finanzamt deadline can trigger automatic penalties, estimates, or enforcement action. Always respond before the deadline.',
  UNKNOWN: 'All official letters from the Finanzamt are legally significant. Never ignore them, even if the content is unclear.',
}

function buildSteuerberaterQuestions(letterType: string | null, missingRecords: string[]): string[] {
  const type = letterType ?? 'UNKNOWN'
  const questions: string[] = [
    'Have you seen this type of letter before? What is the most likely reason they sent it?',
    'What is the best way to respond, and what should I include?',
  ]

  if (type === 'TAX_ESTIMATE') {
    questions.push('Can you file my actual tax return to replace the Finanzamt estimate?')
    questions.push('Is there still time to challenge the Schätzung?')
  }
  if (type === 'MISSING_DECLARATION') {
    questions.push('Can you file the missing declaration on my behalf?')
    questions.push('Is it possible to reduce penalties by filing voluntarily now?')
  }
  if (type === 'PAYMENT_REMINDER') {
    questions.push('Is the amount in this letter correct based on my records?')
    questions.push('Can I arrange a payment plan (Ratenzahlung) if needed?')
  }
  if (type === 'DOCUMENT_REQUEST' || type === 'REQUEST_DOCUMENTS') {
    questions.push('Which documents do they actually need, and in what format?')
    questions.push('What happens if some receipts are missing or cannot be found?')
  }
  if (missingRecords.length > 0) {
    questions.push('How should I handle the periods where my records are incomplete?')
  }
  questions.push('Are there any upcoming deadlines or follow-up steps I should know about?')
  return questions
}

export function buildReadinessSummary(
  userCtx: ExtendedUserContext,
  caseInfo: {
    detectedLetterType: string | null
    latestDeadline: Date | null
    escalationRecommended: boolean
    confidenceLevel: string
  }
): ReadinessSummary {
  const type = caseInfo.detectedLetterType ?? 'UNKNOWN'

  // What TaxKontrol found
  const recordsFound: string[] = []
  if (userCtx.totalTransactionCount > 0)
    recordsFound.push(`${userCtx.totalTransactionCount} transaction(s) recorded this year`)
  if (userCtx.uploadedDocumentCount > 0)
    recordsFound.push(`${userCtx.uploadedDocumentCount} document(s) uploaded`)
  if (userCtx.hasFixedCosts)
    recordsFound.push('Fixed costs are defined')
  if (userCtx.monthsWithTransactions.length > 0)
    recordsFound.push(`Transactions cover ${userCtx.monthsWithTransactions.length} month(s) this year`)
  if (userCtx.hasCompletedReports)
    recordsFound.push('At least one completed income/expense report on file')
  if (recordsFound.length === 0)
    recordsFound.push('No records found yet — please add transactions and upload documents to get started')

  // Missing records
  const missingRecords: string[] = []
  if (userCtx.totalTransactionCount === 0)
    missingRecords.push('No transactions recorded — the Finanzamt expects income and expense records')
  if (!userCtx.hasUploadedDocuments)
    missingRecords.push('No documents uploaded — receipts and invoices are usually required')
  if (userCtx.uncategorizedCount > 0)
    missingRecords.push(`${userCtx.uncategorizedCount} transaction(s) missing a category`)
  if (userCtx.monthsWithTransactions.length < 3)
    missingRecords.push('Records cover fewer than 3 months — the Finanzamt may expect more complete annual data')
  if (!userCtx.hasFixedCosts)
    missingRecords.push('No fixed costs defined — regular business expenses should be recorded')
  if (userCtx.taxMissing > 0)
    missingRecords.push(`Tax reserve shortfall of €${userCtx.taxMissing.toFixed(2)} — review your tax reserve`)

  // Suggested documents not yet available
  const docRequirements = mapLetterTypeToDocuments(type, userCtx.hasUploadedDocuments, userCtx.totalTransactionCount > 0)
  const suggestedDocuments = docRequirements.filter(d => !d.available).map(d => d.name)

  const questions = buildSteuerberaterQuestions(type, missingRecords)

  const confLevel = caseInfo.confidenceLevel === 'HIGH' || caseInfo.confidenceLevel === 'MEDIUM'
    ? caseInfo.confidenceLevel as 'HIGH' | 'MEDIUM'
    : 'LOW'

  const hasMissing = missingRecords.length > 0
  const plainLanguageSummary = hasMissing
    ? `Your records have ${missingRecords.length} gap(s) that should be addressed before responding to this letter. Work through the items below before your deadline.`
    : `Your records look reasonably complete for this situation. Review the checklist, complete any outstanding items, and consider contacting a Steuerberater before you respond.`

  return {
    plainLanguageSummary,
    whatFinanzamtWants: WHAT_WANTS[type] ?? WHAT_WANTS['UNKNOWN'],
    whyItMatters: WHY_MATTERS[type] ?? WHY_MATTERS['UNKNOWN'],
    recordsTaxKontrolFound: recordsFound,
    missingRecords,
    suggestedDocuments,
    suggestedQuestionsForSteuerberater: questions,
    confidenceLevel: confLevel,
    disclaimer: 'TaxKontrol does not provide legal or tax advice. This summary is for preparation purposes only. Always confirm with a qualified Steuerberater before responding to the Finanzamt.',
  }
}

export async function createReadinessTasks(
  userId: string,
  missingRecords: string[],
  caseId?: string
): Promise<void> {
  type TaskCategory = 'ADD_TRANSACTION' | 'UPLOAD_DOCUMENT' | 'CATEGORIZE_EXPENSE' | 'REVIEW_REPORT' | 'CONTACT_STEUERBERATER' | 'COMPLETE_PROFILE' | 'RESOLVE_CASE' | 'OTHER'
  type TaskPriority = 'HIGH' | 'MEDIUM' | 'LOW' | 'CRITICAL'

  const tasks: Array<{
    key: string; title: string; description: string
    category: TaskCategory; priority: TaskPriority; section: string
  }> = []

  const suffix = caseId ? `-${caseId.slice(0, 8)}` : '-general'

  if (missingRecords.some(r => r.includes('No transactions'))) {
    tasks.push({
      key: `readiness-add-transactions${suffix}`,
      title: 'Record your income and expenses',
      description: 'The Finanzamt expects complete records. Add all missing income and expense transactions.',
      category: 'ADD_TRANSACTION', priority: 'HIGH', section: '/input',
    })
  }

  if (missingRecords.some(r => r.includes('No documents'))) {
    tasks.push({
      key: `readiness-upload-documents${suffix}`,
      title: 'Upload receipts and invoices',
      description: 'Receipts, invoices, and bank statements strengthen your records when responding to the Finanzamt.',
      category: 'UPLOAD_DOCUMENT', priority: 'HIGH', section: '/input',
    })
  }

  if (missingRecords.some(r => r.includes('missing a category'))) {
    tasks.push({
      key: `readiness-categorize${suffix}`,
      title: 'Categorize uncategorized expenses',
      description: 'Some transactions are missing a category. Categorizing them makes your records complete.',
      category: 'CATEGORIZE_EXPENSE', priority: 'MEDIUM', section: '/transactions',
    })
  }

  if (missingRecords.some(r => r.includes('No fixed costs'))) {
    tasks.push({
      key: `readiness-fixed-costs${suffix}`,
      title: 'Add your regular fixed costs',
      description: 'Regular business expenses like rent and subscriptions should be recorded as fixed costs.',
      category: 'ADD_TRANSACTION', priority: 'MEDIUM', section: '/fixed-costs',
    })
  }

  if (missingRecords.some(r => r.includes('shortfall'))) {
    tasks.push({
      key: `readiness-tax-reserve${suffix}`,
      title: 'Review your tax reserve',
      description: 'Your estimated tax reserve has a shortfall. Review and top it up before your next deadline.',
      category: 'REVIEW_REPORT', priority: 'HIGH', section: '/tax',
    })
  }

  // Always create a Steuerberater task for Finanzamt cases
  tasks.push({
    key: `readiness-steuerberater${suffix}`,
    title: 'Contact a Steuerberater about this letter',
    description: 'Before responding to the Finanzamt, review the letter and your preparation with a qualified tax advisor.',
    category: 'CONTACT_STEUERBERATER', priority: 'HIGH', section: '/guidance',
  })

  for (const task of tasks) {
    await db.guidanceTask.upsert({
      where: { userId_taskKey: { userId, taskKey: task.key } },
      update: {},
      create: {
        userId,
        caseId: caseId ?? null,
        taskKey: task.key,
        title: task.title,
        description: task.description,
        status: 'OPEN',
        priority: task.priority,
        category: task.category,
        relatedSection: task.section,
      },
    })
  }
}
