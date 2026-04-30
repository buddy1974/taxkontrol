export type ClassificationResult = {
  categoryId: string | null
  categoryName: string | null
  usage: 'BUSINESS' | 'PRIVATE' | 'MIXED'
  confidence: number
  vatRate: number
}

export async function classifyTransaction(
  description: string,
  merchant: string | null,
  amount: number,
  type: 'INCOME' | 'EXPENSE'
): Promise<ClassificationResult> {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 256,
        messages: [{
          role: 'user',
          content: `Classify this German business transaction. Respond ONLY with JSON, no explanation:
{
  "categoryName": "one of: Office rent, Phone & internet, Office supplies, Software & tools, Transport, Consulting, General income, Food & drinks, Marketing, Professional services, Insurance, Other",
  "usage": "BUSINESS or PRIVATE or MIXED",
  "confidence": 0.0 to 1.0,
  "vatRate": 0 or 7 or 19
}

Transaction:
Type: ${type}
Description: ${description}
Merchant: ${merchant ?? 'unknown'}
Amount: €${amount}`,
        }],
      }),
    })

    if (!response.ok) throw new Error('AI request failed')

    const data = await response.json()
    const text = data.content?.[0]?.text ?? ''
    const clean = text.replace(/```json|```/g, '').trim()
    const result = JSON.parse(clean)

    return {
      categoryId: null,
      categoryName: result.categoryName ?? null,
      usage: result.usage ?? 'BUSINESS',
      confidence: result.confidence ?? 0.5,
      vatRate: result.vatRate ?? 19,
    }
  } catch {
    return {
      categoryId: null,
      categoryName: null,
      usage: 'BUSINESS',
      confidence: 0,
      vatRate: 19,
    }
  }
}
