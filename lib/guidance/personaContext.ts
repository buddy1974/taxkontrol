import type {
  AdaptiveFlags,
  BusinessType,
  GuidanceComplexity,
  PersonaContext,
  PersonaProfile,
} from './guidanceTypes'

// ─── Future architecture placeholders ─────────────────────────────────────────
// TODO: multilingual guidance — replace static strings with locale-keyed messages
// TODO: voice guidance — persona context to inform TTS tone and pacing
// TODO: AI-assisted onboarding — let Claude help users describe their business
// TODO: adaptive reminders — schedule reminders based on businessType rhythm
// TODO: behavioral continuity learning — track how guidance recommendations perform
// ─────────────────────────────────────────────────────────────────────────────

const BUSINESS_LABELS: Record<BusinessType, string> = {
  FREELANCER: 'Freelancer',
  RESTAURANT: 'Restaurant / Food business',
  CONSTRUCTION: 'Construction / Trade',
  DRIVER: 'Driver / Delivery',
  RETAIL: 'Retail / Shop',
  CREATIVE: 'Creative / Artist',
  CONSULTANT: 'Consultant',
  OTHER: 'Business owner',
}

function deriveFlags(profile: PersonaProfile | null): AdaptiveFlags {
  if (!profile) {
    return {
      needsSimplifiedGuidance: false,
      highAnxietyRisk: false,
      likelyCashHeavy: false,
      irregularIncomeExpected: false,
      needsExtraPreparationHelp: false,
    }
  }

  const cashHeavy =
    profile.paymentStyle === 'CASH_HEAVY' ||
    (profile.cashPercentage !== null &&
      profile.cashPercentage !== undefined &&
      profile.cashPercentage >= 50)

  const irregular =
    profile.businessType === 'FREELANCER' ||
    profile.businessType === 'CREATIVE' ||
    profile.businessType === 'CONSULTANT'

  const needsSimplified =
    profile.guidanceComplexity === 'SIMPLE' ||
    profile.bureaucracyConfidence === 'LOW' ||
    profile.organizationLevel === 'OVERWHELMED'

  const highAnxiety =
    profile.bureaucracyConfidence === 'LOW' ||
    profile.organizationLevel === 'OVERWHELMED'

  const needsExtra =
    profile.organizationLevel === 'OVERWHELMED' ||
    profile.bureaucracyConfidence === 'LOW'

  return {
    needsSimplifiedGuidance: needsSimplified,
    highAnxietyRisk: highAnxiety,
    likelyCashHeavy: cashHeavy,
    irregularIncomeExpected: irregular,
    needsExtraPreparationHelp: needsExtra,
  }
}

function deriveGuidanceMode(profile: PersonaProfile | null): GuidanceComplexity {
  if (!profile) return 'STANDARD'
  if (profile.guidanceComplexity === 'SIMPLE') return 'SIMPLE'
  if (profile.guidanceComplexity === 'ADVANCED') return 'ADVANCED'
  if (profile.bureaucracyConfidence === 'LOW') return 'SIMPLE'
  if (profile.bureaucracyConfidence === 'HIGH' && profile.organizationLevel === 'ORGANIZED') {
    return 'ADVANCED'
  }
  return 'STANDARD'
}

const CONFIDENCE_LABELS: Record<string, string> = {
  LOW: 'Needs more support',
  MEDIUM: 'Developing confidence',
  HIGH: 'Confident with paperwork',
}

const ORGANIZATION_LABELS: Record<string, string> = {
  OVERWHELMED: 'Currently overwhelmed',
  IMPROVING: 'Getting more organized',
  ORGANIZED: 'Well organized',
}

export function buildPersonaContext(profile: PersonaProfile | null): PersonaContext {
  const flags = deriveFlags(profile)
  const guidanceMode = deriveGuidanceMode(profile)

  return {
    profile,
    flags,
    guidanceMode,
    confidenceLabel: CONFIDENCE_LABELS[profile?.bureaucracyConfidence ?? 'MEDIUM'] ?? 'Developing confidence',
    organizationLabel: ORGANIZATION_LABELS[profile?.organizationLevel ?? 'IMPROVING'] ?? 'Getting more organized',
    businessLabel: BUSINESS_LABELS[profile?.businessType ?? 'OTHER'] ?? 'Business owner',
  }
}

export function adaptGuidanceText(
  text: string,
  context: PersonaContext | null,
  options?: { simplified?: string; advanced?: string }
): string {
  if (!context) return text
  if (context.guidanceMode === 'SIMPLE' && options?.simplified) return options.simplified
  if (context.guidanceMode === 'ADVANCED' && options?.advanced) return options.advanced
  return text
}
