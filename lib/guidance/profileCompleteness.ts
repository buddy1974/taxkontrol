import type { PersonaProfile, ProfileCompletenessResult } from './guidanceTypes'

interface FieldCheck {
  label: string
  weight: number
  check: (p: PersonaProfile) => boolean
}

const FIELD_CHECKS: FieldCheck[] = [
  {
    label: 'Business type',
    weight: 15,
    check: p => p.businessType !== 'OTHER',
  },
  {
    label: 'Number of employees',
    weight: 10,
    check: p => p.employeeCount >= 0,
  },
  {
    label: 'Payment style',
    weight: 10,
    check: p => p.paymentStyle !== 'MIXED' || p.cashPercentage !== undefined,
  },
  {
    label: 'Active days per week',
    weight: 15,
    check: p => p.operatingDaysPerWeek !== null && p.operatingDaysPerWeek !== undefined,
  },
  {
    label: 'Estimated monthly income',
    weight: 10,
    check: p => p.averageMonthlyRevenue !== null && p.averageMonthlyRevenue !== undefined,
  },
  {
    label: 'Tax paperwork comfort level',
    weight: 15,
    check: p => p.bureaucracyConfidence !== 'MEDIUM',
  },
  {
    label: 'Current organization level',
    weight: 15,
    check: p => p.organizationLevel !== 'IMPROVING',
  },
  {
    label: 'Guidance detail level',
    weight: 10,
    check: p => p.guidanceComplexity !== 'STANDARD',
  },
]

function qualityImpact(pct: number): string {
  if (pct < 30) return 'Guidance is general — completing your profile significantly improves accuracy.'
  if (pct < 60) return 'Guidance is partially personalized. A few more answers will improve it further.'
  if (pct < 85) return 'Guidance is mostly personalized for your situation.'
  return 'Guidance is fully personalized for your business type and situation.'
}

export function computeProfileCompleteness(
  profile: PersonaProfile | null
): ProfileCompletenessResult {
  if (!profile) {
    return {
      completionPercent: 0,
      missingFields: FIELD_CHECKS.map(f => f.label),
      guidanceQualityImpact: qualityImpact(0),
      isComplete: false,
    }
  }

  let earned = 0
  const missing: string[] = []

  for (const fc of FIELD_CHECKS) {
    if (fc.check(profile)) {
      earned += fc.weight
    } else {
      missing.push(fc.label)
    }
  }

  const completionPercent = Math.min(100, earned)

  return {
    completionPercent,
    missingFields: missing,
    guidanceQualityImpact: qualityImpact(completionPercent),
    isComplete: completionPercent >= 85,
  }
}
