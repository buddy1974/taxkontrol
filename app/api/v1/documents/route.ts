import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { uploadToR2 } from '@/lib/r2'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { getMostRecentOpenCase, linkDocumentToCase } from '@/lib/guidance/caseManager'
import { recomputeAndTrackConfidence } from '@/lib/guidance/confidenceHistory'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

const ALLOWED_MIME: Record<string, 'image' | 'document'> = {
  'image/jpeg': 'image',
  'image/jpg':  'image',
  'image/png':  'image',
  'application/pdf': 'document',
}

const REJECTED_MIME: Record<string, string> = {
  'image/heic': 'HEIC files cannot be read automatically. Please convert to JPG or PNG first.',
  'image/heif': 'HEIF files cannot be read automatically. Please convert to JPG or PNG first.',
  'image/webp': 'WEBP files are not supported. Please upload a JPG or PNG instead.',
  'image/gif':  'GIF files are not supported. Please upload a JPG, PNG, or PDF.',
  'image/bmp':  'BMP files are not supported. Please upload a JPG or PNG instead.',
  'image/tiff': 'TIFF files are not supported. Please upload a JPG or PNG instead.',
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const documents = await db.document.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        fileName: true,
        mimeType: true,
        type: true,
        status: true,
        reviewStatus: true,
        approvedAt: true,
        linkedTransactionId: true,
        createdAt: true,
      },
    })
    return NextResponse.json(documents, { status: 200 })
  } catch (err) {
    console.error('Documents list error:', err)
    return NextResponse.json({ error: 'Could not fetch documents' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // 10 uploads per hour per user
  const rl = await rateLimit(`documents:${user.id}`, 10, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    // File size guard
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 413 }
      )
    }

    const mimeType = file.type.toLowerCase()

    // Explicit rejection for unsupported but common types
    if (REJECTED_MIME[mimeType]) {
      return NextResponse.json(
        { error: REJECTED_MIME[mimeType] },
        { status: 415 }
      )
    }

    // Whitelist check — unknown/unsupported types get a clear message
    const contentKind = ALLOWED_MIME[mimeType]
    if (!contentKind) {
      return NextResponse.json(
        { error: `Unsupported file type "${mimeType}". Please upload a JPG, PNG, or PDF.` },
        { status: 415 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const key = `${user.id}/${Date.now()}-${file.name.replace(/\s+/g, '-')}`

    // R2 upload happens before OCR — file is always saved
    await uploadToR2(key, buffer, mimeType)

    const document = await db.document.create({
      data: {
        userId: user.id,
        type: 'RECEIPT',
        fileName: file.name,
        r2Key: key,
        mimeType,
        status: 'PENDING',
      },
    })

    const base64 = buffer.toString('base64')

    // Normalise MIME for Anthropic — jpeg/jpg both become image/jpeg
    const anthropicMediaType = mimeType === 'image/jpg' ? 'image/jpeg' : mimeType

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
                type: contentKind,
                source: { type: 'base64', media_type: anthropicMediaType, data: base64 },
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
        const ocrText = aiData.content?.[0]?.text ?? ''

        try {
          const clean = ocrText.replace(/```json|```/g, '').trim()
          const extracted = JSON.parse(clean)

          await db.document.update({
            where: { id: document.id },
            data: { ocrData: extracted, ocrText, status: 'PROCESSED' },
          })

          // Link to open guidance case and track confidence (non-critical)
          try {
            const openCase = await getMostRecentOpenCase(user.id)
            if (openCase) {
              await linkDocumentToCase(openCase.id, document.id, file.name)
              await recomputeAndTrackConfidence(user.id, openCase.id)
            }
          } catch {
            // Case linking failure must never fail the upload
          }

          return NextResponse.json(
            { documentId: document.id, status: 'PROCESSED', extracted, ocrText },
            { status: 201 }
          )
        } catch {
          // JSON parse failed — save raw text, fall through to NEEDS_REVIEW
          await db.document.update({
            where: { id: document.id },
            data: { ocrText, status: 'NEEDS_REVIEW' },
          })
        }
      } else {
        // Anthropic returned an error — log it, continue to NEEDS_REVIEW
        const errBody = await aiResponse.text().catch(() => '')
        console.error(`OCR API error ${aiResponse.status}:`, errBody)
      }
    } catch (ocrErr) {
      // Network or parse error in OCR call — non-critical
      console.error('OCR call failed:', ocrErr)
    }

    // Link to open case even when OCR failed (non-critical)
    try {
      const openCase = await getMostRecentOpenCase(user.id)
      if (openCase) {
        await linkDocumentToCase(openCase.id, document.id, file.name)
        await recomputeAndTrackConfidence(user.id, openCase.id)
      }
    } catch {
      // Non-critical
    }

    await db.document.update({
      where: { id: document.id },
      data: { status: 'NEEDS_REVIEW' },
    })

    return NextResponse.json(
      { documentId: document.id, status: 'NEEDS_REVIEW', extracted: null, ocrText: null },
      { status: 201 }
    )
  } catch (err) {
    console.error('Document upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
