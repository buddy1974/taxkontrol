import { extractStructured } from './claude'
import { ClassificationSchema, normaliseVatRate, type ClassificationResult } from './schemas'

export type { ClassificationResult }

/**
 * Suggests a category and business/private usage. The result is a suggestion
 * only; nothing is booked from it without the user confirming.
 */
export async function classifyTransaction(
  description: string,
  merchant: string | null,
  amount: number,
  type: 'INCOME' | 'EXPENSE'
): Promise<ClassificationResult & { categoryId: null }> {
  const result = await extractStructured({
    task: 'classify',
    schema: ClassificationSchema,
    maxTokens: 1024,
    content: [
      {
        type: 'text',
        text: `Suggest how to classify this transaction of a small business in Germany.
categoryName: one of Office rent, Phone & internet, Office supplies, Software & tools, Transport, Consulting, General income, Food & drinks, Marketing, Professional services, Insurance, Other.
usage: BUSINESS, PRIVATE, MIXED, or UNSURE when you cannot tell. Use UNSURE rather than guessing.
confidence: how sure you are (0.0–1.0).
vatRate: 0, 7 or 19 if typical for this kind of purchase, otherwise null.

<transaction>
type: ${type}
description: ${description.slice(0, 300)}
merchant: ${(merchant ?? 'unknown').slice(0, 120)}
amount: ${amount} EUR
</transaction>`,
      },
    ],
  })
  if (!result) return { categoryId: null, categoryName: null, usage: 'UNSURE', confidence: 0, vatRate: null }
  return {
    categoryId: null,
    categoryName: result.categoryName,
    usage: result.usage,
    confidence: Math.min(1, Math.max(0, result.confidence)),
    vatRate: normaliseVatRate(result.vatRate),
  }
}
