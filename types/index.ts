import type { User, Transaction, TaxReserve, Category } from '@prisma/client'

export type { User, Transaction, TaxReserve, Category }

export type TransactionWithCategory = Transaction & {
  category: Category | null
}

export type DashboardSummary = {
  totalIncome: number
  totalExpenses: number
  safeToSpend: number
  taxOwed: number
  taxReserved: number
  taxMissing: number
  fixedCostsTotal: number
  warnings: Warning[]
}

export type Warning = {
  id: string
  type: WarningType
  message: string
  severity: 'low' | 'medium' | 'high'
}

export type WarningType =
  | 'LOW_TAX_RESERVE'
  | 'MISSING_RECEIPTS'
  | 'UNUSUAL_SPENDING'
  | 'JOBCENTER_THRESHOLD'
  | 'CASH_MISMATCH'
  | 'OVERDUE_RECEIVABLE'
  | 'OVERDUE_PAYABLE'
