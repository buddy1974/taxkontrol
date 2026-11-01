import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/log'
import { db } from '@/lib/db'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { uploadToR2, userFileKey } from '@/lib/r2'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { getMostRecentOpenCase, linkDocumentToCase } from '@/lib/guidance/caseManager'
import { recomputeAndTrackConfidence } from '@/lib/guidance/confidenceHistory'
import { validateUpload, UploadError } from '@/lib/upload'
import { extractStructured, fileBlock } from '@/lib/ai/claude'
import { ReceiptSchema, normaliseVatRate } from '@/lib/ai/schemas'
import { jsonError, unauthorized } from '@/lib/http'

const MAX_BYTES = 10 * 1024 * 1024

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

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
  return NextResponse.json(documents)
}

/**
 * Stores a receipt and asks the AI to READ it. The extracted values are only
 * suggestions: the document stays in review until the user approves it
 * (PATCH /api/v1/documents/[id]/review). Nothing is booked here.
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`documents:${user.id}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let upload
  try {
    const formData = await req.formData()
    upload = await validateUpload(formData.get('file'), { maxBytes: MAX_BYTES, accept: ['image/jpeg', 'image/png', 'application/pdf'] })
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.status, err.message)
    return jsonError(400, 'Could not read the upload.')
  }

  try {
    const key = userFileKey(user.id, `${Date.now()}-${upload.safeName}`)
    await uploadToR2(key, upload.buffer, upload.mimeType)

    const document = await db.document.create({
      data: {
        userId: user.id,
        type: 'RECEIPT',
        fileName: upload.originalName,
        r2Key: key,
        mimeType: upload.mimeType,
        status: 'PENDING',
        reviewStatus: 'PENDING_REVIEW',
      },
    })

    const extracted = await extractStructured({
      task: 'receipt',
      schema: ReceiptSchema,
      maxTokens: 2048,
      content: [
        fileBlock(upload.buffer.toString('base64'), upload.mimeType),
        {
          type: 'text',
          text: 'Read this German receipt or invoice. amount is the total gross amount including VAT. vatRate is the VAT rate printed on it (0, 7 or 19); if several rates appear, use the one for the largest part. Use null for anything you cannot read with confidence.',
        },
      ],
    })
    const suggestion = extracted ? { ...extracted, vatRate: normaliseVatRate(extracted.vatRate) } : null

    await db.document.update({
      where: { id: document.id },
      data: suggestion ? { ocrData: suggestion, status: 'PROCESSED' } : { status: 'NEEDS_REVIEW' },
    })

    // Link to an open guidance case (non-critical)
    try {
      const openCase = await getMostRecentOpenCase(user.id)
      if (openCase) {
        await linkDocumentToCase(openCase.id, document.id, upload.originalName)
        await recomputeAndTrackConfidence(user.id, openCase.id)
      }
    } catch {
      // never fail the upload because of case linking
    }

    return NextResponse.json(
      { documentId: document.id, status: suggestion ? 'PROCESSED' : 'NEEDS_REVIEW', extracted: suggestion, requiresReview: true },
      { status: 201 }
    )
  } catch (err) {
    logError('Document upload error', err)
    return jsonError(500, 'Upload failed')
  }
}
