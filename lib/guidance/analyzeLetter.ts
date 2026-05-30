import type {
  DocumentMeta,
  LetterAnalysisResult,
  LetterType,
  MissingDataItem,
  UrgencyLevel,
  UserContext,
} from './guidanceTypes'
import { computeConfidence } from './confidence'
import { detectMissingData } from './missingData'
import { getStandardDisclaimer } from './disclaimers'

const LETTER_PATTERNS: Record<Exclude<LetterType, 'UNKNOWN'>, RegExp[]> = {
  REQUEST_DOCUMENTS: [
    /bitte.*?vorlegen/i,
    /unterlagen.*?einreichen/i,
    /belege.*?nachweisen/i,
    /nachweise.*?anfordern/i,
    /belege.*?anfordern/i,
    /dokumente.*?vorlegen/i,
    /vorlage.*?unterlagen/i,
  ],
  PAYMENT_REMINDER: [
    /mahnung/i,
    /r[üu]ckstand/i,
    /zahlungsaufforderung/i,
    /offener betrag/i,
    /f[äa]lligkeit/i,
    /nachzahlung/i,
    /zahlungserinnerung/i,
    /s[äa]umnis/i,
  ],
  TAX_ESTIMATE: [
    /sch[äa]tzung/i,
    /sch[äa]tzungsbescheid/i,
    /steuerschätzung/i,
    /gesch[äa]tzter betrag/i,
    /mangels.*?erkl[äa]rung/i,
    /von amts wegen/i,
  ],
  MISSING_DECLARATION: [
    /steuererklärung.*?fehlt/i,
    /erkl[äa]rung.*?nicht.*?eingereicht/i,
    /frist.*?abgelaufen/i,
    /abgabefrist/i,
    /erkl[äa]rungspflicht/i,
    /versp[äa]tungszuschlag/i,
    /nicht abgegeben/i,
  ],
}

function detectLetterType(text: string): LetterType {
  for (const [type, patterns] of Object.entries(LETTER_PATTERNS) as [Exclude<LetterType, 'UNKNOWN'>, RegExp[]][]) {
    if (patterns.some(p => p.test(text))) return type
  }
  return 'UNKNOWN'
}

function detectUrgency(text: string, type: LetterType): UrgencyLevel {
  if (/sofort|unverz[üu]glich|dringend/i.test(text)) return 'IMMEDIATE'
  if (type === 'PAYMENT_REMINDER' || type === 'TAX_ESTIMATE') return 'WITHIN_WEEK'
  if (type === 'MISSING_DECLARATION' || type === 'REQUEST_DOCUMENTS') return 'WITHIN_MONTH'
  return 'INFORMATIONAL'
}

function extractRequestedDocuments(text: string): string[] {
  const docs: string[] = []
  if (/einnahmen.*?[üu]berschuss|E[ÜU]R|gewinnermittlung/i.test(text))
    docs.push('EÜR (Einnahmen-Überschuss-Rechnung)')
  if (/kontoauszug/i.test(text))
    docs.push('Bank statements (Kontoauszüge)')
  if (/belege|quittungen|kassenbons/i.test(text))
    docs.push('Receipts and invoices (Belege)')
  if (/steuererklärung/i.test(text))
    docs.push('Tax return (Steuererklärung)')
  if (/umsatzsteuer/i.test(text))
    docs.push('VAT records (Umsatzsteuervoranmeldungen)')
  if (/lohnsteuer|gehaltsabrechnung/i.test(text))
    docs.push('Payroll records (Lohnsteuerunterlagen)')
  return docs
}

function buildSummary(type: LetterType): string {
  switch (type) {
    case 'REQUEST_DOCUMENTS':
      return 'The Finanzamt is requesting specific documents or records from you.'
    case 'PAYMENT_REMINDER':
      return 'The Finanzamt has issued a payment reminder. There may be an outstanding amount due.'
    case 'TAX_ESTIMATE':
      return 'The Finanzamt has estimated your tax liability because a declaration is missing or incomplete.'
    case 'MISSING_DECLARATION':
      return 'The Finanzamt notes that a required tax declaration has not been submitted.'
    default:
      return 'The letter content could not be clearly classified. Please review it carefully with a Steuerberater.'
  }
}

function buildRecommendedActions(
  type: LetterType,
  missingData: MissingDataItem[]
): string[] {
  const actions: string[] = []

  switch (type) {
    case 'REQUEST_DOCUMENTS':
      actions.push('Gather all documents listed in the letter.')
      actions.push('Upload missing receipts and invoices to TaxKontrol.')
      actions.push('Contact a Steuerberater to help compile and submit documents.')
      break
    case 'PAYMENT_REMINDER':
      actions.push('Check the amount in the letter against your own records.')
      actions.push('Do not ignore this letter — contact the Finanzamt or a Steuerberater promptly.')
      actions.push('Review your tax reserve balance to confirm funds are available.')
      break
    case 'TAX_ESTIMATE':
      actions.push('File your actual tax declaration as soon as possible to replace the estimate.')
      actions.push('A Steuerberater can file on your behalf and may reduce the estimated amount.')
      actions.push('Gather all income and expense records for the relevant tax year.')
      break
    case 'MISSING_DECLARATION':
      actions.push('Submit the missing tax declaration immediately.')
      actions.push('A Steuerberater can file on your behalf to avoid further penalties.')
      actions.push('Check TaxKontrol for any missing transaction records before filing.')
      break
    default:
      actions.push('Read the letter carefully and note any deadlines mentioned.')
      actions.push('Consult a Steuerberater if you are unsure how to respond.')
  }

  if (missingData.some(d => d.type === 'MISSING_MONTH'))
    actions.push('Complete missing monthly transaction records in TaxKontrol.')
  if (missingData.some(d => d.type === 'NO_RECEIPTS'))
    actions.push('Upload supporting receipts and invoices to strengthen your records.')

  return actions
}

function buildSuggestedSections(type: LetterType): string[] {
  switch (type) {
    case 'REQUEST_DOCUMENTS':
      return ['Transactions', 'Reports', 'Import bank statement', 'Add transaction']
    case 'PAYMENT_REMINDER':
      return ['Tax reserve', 'Dashboard', 'Reports']
    case 'TAX_ESTIMATE':
      return ['Reports', 'Transactions', 'Add transaction']
    case 'MISSING_DECLARATION':
      return ['Reports', 'Transactions', 'Add transaction']
    default:
      return ['Dashboard', 'Reports']
  }
}

export function buildInterpretedMeaning(type: LetterType, urgency: UrgencyLevel): string {
  switch (type) {
    case 'REQUEST_DOCUMENTS':
      return urgency === 'IMMEDIATE'
        ? 'The Finanzamt needs specific documents from you urgently. This is usually part of a verification check on your income or expenses. You need to respond as soon as possible.'
        : 'The Finanzamt is asking you to send them some documents. This is often a routine check. They want to verify that your income and expenses are correct.'
    case 'PAYMENT_REMINDER':
      return 'The Finanzamt is reminding you about an amount they believe you owe. This could be from a previous tax assessment or a late payment. It is important not to ignore this — even if you think the amount is wrong.'
    case 'TAX_ESTIMATE':
      return 'Because a tax declaration was not filed, the Finanzamt has made their own estimate of what you owe. This estimate is often higher than the actual amount. Filing your real tax return can replace this estimate with the correct figure.'
    case 'MISSING_DECLARATION':
      return 'The Finanzamt has noticed that a required tax return has not been submitted. Filing it now — even late — can reduce or avoid penalties. The longer you wait, the higher the risk of additional charges.'
    default:
      return 'We were not able to identify the exact purpose of this letter from the uploaded text. This can happen if the letter is handwritten, has low image quality, or uses unusual formatting. Please review the letter carefully and consider showing it to a Steuerberater.'
  }
}

export function buildEducationalNotice(type: LetterType): string {
  switch (type) {
    case 'REQUEST_DOCUMENTS':
      return 'In Germany, the Finanzamt can request documents to verify any part of your tax situation. This process is called a Belegprüfung. Keeping organized records throughout the year makes responding to these requests much easier.'
    case 'PAYMENT_REMINDER':
      return 'Unpaid tax amounts in Germany can accumulate a surcharge (Säumniszuschlag) of 1% per month after a 5-day grace period. Addressing payment reminders early avoids this extra cost.'
    case 'TAX_ESTIMATE':
      return 'If a tax return is not filed, the Finanzamt has the legal right to estimate your income (Schätzung) under §162 AO. Their estimate is usually higher than actual income. Submitting your real return replaces the estimate — the sooner you file, the better.'
    case 'MISSING_DECLARATION':
      return 'Missing a tax filing deadline in Germany can result in a late penalty (Verspätungszuschlag) of up to 10% of the tax owed, with a maximum of €25,000. Filing as soon as possible reduces the total penalty amount.'
    default:
      return 'German tax letters from the Finanzamt are legally significant documents. Even if the content is unclear, it is important to respond within any deadlines mentioned. A Steuerberater can help you interpret and respond to any official communication.'
  }
}

export function buildEscalationReason(
  type: LetterType,
  urgency: UrgencyLevel,
  confidenceLevel: string,
  hasLegalLanguage: boolean
): string | undefined {
  if (hasLegalLanguage)
    return 'This letter may contain enforcement or legal language that requires professional review before you respond.'
  if (urgency === 'IMMEDIATE')
    return 'This letter requires an immediate response. A Steuerberater can help you act quickly and correctly.'
  if (type === 'TAX_ESTIMATE')
    return 'Tax estimates from the Finanzamt can be challenged by filing your actual return. A Steuerberater can handle this on your behalf.'
  if (type === 'PAYMENT_REMINDER' && confidenceLevel === 'LOW')
    return 'Your records appear incomplete, and this letter involves a financial obligation. A Steuerberater can review both your records and the letter before you respond.'
  if (type === 'MISSING_DECLARATION')
    return 'Missing declarations can lead to escalating penalties. A Steuerberater can file the return and communicate with the Finanzamt on your behalf.'
  if (confidenceLevel === 'LOW' && type !== 'UNKNOWN')
    return 'Your record confidence is low, which limits the accuracy of this analysis. A Steuerberater should review the actual letter and your full situation.'
  return undefined
}

export function hasLegalEnforcementLanguage(text: string): boolean {
  return /vollstreckung|pf[äa]ndung|zwangsvollstreckung|mahnstufe|gerichtlich/i.test(text)
}

export function analyzeLetter(
  ocrText: string,
  userContext: UserContext,
  currentMonth: number,
  _documents?: DocumentMeta[]
): LetterAnalysisResult {
  const detectedType = detectLetterType(ocrText)
  const urgency = detectUrgency(ocrText, detectedType)
  const requestedDocuments = extractRequestedDocuments(ocrText)
  const confidence = computeConfidence(userContext, currentMonth)
  const missingData = detectMissingData(userContext, currentMonth)
  const summary = buildSummary(detectedType)
  const recommendedActions = buildRecommendedActions(detectedType, missingData)
  const suggestedSections = buildSuggestedSections(detectedType)
  const escalationRecommended = detectedType !== 'UNKNOWN' || urgency === 'IMMEDIATE'
  const disclaimer = getStandardDisclaimer()

  return {
    summary,
    detectedType,
    urgency,
    confidence,
    requestedDocuments,
    missingData,
    recommendedActions,
    suggestedSections,
    escalationRecommended,
    disclaimer,
  }
}
