import type { BusinessRhythmInsight, BusinessType, PersonaProfile } from './guidanceTypes'

// Business rhythm profiles define expected operational patterns per business type.
// These are guidelines — individual businesses vary significantly.
// The system must never assert certainty about a specific user's behaviour.

interface RhythmProfile {
  expectedDailyActivity: boolean
  irregularIncomeNormal: boolean
  monthlyBurstExpected: boolean
  rhythmSummary: string
}

const RHYTHM_PROFILES: Record<BusinessType, RhythmProfile> = {
  RESTAURANT: {
    expectedDailyActivity: true,
    irregularIncomeNormal: false,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Restaurants typically have daily income activity. Gaps in daily records may indicate missing entries.',
  },
  RETAIL: {
    expectedDailyActivity: true,
    irregularIncomeNormal: false,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Retail businesses typically record sales daily or several times a week.',
  },
  DRIVER: {
    expectedDailyActivity: true,
    irregularIncomeNormal: true,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Driving and delivery work often produces irregular daily income depending on platform payouts.',
  },
  FREELANCER: {
    expectedDailyActivity: false,
    irregularIncomeNormal: true,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Freelance work often comes in irregular bursts tied to project completions and invoice payment cycles.',
  },
  CONSULTANT: {
    expectedDailyActivity: false,
    irregularIncomeNormal: true,
    monthlyBurstExpected: true,
    rhythmSummary:
      'Consultants typically invoice monthly or at project milestones. Irregular income between invoices is normal.',
  },
  CONSTRUCTION: {
    expectedDailyActivity: false,
    irregularIncomeNormal: false,
    monthlyBurstExpected: true,
    rhythmSummary:
      'Construction businesses often invoice at project stages or end of month. Monthly income bursts are expected.',
  },
  CREATIVE: {
    expectedDailyActivity: false,
    irregularIncomeNormal: true,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Creative work is project-driven. Income can be highly irregular across months.',
  },
  OTHER: {
    expectedDailyActivity: false,
    irregularIncomeNormal: false,
    monthlyBurstExpected: false,
    rhythmSummary:
      'Your typical business rhythm has not been profiled yet. Adding your business type improves this guidance.',
  },
}

export function getBusinessRhythm(
  profile: PersonaProfile | null,
  monthsWithTransactions: number[],
  currentMonth: number
): BusinessRhythmInsight {
  const businessType = profile?.businessType ?? 'OTHER'
  const base = RHYTHM_PROFILES[businessType]

  const expectedMonths = Array.from({ length: currentMonth }, (_, i) => i + 1)
  const missingMonths = expectedMonths.filter(m => !monthsWithTransactions.includes(m))
  const missingRatio = expectedMonths.length > 0 ? missingMonths.length / expectedMonths.length : 0

  let anomalyNote: string | undefined

  if (base.expectedDailyActivity && missingRatio > 0.3) {
    anomalyNote =
      `For a ${businessType.toLowerCase()} business, frequent monthly gaps may indicate missing records rather than inactive periods.`
  } else if (!base.irregularIncomeNormal && missingRatio > 0.4) {
    anomalyNote =
      `Your business type typically has consistent monthly activity. ${missingMonths.length} month(s) without records may be worth reviewing.`
  } else if (base.irregularIncomeNormal && missingRatio > 0.6) {
    anomalyNote =
      `Even with irregular income, ${missingMonths.length} month(s) without any records is unusually high.`
  }

  return {
    expectedDailyActivity: base.expectedDailyActivity,
    irregularIncomeNormal: base.irregularIncomeNormal,
    monthlyBurstExpected: base.monthlyBurstExpected,
    anomalyNote,
    rhythmSummary: base.rhythmSummary,
  }
}

export function getMissingMonthSeverity(
  profile: PersonaProfile | null,
  missingMonthCount: number
): 'blocking' | 'important' | 'minor' {
  const businessType = profile?.businessType ?? 'OTHER'
  const base = RHYTHM_PROFILES[businessType]

  if (base.irregularIncomeNormal && missingMonthCount <= 2) return 'minor'
  if (base.monthlyBurstExpected && missingMonthCount <= 1) return 'minor'
  if (missingMonthCount === 0) return 'minor'
  if (missingMonthCount >= 3) return 'blocking'
  return 'important'
}
