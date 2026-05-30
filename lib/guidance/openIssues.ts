import { db } from '@/lib/db'
import type { OpenIssue } from './guidanceTypes'

export async function getOpenIssues(userId: string): Promise<OpenIssue[]> {
  const now = new Date()
  const yearStart = new Date(now.getFullYear(), 0, 1)
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1)
  const currentMonth = now.getMonth() + 1

  const [
    openCases,
    escalatedCases,
    uncategorizedCount,
    overduePayables,
    missingMonthData,
  ] = await Promise.all([
    db.guidanceCase.findMany({
      where: {
        userId,
        status: { in: ['OPEN', 'ACTION_REQUIRED', 'WAITING_FOR_DOCUMENTS'] },
      },
      select: {
        id: true,
        title: true,
        urgency: true,
        latestDeadline: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    }),

    db.guidanceCase.findMany({
      where: { userId, status: 'ESCALATED' },
      select: { id: true, title: true, summary: true },
    }),

    db.transaction.count({
      where: { userId, categoryId: null, transactionDate: { gte: yearStart, lt: yearEnd } },
    }),

    db.payable.findMany({
      where: {
        userId,
        status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] },
        dueDate: { lt: now },
      },
      select: { id: true, supplierName: true, outstandingAmount: true, dueDate: true },
    }),

    db.transaction.groupBy({
      by: ['transactionDate'],
      where: { userId, transactionDate: { gte: yearStart, lt: yearEnd } },
      _count: { id: true },
    }),
  ])

  const issues: OpenIssue[] = []

  // Unresolved cases with upcoming deadlines
  for (const c of openCases) {
    if (c.latestDeadline) {
      const diffDays = Math.ceil((c.latestDeadline.getTime() - now.getTime()) / 86400000)
      const expired = diffDays <= 0
      issues.push({
        id: `case-deadline-${c.id}`,
        title: expired
          ? `Deadline passed: ${c.title}`
          : `Upcoming deadline: ${c.title}`,
        description: expired
          ? `The deadline for this case has passed. Address this as soon as possible.`
          : `This case has a deadline in ${diffDays} day(s). Make sure to take action before then.`,
        priority: expired ? 'CRITICAL' : diffDays <= 7 ? 'HIGH' : 'MEDIUM',
        category: 'DEADLINE',
        dueDate: c.latestDeadline,
        caseId: c.id,
      })
    } else {
      issues.push({
        id: `case-open-${c.id}`,
        title: `Open case: ${c.title}`,
        description: 'This case has not been resolved. Review the suggested actions and upload any missing documents.',
        priority: c.urgency === 'IMMEDIATE' ? 'CRITICAL' : c.urgency === 'WITHIN_WEEK' ? 'HIGH' : 'MEDIUM',
        category: 'UNRESOLVED_CASE',
        caseId: c.id,
      })
    }
  }

  // Escalated cases
  for (const c of escalatedCases) {
    issues.push({
      id: `case-escalated-${c.id}`,
      title: `Escalated: ${c.title}`,
      description: 'This case has been flagged for professional review. Contact a Steuerberater before taking further action.',
      priority: 'HIGH',
      category: 'UNRESOLVED_CASE',
      caseId: c.id,
    })
  }

  // Missing months
  const monthsWithData = new Set(
    missingMonthData.map(row => new Date(row.transactionDate).getMonth() + 1)
  )
  const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const missingMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
    .filter(m => !monthsWithData.has(m))

  if (missingMonths.length > 0) {
    const periods = missingMonths.map(m => MONTH_NAMES[m - 1]).join(', ')
    issues.push({
      id: 'missing-months',
      title: 'Missing transaction months',
      description: `No transactions recorded for: ${periods}. These gaps weaken your records.`,
      priority: missingMonths.length >= 3 ? 'HIGH' : 'MEDIUM',
      category: 'MISSING_DATA',
    })
  }

  // Uncategorized transactions
  if (uncategorizedCount > 0) {
    issues.push({
      id: 'uncategorized',
      title: `${uncategorizedCount} uncategorized transaction(s)`,
      description: 'These transactions cannot be assessed without a category. Review them in your transaction list.',
      priority: uncategorizedCount > 10 ? 'HIGH' : 'MEDIUM',
      category: 'MISSING_DATA',
    })
  }

  // Overdue payables
  for (const p of overduePayables) {
    issues.push({
      id: `payable-${p.id}`,
      title: `Overdue payment: ${p.supplierName}`,
      description: `€${Number(p.outstandingAmount).toFixed(2)} owed to ${p.supplierName} is past the due date.`,
      priority: 'HIGH',
      category: 'OVERDUE_PAYMENT',
      dueDate: p.dueDate ?? undefined,
    })
  }

  // Sort: CRITICAL first, then HIGH, MEDIUM, LOW
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }
  return issues.sort((a, b) => order[a.priority] - order[b.priority])
}
