import type { ResponsePreparation } from './finanzamtTypes'

const PREPARATIONS: Record<string, ResponsePreparation> = {
  DOCUMENT_REQUEST: {
    whatToGather: [
      'All bank statements for the period mentioned in the letter',
      'All receipts and invoices for business expenses',
      'Income records — invoices sent, payment confirmations',
      'Previous tax return if the letter references a past year',
    ],
    whatToReview: [
      'Check all transactions in TaxKontrol are recorded and categorized',
      'Verify your income matches what was reported to the Finanzamt',
      'Identify any gaps in records and note them',
    ],
    whatToAsk: [
      'Which exact period does the Finanzamt want documents for?',
      'Are digital copies acceptable, or are originals required?',
      'What happens if some receipts are missing?',
    ],
    doNotDo: [
      'Do not ignore the letter or miss the deadline',
      'Do not send originals without keeping copies',
      'Do not respond to the Finanzamt before reviewing the letter with a Steuerberater',
    ],
  },
  REQUEST_DOCUMENTS: {
    whatToGather: [
      'All bank statements for the period mentioned in the letter',
      'All receipts and invoices for business expenses',
      'Income records — invoices sent, payment confirmations',
      'Previous tax return if the letter references a past year',
    ],
    whatToReview: [
      'Check all transactions in TaxKontrol are recorded and categorized',
      'Verify your income matches what was reported to the Finanzamt',
      'Identify any gaps in records and note them',
    ],
    whatToAsk: [
      'Which exact period does the Finanzamt want documents for?',
      'Are digital copies acceptable, or are originals required?',
      'What happens if some receipts are missing?',
    ],
    doNotDo: [
      'Do not ignore the letter or miss the deadline',
      'Do not send originals without keeping copies',
      'Do not respond to the Finanzamt before reviewing the letter with a Steuerberater',
    ],
  },
  PAYMENT_REMINDER: {
    whatToGather: [
      'The original tax assessment (Steuerbescheid) that created this obligation',
      'Proof of any payments already made',
      'Your current bank balance and tax reserve records',
    ],
    whatToReview: [
      'Compare the amount in the letter against your own records',
      'Check if any payments were already made that are not yet reflected',
      'Review your tax reserve to confirm funds are available',
    ],
    whatToAsk: [
      'Is a payment plan (Ratenzahlung) possible if the full amount cannot be paid at once?',
      'Is the amount in the letter correct based on my actual records?',
      'What is the process if I believe the amount is wrong?',
    ],
    doNotDo: [
      'Do not ignore a payment reminder — late payments collect a monthly surcharge',
      'Do not pay without first confirming the amount is correct',
      'Do not assume the problem will resolve itself without action',
    ],
  },
  TAX_ESTIMATE: {
    whatToGather: [
      'All income and expense transactions for the tax year in question',
      'Bank statements covering the entire year',
      'Any previous tax returns or relevant Finanzamt correspondence',
    ],
    whatToReview: [
      'Compare your actual income to the Finanzamt estimate — their estimate is usually higher',
      'Confirm all deductible expenses are recorded in TaxKontrol',
      'Identify any income sources that may have been missed',
    ],
    whatToAsk: [
      'Can you file my actual tax return to replace the estimate?',
      'Is there still time to challenge the estimate, or has it been finalized?',
      'What deductions am I entitled to claim for this period?',
    ],
    doNotDo: [
      'Do not accept the estimate as final without filing your actual return',
      'Do not wait — the sooner the actual return is filed, the better your outcome',
      'Do not estimate your own numbers without records to support them',
    ],
  },
  MISSING_DECLARATION: {
    whatToGather: [
      'All income and expense records for the missing declaration period',
      'Bank statements as supporting evidence',
      'Any previous correspondence about this declaration',
    ],
    whatToReview: [
      'Confirm which declaration is missing and for which year',
      'Check that all records for that period are complete',
      'Calculate the approximate tax owed to be prepared for payment',
    ],
    whatToAsk: [
      'Can you file the missing declaration on my behalf immediately?',
      'Is it possible to reduce penalties by filing voluntarily now?',
      'What is the maximum penalty I could face if I wait?',
    ],
    doNotDo: [
      'Do not delay — every additional day increases penalty risk',
      'Do not attempt to file without professional help if records are incomplete',
      'Do not ignore the letter',
    ],
  },
  DEADLINE_NOTICE: {
    whatToGather: [
      'All documents referenced in the original letter',
      'Any correspondence you have already sent to the Finanzamt',
    ],
    whatToReview: [
      'Check the deadline date carefully — confirm it has not already passed',
      'Review what action was originally requested',
    ],
    whatToAsk: [
      'Can the deadline be extended if more preparation time is needed?',
      'What are the consequences of missing this deadline?',
    ],
    doNotDo: [
      'Do not miss the deadline without first requesting an extension',
      'Do not ignore this notice',
    ],
  },
  UNKNOWN: {
    whatToGather: [
      'All income and expense records',
      'Any previous letters from the Finanzamt',
    ],
    whatToReview: [
      'Read the letter carefully for any deadlines or specific requests',
      'Note any reference numbers or case IDs mentioned',
    ],
    whatToAsk: [
      'What is the Finanzamt asking for in this letter?',
      'Is this letter related to any previous correspondence?',
    ],
    doNotDo: [
      'Do not ignore the letter — all Finanzamt letters are legally significant',
      'Do not respond without first understanding what is being asked',
    ],
  },
}

export function buildResponsePreparation(letterType: string | null): ResponsePreparation {
  const type = letterType ?? 'UNKNOWN'
  return PREPARATIONS[type] ?? PREPARATIONS['UNKNOWN']
}
