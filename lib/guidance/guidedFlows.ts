export type FlowType =
  | 'ADD_TRANSACTION'
  | 'UPLOAD_DOCUMENT'
  | 'FIX_COSTS'
  | 'COMPLETE_PROFILE'
  | 'REVIEW_REPORTS'
  | 'RESOLVE_CASE'
  | 'CATEGORIZE'
  | 'CONTACT_ADVISOR'

export interface GuidedFlow {
  taskKey: string
  route: string
  flowType: FlowType
  helperText: string
  estimatedMinutes: number
}

const FLOW_MAP: Record<string, Omit<GuidedFlow, 'taskKey'>> = {
  ADD_TRANSACTION: {
    route: '/input',
    flowType: 'ADD_TRANSACTION',
    helperText: 'Add your income and expenses one at a time. Every entry improves your records.',
    estimatedMinutes: 2,
  },
  UPLOAD_DOCUMENT: {
    route: '/input',
    flowType: 'UPLOAD_DOCUMENT',
    helperText: 'Upload a receipt or invoice photo. AI will read the details automatically.',
    estimatedMinutes: 2,
  },
  CATEGORIZE_EXPENSE: {
    route: '/transactions',
    flowType: 'CATEGORIZE',
    helperText: 'Review your uncategorized transactions and assign a category to each.',
    estimatedMinutes: 5,
  },
  COMPLETE_PROFILE: {
    route: '/guidance',
    flowType: 'COMPLETE_PROFILE',
    helperText: 'Answer a few short questions about your business to improve guidance accuracy.',
    estimatedMinutes: 3,
  },
  REVIEW_REPORT: {
    route: '/reports',
    flowType: 'REVIEW_REPORTS',
    helperText: 'Review your income and expense summary. This is what a Steuerberater will use.',
    estimatedMinutes: 5,
  },
  CONTACT_STEUERBERATER: {
    route: '/guidance',
    flowType: 'CONTACT_ADVISOR',
    helperText: 'This situation requires professional advice. Open the case and review escalation details.',
    estimatedMinutes: 10,
  },
  RESOLVE_CASE: {
    route: '/guidance',
    flowType: 'RESOLVE_CASE',
    helperText: 'Open the case, review the timeline and suggested actions, and mark it resolved when done.',
    estimatedMinutes: 10,
  },
  NO_FIXED_COSTS: {
    route: '/fixed-costs',
    flowType: 'FIX_COSTS',
    helperText: 'Add regular monthly expenses like rent or subscriptions. These improve your financial overview.',
    estimatedMinutes: 3,
  },
  OTHER: {
    route: '/guidance',
    flowType: 'COMPLETE_PROFILE',
    helperText: 'Review your guidance dashboard to see what needs attention.',
    estimatedMinutes: 5,
  },
}

export function getGuidedFlow(
  taskKey: string,
  category: string,
  caseId?: string | null
): GuidedFlow | null {
  const base = FLOW_MAP[category] ?? FLOW_MAP.OTHER
  if (!base) return null

  let route = base.route

  // For case-specific flows, point to the case detail page
  if (caseId && (category === 'RESOLVE_CASE' || category === 'CONTACT_STEUERBERATER')) {
    route = `/guidance/${caseId}`
  }

  return { taskKey, route, flowType: base.flowType, helperText: base.helperText, estimatedMinutes: base.estimatedMinutes }
}

export function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}min` : `${h}h`
}
