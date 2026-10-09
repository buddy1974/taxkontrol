import { z } from 'zod'

/** What the AI may suggest for a receipt or invoice. The user confirms every field. */
export const ReceiptSchema = z.object({
  merchant: z.string().nullable(),
  amount: z.number().nullable().describe('Total gross amount including VAT, in euros'),
  vatRate: z.number().nullable().describe('VAT rate in percent shown on the receipt: 0, 7 or 19'),
  date: z.string().nullable().describe('Receipt date as YYYY-MM-DD'),
  description: z.string().nullable(),
  type: z.enum(['INCOME', 'EXPENSE']).nullable().describe('INCOME if this is an invoice the user issued, otherwise EXPENSE'),
})
export type ReceiptExtraction = z.infer<typeof ReceiptSchema>

export const BankStatementSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string().describe('Booking date YYYY-MM-DD'),
      description: z.string(),
      amount: z.number().describe('Absolute amount in euros, always positive'),
      direction: z.enum(['IN', 'OUT']).describe('IN = money received, OUT = money paid'),
      merchant: z.string().nullable().describe('Counterparty name if identifiable'),
    })
  ),
})
export type BankStatementExtraction = z.infer<typeof BankStatementSchema>

export const ClassificationSchema = z.object({
  categoryName: z.string().nullable(),
  usage: z.enum(['BUSINESS', 'PRIVATE', 'MIXED', 'UNSURE']),
  confidence: z.number().describe('0.0 to 1.0'),
  vatRate: z.number().nullable(),
})
export type ClassificationResult = z.infer<typeof ClassificationSchema>

/** Normalises an AI-suggested VAT rate to an allowed one, or null when unknown. */
export function normaliseVatRate(v: number | null | undefined): 0 | 7 | 19 | null {
  return v === 0 || v === 7 || v === 19 ? v : null
}
