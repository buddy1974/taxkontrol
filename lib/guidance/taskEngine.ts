import type {
  CaseSummary,
  ExtendedUserContext,
  MissingDataItem,
  PersonaContext,
  ProfileCompletenessResult,
  TaskCandidate,
} from './guidanceTypes'

const PRIORITY_ORDER: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }

export function generateTaskCandidates(
  userCtx: ExtendedUserContext,
  personaCtx: PersonaContext,
  missingData: MissingDataItem[],
  openCases: CaseSummary[],
  profileCompleteness: ProfileCompletenessResult
): TaskCandidate[] {
  const tasks: TaskCandidate[] = []
  const isSimple = personaCtx.guidanceMode === 'SIMPLE'
  const isAdvanced = personaCtx.guidanceMode === 'ADVANCED'
  const isOverwhelmed = personaCtx.profile?.organizationLevel === 'OVERWHELMED'
  const isCashHeavy = personaCtx.flags.likelyCashHeavy
  const irregularIncome = personaCtx.flags.irregularIncomeExpected
  const now = new Date()

  // Profile incomplete → complete profile task
  if (!profileCompleteness.isComplete) {
    tasks.push({
      taskKey: 'COMPLETE_PROFILE:none',
      category: 'COMPLETE_PROFILE',
      title: 'Complete your guidance profile',
      description: isSimple
        ? 'Answer a few quick questions about your business. This helps give you more accurate guidance.'
        : isAdvanced
        ? 'Complete persona profile to enable adaptive scoring and persona-aware analysis.'
        : 'Tell us a bit more about your business so guidance can be tailored to your specific situation.',
      priority: 'MEDIUM',
      relatedSection: '/guidance',
    })
  }

  // Escalated cases → contact Steuerberater (CRITICAL)
  for (const c of openCases.filter(c => c.status === 'ESCALATED')) {
    tasks.push({
      taskKey: `CONTACT_STEUERBERATER:${c.id}`,
      category: 'CONTACT_STEUERBERATER',
      title: isSimple
        ? 'Contact a tax advisor about this letter'
        : 'Consult a Steuerberater',
      description: isSimple
        ? `The letter in case "${c.title}" needs professional help. A tax advisor can respond on your behalf.`
        : isAdvanced
        ? `Case "${c.title}" is escalated — professional review required before responding to the Finanzamt.`
        : `The case "${c.title}" has been flagged for professional review. Contact a Steuerberater before responding.`,
      priority: 'CRITICAL',
      relatedSection: `/guidance/${c.id}`,
      caseId: c.id,
    })
  }

  // Cases with imminent deadlines → resolve case task
  for (const c of openCases.filter(c => c.latestDeadline && c.status !== 'RESOLVED')) {
    const diffDays = Math.ceil((c.latestDeadline!.getTime() - now.getTime()) / 86400000)
    if (diffDays > 0 && diffDays <= 7) {
      tasks.push({
        taskKey: `RESOLVE_CASE:${c.id}`,
        category: 'RESOLVE_CASE',
        title: isSimple
          ? 'Act on this letter before the deadline'
          : 'Resolve case before deadline',
        description: isSimple
          ? `The case "${c.title}" has a deadline in ${diffDays} day(s). Take action now to avoid problems.`
          : isAdvanced
          ? `Case "${c.title}": ${diffDays} day(s) until deadline. Complete required actions.`
          : `Case "${c.title}" has ${diffDays} day(s) until the deadline. Review the open tasks and complete any outstanding items.`,
        priority: diffDays <= 3 ? 'CRITICAL' : 'HIGH',
        relatedSection: `/guidance/${c.id}`,
        caseId: c.id,
      })
    }
  }

  // Missing months
  const missingMonths = missingData.filter(d => d.type === 'MISSING_MONTH')
  if (missingMonths.length > 0) {
    const periods = missingMonths.map(m => m.affectedPeriod).filter(Boolean).join(', ')
    const isIrregularAndFew = irregularIncome && missingMonths.length <= 2
    tasks.push({
      taskKey: 'ADD_TRANSACTION:none',
      category: 'ADD_TRANSACTION',
      title: isSimple
        ? 'Add your missing income and expenses'
        : 'Complete missing monthly records',
      description: isSimple
        ? isIrregularAndFew
          ? `Some months have no records. If you had any income or costs in ${periods}, add them when you can.`
          : `You are missing records for ${periods}. Add what you earned and spent during those months.`
        : isAdvanced
        ? `Missing data: ${periods}. Reduces confidence and preparation scores.`
        : isIrregularAndFew
        ? `${periods} have no records. Irregular income is normal for your business type — add any transactions you may have missed.`
        : `Transaction records are missing for ${periods}. Add your income and expenses for these periods.`,
      priority: isIrregularAndFew ? 'MEDIUM' : missingMonths.length >= 3 ? 'HIGH' : 'MEDIUM',
      relatedSection: '/input',
    })
  }

  // No receipts uploaded
  if (!userCtx.hasUploadedDocuments) {
    tasks.push({
      taskKey: 'UPLOAD_DOCUMENT:none',
      category: 'UPLOAD_DOCUMENT',
      title: isSimple
        ? 'Upload your receipts and invoices'
        : 'Upload supporting documents',
      description: isSimple
        ? isCashHeavy
          ? 'Take a photo of your cash receipts and upload them here. This keeps your records strong.'
          : 'Upload invoices or receipts for your expenses. These are needed to verify your records.'
        : isAdvanced
        ? 'No documents uploaded. Required to improve confidence and preparation scores.'
        : 'No supporting documents have been uploaded yet. Receipts and invoices are required to verify your business expenses.',
      priority: 'HIGH',
      relatedSection: '/input',
    })
  }

  // Uncategorized transactions
  if (userCtx.uncategorizedCount > 0) {
    tasks.push({
      taskKey: 'CATEGORIZE_EXPENSE:none',
      category: 'CATEGORIZE_EXPENSE',
      title: isSimple
        ? 'Sort out your uncategorized expenses'
        : 'Categorize uncategorized transactions',
      description: isSimple
        ? `${userCtx.uncategorizedCount} item(s) need to be sorted. This helps the system understand where your money goes.`
        : isAdvanced
        ? `${userCtx.uncategorizedCount} uncategorized transaction(s) reduce expense analysis accuracy.`
        : `${userCtx.uncategorizedCount} transaction(s) have no category. Review them in your transaction list.`,
      priority: userCtx.uncategorizedCount > 10 ? 'HIGH' : 'MEDIUM',
      relatedSection: '/transactions',
    })
  }

  // No completed reports
  if (!userCtx.hasCompletedReports) {
    tasks.push({
      taskKey: 'REVIEW_REPORT:none',
      category: 'REVIEW_REPORT',
      title: isSimple
        ? 'Check your income and expense summary'
        : 'Generate your EÜR report',
      description: isSimple
        ? 'Your income and expense summary has not been completed. Review it in the Reports section.'
        : isAdvanced
        ? 'No completed EÜR found. Required for Steuerberater filing and tax assessment.'
        : 'No completed financial report exists yet. A Steuerberater needs your EÜR to file taxes on your behalf.',
      priority: 'MEDIUM',
      relatedSection: '/reports',
    })
  }

  const sorted = tasks.sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3))

  // Overwhelmed users: cap at 3 tasks max, highest priority
  return isOverwhelmed ? sorted.slice(0, 3) : sorted
}
