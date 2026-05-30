export const DISCLAIMERS = {
  EDUCATIONAL_ONLY:
    'This analysis is for educational and preparation purposes only. It does not constitute legal or tax advice.',

  VERIFY_WITH_STEUERBERATER:
    'Always verify this information with a qualified Steuerberater before taking action.',

  BASED_ON_AVAILABLE_RECORDS:
    'This assessment is based solely on the records currently available in TaxKontrol. Missing or inaccurate data will affect the analysis.',

  NO_GUARANTEE_FINANZAMT:
    'There is no guarantee that the Finanzamt will accept any explanation or document prepared based on this guidance.',

  NOT_LEGAL_REPRESENTATION:
    'TaxKontrol is not a Steuerberater and does not provide legal representation.',

  CONFIDENCE_LIMITED:
    'Confidence in this analysis is limited by the completeness of your records. Add missing transactions and documents to improve accuracy.',
} as const

export type DisclaimerKey = keyof typeof DISCLAIMERS

export function getDisclaimer(...keys: DisclaimerKey[]): string {
  return keys.map(k => DISCLAIMERS[k]).join(' ')
}

export function getStandardDisclaimer(): string {
  return getDisclaimer(
    'EDUCATIONAL_ONLY',
    'VERIFY_WITH_STEUERBERATER',
    'BASED_ON_AVAILABLE_RECORDS'
  )
}
