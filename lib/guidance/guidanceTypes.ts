export type LetterType =
  | 'REQUEST_DOCUMENTS'
  | 'PAYMENT_REMINDER'
  | 'TAX_ESTIMATE'
  | 'MISSING_DECLARATION'
  | 'UNKNOWN'

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW'

export type UrgencyLevel = 'IMMEDIATE' | 'WITHIN_WEEK' | 'WITHIN_MONTH' | 'INFORMATIONAL'

export type PreparationStatus = 'POOR' | 'PARTIAL' | 'GOOD' | 'READY'

export type MissingDataType =
  | 'MISSING_MONTH'
  | 'NO_RECEIPTS'
  | 'UNCATEGORIZED_EXPENSES'
  | 'MISSING_BANK_STATEMENTS'
  | 'NO_FIXED_COSTS'
  | 'INCOMPLETE_REPORTS'

export interface ConfidenceScore {
  level: ConfidenceLevel
  score: number
  reasons: string[]
}

export interface MissingDataItem {
  type: MissingDataType
  description: string
  severity: 'blocking' | 'important' | 'minor'
  affectedPeriod?: string
}

export interface LetterAnalysisResult {
  summary: string
  detectedType: LetterType
  urgency: UrgencyLevel
  confidence: ConfidenceScore
  requestedDocuments: string[]
  missingData: MissingDataItem[]
  recommendedActions: string[]
  suggestedSections: string[]
  escalationRecommended: boolean
  disclaimer: string
}

export interface PreparationScoreResult {
  score: number
  status: PreparationStatus
  strengths: string[]
  missingItems: string[]
  estimatedPreparationSavingsHours: number
}

export interface UserContext {
  taxType: 'KLEINUNTERNEHMER' | 'REGELBESTEUERUNG' | 'PAUSCHALIERUNG'
  monthsWithTransactions: number[]
  totalTransactionCount: number
  hasUploadedDocuments: boolean
  uploadedDocumentCount: number
  uncategorizedCount: number
  hasFixedCosts: boolean
  hasCompletedReports: boolean
}

export interface DocumentMeta {
  id: string
  fileName: string
  status: string
  type: string
}

export interface HelperTextEntry {
  title: string
  explanation: string
  purpose: string
  whyItMatters: string
}

export interface SuggestedAction {
  title: string
  explanation: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  section?: string
}

export interface GuidanceAnalysisResponse {
  summary: string
  interpretedMeaning: string
  urgency: UrgencyLevel
  confidence: ConfidenceScore
  preparationStatus: PreparationScoreResult
  missingDocuments: string[]
  missingData: MissingDataItem[]
  suggestedActions: SuggestedAction[]
  suggestedSections: string[]
  estimatedReadiness: number
  escalationRecommended: boolean
  escalationReason?: string
  educationalNotice: string
  disclaimer: string
}

export interface ExtendedUserContext extends UserContext {
  overduePayablesCount: number
  overdueReceivablesCount: number
  taxMissing: number
}

export interface ExtractedDeadline {
  date: Date
  rawText: string
  confidence: 'HIGH' | 'MEDIUM' | 'LOW'
  urgencyBoost: boolean
}

export interface OpenIssue {
  id: string
  title: string
  description: string
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'
  category: 'DEADLINE' | 'MISSING_DATA' | 'UNRESOLVED_CASE' | 'OVERDUE_PAYMENT'
  dueDate?: Date
  caseId?: string
}

export interface PreparationPackage {
  uploadedDocuments: Array<{ id: string; fileName: string; status: string }>
  missingDocuments: string[]
  categorizedTransactions: number
  uncategorizedTransactions: number
  unresolvedIssues: OpenIssue[]
  preparationScore: number
  confidenceLevel: string
  suggestedQuestionsForSteuerberater: string[]
}

export interface CaseSummary {
  id: string
  title: string
  caseType: string
  status: string
  urgency: string
  confidenceLevel: string
  escalationRecommended: boolean
  summary: string
  detectedLetterType: string | null
  latestDeadline: Date | null
  openedAt: Date
  updatedAt: Date
  recentEvents: Array<{ eventType: string; title: string; createdAt: Date }>
}

export interface PreviousCaseContext {
  caseId: string
  title: string
  detectedLetterType: string | null
  status: string
  openedAt: Date
}

// ─── Persona types ────────────────────────────────────────────────────────────

export type BusinessType =
  | 'FREELANCER'
  | 'RESTAURANT'
  | 'CONSTRUCTION'
  | 'DRIVER'
  | 'RETAIL'
  | 'CREATIVE'
  | 'CONSULTANT'
  | 'OTHER'

export type PaymentStyle = 'CASH_HEAVY' | 'TRANSFER_HEAVY' | 'MIXED'

export type GuidanceComplexity = 'SIMPLE' | 'STANDARD' | 'ADVANCED'

export type BureaucracyConfidence = 'LOW' | 'MEDIUM' | 'HIGH'

export type OrganizationLevel = 'OVERWHELMED' | 'IMPROVING' | 'ORGANIZED'

export interface PersonaProfile {
  businessType: BusinessType
  industryCategory?: string | null
  businessDescription?: string | null
  employeeCount: number
  paymentStyle: PaymentStyle
  cashPercentage?: number | null
  invoicePercentage?: number | null
  transferPercentage?: number | null
  operatingDaysPerWeek?: number | null
  averageMonthlyRevenue?: number | null
  averageMonthlyExpenses?: number | null
  seasonalBusiness: boolean
  highSeasonMonths?: string | null
  lowSeasonMonths?: string | null
  guidanceComplexity: GuidanceComplexity
  bureaucracyConfidence: BureaucracyConfidence
  organizationLevel: OrganizationLevel
}

export interface AdaptiveFlags {
  needsSimplifiedGuidance: boolean
  highAnxietyRisk: boolean
  likelyCashHeavy: boolean
  irregularIncomeExpected: boolean
  needsExtraPreparationHelp: boolean
}

export interface PersonaContext {
  profile: PersonaProfile | null
  flags: AdaptiveFlags
  guidanceMode: GuidanceComplexity
  confidenceLabel: string
  organizationLabel: string
  businessLabel: string
}

export interface ProfileCompletenessResult {
  completionPercent: number
  missingFields: string[]
  guidanceQualityImpact: string
  isComplete: boolean
}

// ─── Task types ──────────────────────────────────────────────────────────────

export type GuidanceTaskStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'DISMISSED'
export type GuidanceTaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type GuidanceTaskCategory =
  | 'UPLOAD_DOCUMENT'
  | 'ADD_TRANSACTION'
  | 'CATEGORIZE_EXPENSE'
  | 'COMPLETE_PROFILE'
  | 'REVIEW_REPORT'
  | 'CONTACT_STEUERBERATER'
  | 'RESOLVE_CASE'
  | 'OTHER'

export interface TaskCandidate {
  taskKey: string
  category: GuidanceTaskCategory
  title: string
  description: string
  priority: GuidanceTaskPriority
  relatedSection?: string
  caseId?: string
}

export interface StoredTask {
  id: string
  taskKey: string
  category: GuidanceTaskCategory
  title: string
  description: string
  status: GuidanceTaskStatus
  priority: GuidanceTaskPriority
  relatedSection?: string | null
  caseId?: string | null
  completedAt?: Date | null
  createdAt: Date
}

export interface BusinessRhythmInsight {
  expectedDailyActivity: boolean
  irregularIncomeNormal: boolean
  monthlyBurstExpected: boolean
  anomalyNote?: string
  rhythmSummary: string
}
