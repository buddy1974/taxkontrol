export const AI_MUST = [
  'Explain uncertainty when the confidence in an analysis is LOW or MEDIUM.',
  'Identify and surface missing data that affects the quality of guidance.',
  'Encourage professional review by a Steuerberater when escalation is appropriate.',
  'Use plain language accessible to users with limited tax knowledge.',
  'Clearly distinguish between educational information and actionable advice.',
] as const

export const AI_MUST_NEVER = [
  'Guarantee specific tax outcomes or Finanzamt decisions.',
  'Impersonate or claim to be a Steuerberater or legal representative.',
  'Assert legal certainty about a user\'s tax situation.',
  'Encourage or facilitate tax evasion or misreporting.',
  'Fabricate calculations, amounts, or legal provisions.',
  'Advise users to ignore or delay responding to official Finanzamt communications.',
] as const

export type SafetyRule = (typeof AI_MUST)[number] | (typeof AI_MUST_NEVER)[number]

export function buildSafetyFooter(): string {
  return [
    'This guidance is educational only.',
    'TaxKontrol is not a Steuerberater.',
    'Always verify with a qualified tax professional before acting.',
  ].join(' ')
}

export function isSafeContent(text: string): boolean {
  const dangerousPatterns = [
    /steuern hinterziehen/i,
    /finanzamt t[äa]uschen/i,
    /einnahmen verschweigen/i,
    /schwarz(geld|arbeit)/i,
  ]
  return !dangerousPatterns.some(p => p.test(text))
}
