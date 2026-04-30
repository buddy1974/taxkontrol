import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const key = `${session.user.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

    const document = await db.document.create({
      data: {
        userId: session.user.id,
        type: 'RECEIPT',
        fileName: file.name,
        r2Key: key,
        mimeType: file.type,
        status: 'PENDING',
      },
    })

    const base64 = buffer.toString('base64')
    const isImage = file.type.startsWith('image/')

    if (isImage || file.type === 'application/pdf') {
      try {
        const aiResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': process.env.ANTHROPIC_API_KEY!,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
              role: 'user',
              content: [
                {
                  type: isImage ? 'image' : 'document',
                  source: {
                    type: 'base64',
                    media_type: file.type,
                    data: base64,
                  },
                },
                {
                  type: 'text',
                  text: `Extract the following from this receipt or invoice. Respond ONLY with valid JSON, no explanation:
{
  "merchant": "store or supplier name",
  "amount": 0.00,
  "vatRate": 19,
  "date": "YYYY-MM-DD",
  "description": "what was purchased",
  "type": "EXPENSE"
}
If any field cannot be determined, use null. Amount should be the total gross amount including VAT. vatRate should be 0, 7, or 19.`,
                },
              ],
            }],
          }),
        })

        if (aiResponse.ok) {
          const aiData = await aiResponse.json()
          const text = aiData.content?.[0]?.text ?? ''
          try {
            const clean = text.replace(/```json|```/g, '').trim()
            const extracted = JSON.parse(clean)
            await db.document.update({
              where: { id: document.id },
              data: {
                ocrData: extracted,
                ocrText: text,
                status: 'PROCESSED',
              },
            })
            return NextResponse.json({
              documentId: document.id,
              extracted,
              status: 'PROCESSED',
            }, { status: 201 })
          } catch {
            // JSON parse failed — fall through
          }
        }
      } catch {
        // AI extraction failed — still return document
      }
    }

    await db.document.update({
      where: { id: document.id },
      data: { status: 'NEEDS_REVIEW' },
    })

    return NextResponse.json({
      documentId: document.id,
      extracted: null,
      status: 'NEEDS_REVIEW',
    }, { status: 201 })
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
