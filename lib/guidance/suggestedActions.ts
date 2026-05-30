import type { ExtendedUserContext, MissingDataItem, PersonaContext, SuggestedAction } from './guidanceTypes'
import { adaptGuidanceText } from './personaContext'

export function buildSuggestedActions(
  ctx: ExtendedUserContext,
  missingData: MissingDataItem[],
  letterType?: string,
  personaCtx?: PersonaContext
): SuggestedAction[] {
  const actions: SuggestedAction[] = []

  const missingMonths = missingData.filter(d => d.type === 'MISSING_MONTH')
  if (missingMonths.length > 0) {
    const periods = missingMonths.map(m => m.affectedPeriod).filter(Boolean).join(', ')
    const irregularOk = personaCtx?.flags.irregularIncomeExpected && missingMonths.length <= 2
    actions.push({
      title: 'Complete missing monthly records',
      explanation: adaptGuidanceText(
        `Transaction records are missing for ${periods}. Add all income and expenses for these months so your records are complete.`,
        personaCtx ?? null,
        {
          simplified: irregularOk
            ? `Some months have no records. If you had any income or costs in ${periods}, add them when you can.`
            : `You are missing records for ${periods}. Add what you earned and spent during those months.`,
          advanced: `Missing data for: ${periods}. This reduces confidence and preparation scores.`,
        }
      ),
      priority: irregularOk ? 'MEDIUM' : 'HIGH',
      section: '/input',
    })
  }

  if (missingData.some(d => d.type === 'NO_RECEIPTS')) {
    const cashHeavy = personaCtx?.flags.likelyCashHeavy
    actions.push({
      title: 'Upload receipts and invoices',
      explanation: adaptGuidanceText(
        'No supporting documents have been uploaded yet. A Steuerberater needs receipts and invoices to verify your expenses.',
        personaCtx ?? null,
        {
          simplified: cashHeavy
            ? 'Take a photo of your cash receipts and upload them. This keeps your records strong.'
            : 'Upload invoices or receipts for your expenses. These are needed to verify your records.',
          advanced: 'No documents uploaded. Required for confidence scoring and Steuerberater review.',
        }
      ),
      priority: 'HIGH',
      section: '/input',
    })
  }

  if (missingData.some(d => d.type === 'UNCATEGORIZED_EXPENSES')) {
    actions.push({
      title: 'Categorize uncategorized transactions',
      explanation: adaptGuidanceText(
        'Some transactions have no category assigned. Review them in your transaction list — uncategorized items cannot be assessed.',
        personaCtx ?? null,
        {
          simplified: 'Some of your expenses are unsorted. Review them so the system can understand your spending.',
          advanced: 'Uncategorized transactions reduce expense analysis accuracy and preparation score.',
        }
      ),
      priority: 'MEDIUM',
      section: '/transactions',
    })
  }

  if (missingData.some(d => d.type === 'INCOMPLETE_REPORTS')) {
    actions.push({
      title: 'Generate your EÜR report',
      explanation: adaptGuidanceText(
        'Your profit and loss report (EÜR) has not been completed. This is required before a Steuerberater can file on your behalf.',
        personaCtx ?? null,
        {
          simplified: 'Your income and expense summary has not been completed. Check the Reports section.',
          advanced: 'No completed EÜR found. Required for Steuerberater filing.',
        }
      ),
      priority: 'HIGH',
      section: '/reports',
    })
  }

  if (missingData.some(d => d.type === 'NO_FIXED_COSTS')) {
    actions.push({
      title: 'Configure your fixed costs',
      explanation: adaptGuidanceText(
        'Regular monthly costs like rent or subscriptions are not set up. These affect how your financial overview is calculated.',
        personaCtx ?? null,
        {
          simplified: 'You have not added your regular monthly costs yet. This helps estimate your real expenses.',
          advanced: 'Fixed costs not configured — monthly obligation baseline is missing from calculations.',
        }
      ),
      priority: 'MEDIUM',
      section: '/fixed-costs',
    })
  }

  if (ctx.overduePayablesCount > 0) {
    actions.push({
      title: 'Review overdue supplier payments',
      explanation: `You have ${ctx.overduePayablesCount} supplier payment(s) past their due date. Addressing these avoids late fees and supplier disputes.`,
      priority: 'HIGH',
      section: '/suppliers',
    })
  }

  if (ctx.taxMissing > 50) {
    actions.push({
      title: 'Review your tax reserve',
      explanation: adaptGuidanceText(
        'Your tax reserve appears to be below the estimated target. Check how much you may need to set aside before the next tax period.',
        personaCtx ?? null,
        {
          simplified: 'You may not have enough saved for taxes. Check your tax reserve balance.',
          advanced: `Tax reserve deficit detected. Review reserve balance and adjust allocation.`,
        }
      ),
      priority: 'MEDIUM',
      section: '/tax',
    })
  }

  if (letterType === 'PAYMENT_REMINDER' || letterType === 'TAX_ESTIMATE') {
    actions.push({
      title: 'Consult a Steuerberater before responding',
      explanation: adaptGuidanceText(
        'This type of letter involves a financial obligation. A Steuerberater can help you respond correctly and avoid additional penalties.',
        personaCtx ?? null,
        {
          simplified: 'This letter is about money you may owe. A tax advisor can help you respond correctly.',
          advanced: 'Financial obligation letter — Steuerberater response recommended before any Finanzamt contact.',
        }
      ),
      priority: 'HIGH',
    })
  }

  if (letterType === 'MISSING_DECLARATION') {
    actions.push({
      title: 'File the missing tax declaration',
      explanation: adaptGuidanceText(
        'Submit the overdue declaration as soon as possible. Delays increase the risk of penalties. A Steuerberater can do this on your behalf.',
        personaCtx ?? null,
        {
          simplified: 'A tax form was not submitted on time. A tax advisor can file it for you to reduce penalties.',
          advanced: 'Missing declaration: escalating penalties accrue. File immediately or via Steuerberater.',
        }
      ),
      priority: 'HIGH',
    })
  }

  return actions
}
