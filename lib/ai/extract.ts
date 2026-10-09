import { extractStructured } from './claude'
import { ReceiptSchema, normaliseVatRate, type ReceiptExtraction } from './schemas'

export type ExtractedTransaction = ReceiptExtraction

const EMPTY: ExtractedTransaction = { merchant: null, amount: null, vatRate: null, date: null, description: null, type: null }

/** Reads a free-text note ("Adobe 119 € today") into form suggestions. */
export async function extractFromText(text: string): Promise<ExtractedTransaction> {
  const today = new Date().toISOString().slice(0, 10)
  const result = await extractStructured({
    task: 'extract-text',
    schema: ReceiptSchema,
    maxTokens: 1024,
    content: [
      {
        type: 'text',
        text: `Today is ${today}. Extract a single money transaction from the note below. Use null for anything not stated. amount is the gross euro amount.

<note>
${text.slice(0, 2000)}
</note>`,
      },
    ],
  })
  if (!result) return EMPTY
  return { ...result, vatRate: normaliseVatRate(result.vatRate), amount: result.amount !== null && result.amount > 0 ? result.amount : null }
}
