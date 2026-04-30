export type WarningType =
  | 'LOW_TAX_RESERVE'
  | 'MISSING_RECEIPTS'
  | 'UNUSUAL_SPENDING'
  | 'JOBCENTER_THRESHOLD'
  | 'CASH_MISMATCH'
  | 'OVERDUE_RECEIVABLE'
  | 'OVERDUE_PAYABLE'
  | 'NO_TRANSACTIONS'

export type Warning = {
  id: string
  type: WarningType
  severity: 'low' | 'medium' | 'high'
  message: string
}

export function buildWarnings({
  taxMissing,
  overdueReceivablesCount,
  overdueReceivablesTotal,
  overduePayablesCount,
  overduePayablesTotal,
  transactionCount,
  cashDiff,
}: {
  taxMissing: number
  overdueReceivablesCount: number
  overdueReceivablesTotal: number
  overduePayablesCount: number
  overduePayablesTotal: number
  transactionCount: number
  cashDiff?: number
}): Warning[] {
  const warnings: Warning[] = []

  if (taxMissing > 0) {
    warnings.push({
      id: 'low-tax-reserve',
      type: 'LOW_TAX_RESERVE',
      severity: taxMissing > 500 ? 'high' : 'medium',
      message: `You are missing €${taxMissing.toFixed(2)} in your tax reserve (Steuerrücklage).`,
    })
  }

  if (overdueReceivablesCount > 0) {
    warnings.push({
      id: 'overdue-receivable',
      type: 'OVERDUE_RECEIVABLE',
      severity: 'medium',
      message: `${overdueReceivablesCount} customer(s) owe you €${overdueReceivablesTotal.toFixed(2)} past due date.`,
    })
  }

  if (overduePayablesCount > 0) {
    warnings.push({
      id: 'overdue-payable',
      type: 'OVERDUE_PAYABLE',
      severity: 'high',
      message: `You owe €${overduePayablesTotal.toFixed(2)} to supplier(s) past due date.`,
    })
  }

  if (transactionCount === 0) {
    warnings.push({
      id: 'no-transactions',
      type: 'NO_TRANSACTIONS',
      severity: 'low',
      message: 'No transactions recorded this month. Have you added all your income and expenses?',
    })
  }

  if (cashDiff !== undefined && Math.abs(cashDiff) > 0.01) {
    warnings.push({
      id: 'cash-mismatch',
      type: 'CASH_MISMATCH',
      severity: 'high',
      message: `Cash mismatch of €${Math.abs(cashDiff).toFixed(2)} detected. Check your daily close records.`,
    })
  }

  return warnings
}
