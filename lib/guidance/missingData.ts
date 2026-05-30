import type { MissingDataItem, UserContext } from './guidanceTypes'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function detectMissingData(
  ctx: UserContext,
  currentMonth: number
): MissingDataItem[] {
  const items: MissingDataItem[] = []

  const expectedMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
  const missingMonths = expectedMonths.filter(m => !ctx.monthsWithTransactions.includes(m))

  for (const m of missingMonths) {
    items.push({
      type: 'MISSING_MONTH',
      description: `No transactions recorded for ${MONTH_NAMES[m - 1]}. The Finanzamt may question gaps in your records.`,
      severity: 'blocking',
      affectedPeriod: MONTH_NAMES[m - 1],
    })
  }

  if (!ctx.hasUploadedDocuments || ctx.uploadedDocumentCount === 0) {
    items.push({
      type: 'NO_RECEIPTS',
      description: 'No receipts or invoices have been uploaded. Supporting documents are required to verify your expenses.',
      severity: 'important',
    })
  }

  if (ctx.uncategorizedCount > 0) {
    items.push({
      type: 'UNCATEGORIZED_EXPENSES',
      description: `${ctx.uncategorizedCount} transaction(s) are not categorized. Uncategorized items cannot be properly assessed.`,
      severity: 'important',
    })
  }

  if (!ctx.hasFixedCosts) {
    items.push({
      type: 'NO_FIXED_COSTS',
      description: 'Fixed costs are not configured. Your actual monthly obligations may be underestimated.',
      severity: 'minor',
    })
  }

  if (!ctx.hasCompletedReports) {
    items.push({
      type: 'INCOMPLETE_REPORTS',
      description: 'No completed EÜR report found. A Steuerberater will need this to file on your behalf.',
      severity: 'blocking',
    })
  }

  return items
}
