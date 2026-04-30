import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = buffer.toString('base64')

    const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64 },
            },
            {
              type: 'text',
              text: `Extract all transactions from this bank statement (Kontoauszug).
Respond ONLY with valid JSON array, no explanation:
[
  {
    "date": "YYYY-MM-DD",
    "description": "transaction description",
    "amount": 0.00,
    "type": "INCOME or EXPENSE",
    "merchant": "merchant name if identifiable"
  }
]
Positive amounts are income, negative are expenses. Include ALL transactions found.`,
            },
          ],
        }],
      }),
    })

    if (!aiResponse.ok) {
      return NextResponse.json({ error: 'AI extraction failed' }, { status: 500 })
    }

    const aiData = await aiResponse.json()
    const text = aiData.content?.[0]?.text ?? ''

    try {
      const clean = text.replace(/```json|```/g, '').trim()
      const transactions = JSON.parse(clean)
      return NextResponse.json({ transactions, count: transactions.length })
    } catch {
      return NextResponse.json({ error: 'Could not parse bank statement', raw: text }, { status: 422 })
    }
  } catch (err) {
    console.error('Bank statement parse error:', err)
    return NextResponse.json({ error: 'Parse failed' }, { status: 500 })
  }
}
