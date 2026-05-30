import { db } from '@/lib/db'
import type { ObligationItem } from './decisionTypes'

export async function buildObligationForecast(
  userId: string,
  taxOwed: number,
  taxReserved: number,
  totalFixedCosts: number,
  totalSalaries: number
): Promise<ObligationItem[]> {
  const obligations: ObligationItem[] = []

  const taxShortfall = Math.max(0, taxOwed - taxReserved)
  if (taxShortfall > 0) {
    obligations.push({
      label: 'Estimated tax reserve shortfall (Steuerruecklage)',
      amount: taxShortfall,
      type: 'TAX',
    })
  }

  if (totalFixedCosts > 0) {
    obligations.push({
      label: 'Monthly fixed costs (rent, subscriptions, etc.)',
      amount: totalFixedCosts,
      type: 'FIXED_COST',
    })
  }

  if (totalSalaries > 0) {
    obligations.push({
      label: 'Monthly salary obligations',
      amount: totalSalaries,
      type: 'SALARY',
    })
  }

  const upcomingPayables = await db.payable.findMany({
    where: { userId, status: { in: ['OPEN', 'PARTIAL'] } },
    select: { supplierName: true, outstandingAmount: true, dueDate: true },
    orderBy: { dueDate: 'asc' },
    take: 5,
  })

  for (const p of upcomingPayables as Array<{
    supplierName: string
    outstandingAmount: unknown
    dueDate: Date | null
  }>) {
    obligations.push({
      label: `${p.supplierName} — outstanding payment`,
      amount: Number(p.outstandingAmount),
      type: 'PAYABLE',
      dueDate: p.dueDate ? p.dueDate.toISOString().split('T')[0] : undefined,
    })
  }

  return obligations
}
