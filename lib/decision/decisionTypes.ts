export type DecisionType = 'SPEND' | 'WITHDRAW' | 'BUY_EQUIPMENT' | 'PAY_SUPPLIER' | 'HIRE_HELP' | 'OTHER'
export type ResultLevel = 'SAFE' | 'CAUTION' | 'NOT_RECOMMENDED' | 'INSUFFICIENT_DATA'
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export interface DecisionInput {
  amount: number
  purpose: string
  note?: string
  decisionType: DecisionType
}

export interface ObligationItem {
  label: string
  amount: number
  type: 'TAX' | 'FIXED_COST' | 'PAYABLE' | 'SALARY'
  dueDate?: string
}

export interface RiskSignal {
  code: string
  label: string
  severity: 'HIGH' | 'MEDIUM' | 'LOW'
  description: string
}

export interface PersonaSummary {
  businessType: string
  organizationLevel: string
  bureaucracyConfidence: string
}

export interface DecisionContext {
  userId: string
  taxType: string
  currentMonthIncome: number
  currentMonthExpenses: number
  totalFixedCosts: number
  taxOwed: number
  taxReserved: number
  totalPayables: number
  totalSalaries: number
  safeToSpend: number
  monthsWithData: number
  totalTransactions: number
  hasProfile: boolean
  openCaseCount: number
  openCaseEscalated: boolean
  persona: PersonaSummary | null
}

export interface DecisionResult {
  resultLevel: ResultLevel
  confidenceLevel: ConfidenceLevel
  summary: string
  reasons: string[]
  missingData: string[]
  obligations: ObligationItem[]
  riskSignals: RiskSignal[]
  nextStep: string
  disclaimer: string
  safeToSpend: number
  whatIfRemaining: number
}

export interface SavedEvaluation {
  id: string
  decisionType: string
  amount: number
  purpose: string
  note?: string | null
  resultLevel: string
  confidenceLevel: string
  summary: string
  reasons: string[]
  missingData?: unknown
  obligations?: unknown
  riskSignals?: unknown
  createdAt: string
}
