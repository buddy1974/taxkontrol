export type FinanzamtLetterType =
  | 'DOCUMENT_REQUEST'
  | 'PAYMENT_REMINDER'
  | 'TAX_ESTIMATE'
  | 'MISSING_DECLARATION'
  | 'DEADLINE_NOTICE'
  | 'UNKNOWN'

export interface ReadinessCheckItem {
  key: string
  label: string
  ready: boolean
  note?: string
}

export interface ReadinessChecklist {
  letterType: string
  items: ReadinessCheckItem[]
  readyCount: number
  totalCount: number
  score: number // 0–100
  urgencyLevel: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  steuerberaterRequired: boolean
}

export interface DocumentRequirement {
  name: string
  description: string
  available: boolean
  where?: string
}

export interface ResponsePreparation {
  whatToGather: string[]
  whatToReview: string[]
  whatToAsk: string[]
  doNotDo: string[]
}

export interface DeadlineRisk {
  daysRemaining: number | null
  level: 'EXPIRED' | 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'
  label: string
  action: string
}

export interface ReadinessSummary {
  plainLanguageSummary: string
  whatFinanzamtWants: string
  whyItMatters: string
  recordsTaxKontrolFound: string[]
  missingRecords: string[]
  suggestedDocuments: string[]
  suggestedQuestionsForSteuerberater: string[]
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW'
  disclaimer: string
}
