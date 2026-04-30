export type ExtractedTransaction = {
  merchant: string | null
  amount: number | null
  vatRate: number | null
  date: string | null
  description: string | null
  type: 'INCOME' | 'EXPENSE' | null
}

export async function extractFromText(text: string): Promise<ExtractedTransaction> {
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
          content: `Extract transaction data from this text. Respond ONLY with JSON:
{
  "merchant": "name or null",
  "amount": number or null,
  "vatRate": 0 or 7 or 19 or null,
  "date": "YYYY-MM-DD or null",
  "description": "what was bought or null",
  "type": "INCOME or EXPENSE or null"
}

Text: ${text}`,
        }],
      }),
    })

    if (!response.ok) throw new Error('AI request failed')

    const data = await response.json()
    const raw = data.content?.[0]?.text ?? ''
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { merchant: null, amount: null, vatRate: null, date: null, description: null, type: null }
  }
}
