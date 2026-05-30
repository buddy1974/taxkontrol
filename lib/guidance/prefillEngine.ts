import { db } from '@/lib/db'
import type { PersonaProfile } from './guidanceTypes'

export interface RecurringExpenseCandidate {
  merchant: string
  amount: number
  occurrences: number
  suggestedName: string
  suggestedAsFixedCost: boolean
}

export interface PersonaSuggestion {
  type: 'DAILY_CLOSE' | 'RESERVE_PLANNING' | 'INVOICE_WORKFLOW' | 'RECEIPT_HABIT'
  title: string
  description: string
  route: string
}

// Detect transactions that look like recurring fixed costs (same merchant, same or very close amount, 3+ times)
export async function detectRecurringExpenses(
  userId: string
): Promise<RecurringExpenseCandidate[]> {
  const yearStart = new Date(new Date().getFullYear(), 0, 1)

  const transactions = await db.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      merchant: { not: null },
      transactionDate: { gte: yearStart },
    },
    select: {
      merchant: true,
      amount: true,
    },
  })

  // Group by merchant
  const grouped = new Map<string, number[]>()
  for (const t of transactions) {
    if (!t.merchant) continue
    const key = t.merchant.toLowerCase().trim()
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(Number(t.amount))
  }

  const candidates: RecurringExpenseCandidate[] = []

  for (const [key, amounts] of grouped) {
    if (amounts.length < 3) continue

    // Check if amounts are consistent (within 20% of median)
    const sorted = [...amounts].sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const consistent = amounts.every(a => Math.abs(a - median) / (median || 1) < 0.2)

    if (!consistent) continue

    // Look up existing fixed costs to avoid duplicates
    const existingFixedCost = await db.fixedCost.findFirst({
      where: {
        userId,
        name: { contains: key, mode: 'insensitive' },
        isActive: true,
      },
    })

    if (existingFixedCost) continue

    const merchant = transactions.find(
      t => t.merchant?.toLowerCase().trim() === key
    )?.merchant ?? key

    candidates.push({
      merchant,
      amount: Math.round(median * 100) / 100,
      occurrences: amounts.length,
      suggestedName: merchant,
      suggestedAsFixedCost: true,
    })
  }

  return candidates.slice(0, 3)
}

// Return persona-based workflow suggestions
export function buildPersonaSuggestions(profile: PersonaProfile | null): PersonaSuggestion[] {
  if (!profile) return []

  const suggestions: PersonaSuggestion[] = []

  if (profile.businessType === 'RESTAURANT' && !profile.operatingDaysPerWeek) {
    suggestions.push({
      type: 'DAILY_CLOSE',
      title: 'Set up daily close',
      description: 'Restaurants benefit from a quick end-of-day cash check. Takes about 2 minutes per day.',
      route: '/daily-close',
    })
  }

  if (
    profile.businessType === 'FREELANCER' ||
    profile.businessType === 'CONSULTANT'
  ) {
    suggestions.push({
      type: 'RESERVE_PLANNING',
      title: 'Review your tax reserve',
      description: 'Freelancers often underestimate their tax liability. Review your reserve to stay ahead.',
      route: '/tax',
    })
  }

  if (
    profile.businessType === 'CONSTRUCTION' ||
    profile.businessType === 'CONSULTANT'
  ) {
    suggestions.push({
      type: 'INVOICE_WORKFLOW',
      title: 'Add your outstanding invoices',
      description: 'Invoice-heavy businesses benefit from tracking receivables. Add your open invoices.',
      route: '/customers',
    })
  }

  if (profile.paymentStyle === 'CASH_HEAVY') {
    suggestions.push({
      type: 'RECEIPT_HABIT',
      title: 'Upload receipts after each cash sale',
      description: 'Uploading cash receipts regularly keeps your records complete and reduces missing-document problems later.',
      route: '/input',
    })
  }

  return suggestions
}
