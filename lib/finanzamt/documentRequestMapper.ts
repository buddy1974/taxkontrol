import type { DocumentRequirement } from './finanzamtTypes'

type DocSpec = Omit<DocumentRequirement, 'available'>

const LETTER_TYPE_DOCS: Record<string, DocSpec[]> = {
  DOCUMENT_REQUEST: [
    { name: 'Bank statements (Kontoauszüge)', description: 'All bank account statements for the relevant period', where: '/import' },
    { name: 'Receipts and invoices (Belege)', description: 'Business receipts and supplier invoices', where: '/input' },
    { name: 'Income summary (EÜR)', description: 'Einnahmen-Überschuss-Rechnung for the tax year', where: '/reports' },
  ],
  // Alias — existing guidance system uses REQUEST_DOCUMENTS
  REQUEST_DOCUMENTS: [
    { name: 'Bank statements (Kontoauszüge)', description: 'All bank account statements for the relevant period', where: '/import' },
    { name: 'Receipts and invoices (Belege)', description: 'Business receipts and supplier invoices', where: '/input' },
    { name: 'Income summary (EÜR)', description: 'Einnahmen-Überschuss-Rechnung for the tax year', where: '/reports' },
  ],
  PAYMENT_REMINDER: [
    { name: 'Tax reserve records', description: 'Current tax reserve balance and history', where: '/tax' },
    { name: 'Bank statements', description: 'To verify payment history and balances', where: '/import' },
    { name: 'Previous payment receipts', description: 'Proof of any payments already made', where: '/input' },
  ],
  TAX_ESTIMATE: [
    { name: 'All transactions (current year)', description: 'Complete income and expense record for the year', where: '/transactions' },
    { name: 'Bank statements', description: 'Supporting evidence for all transactions', where: '/import' },
    { name: 'Income summary (EÜR)', description: 'Formal income/expense report for the relevant year', where: '/reports' },
    { name: 'All receipts', description: 'Evidence of business expenses claimed', where: '/input' },
  ],
  MISSING_DECLARATION: [
    { name: 'All transactions for the period', description: 'Complete records for the missing declaration year', where: '/transactions' },
    { name: 'Income summary (EÜR)', description: 'EÜR for the relevant filing year', where: '/reports' },
    { name: 'Bank statements and receipts', description: 'Supporting documents for all entries', where: '/import' },
  ],
  DEADLINE_NOTICE: [
    { name: 'Any documents originally requested', description: 'Whatever was requested in the preceding letter', where: '/input' },
    { name: 'Current income and expense summary', description: 'Year-to-date report', where: '/reports' },
  ],
  UNKNOWN: [
    { name: 'Complete transaction records', description: 'All income and expense entries', where: '/transactions' },
    { name: 'Uploaded receipts and documents', description: 'Any supporting evidence already on file', where: '/input' },
  ],
}

export function mapLetterTypeToDocuments(
  letterType: string | null,
  hasDocuments: boolean,
  hasTransactions: boolean
): DocumentRequirement[] {
  const type = letterType ?? 'UNKNOWN'
  const specs = LETTER_TYPE_DOCS[type] ?? LETTER_TYPE_DOCS['UNKNOWN']

  return specs.map((spec, idx) => ({
    ...spec,
    available: idx === 0 ? hasDocuments : idx === 1 ? hasTransactions : false,
  }))
}
