import { requireFeature } from '@/lib/entitlements'
import { logError } from '@/lib/log'
import { EntitlementFeature } from '@prisma/client'
import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { uploadToR2, userFileKey } from '@/lib/r2'
import { validateUpload, UploadError } from '@/lib/upload'
import { extractText, fileBlock } from '@/lib/ai/claude'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import {
  analyzeLetter,
  buildInterpretedMeaning,
  buildEducationalNotice,
  buildEscalationReason,
  hasLegalEnforcementLanguage,
} from '@/lib/guidance/analyzeLetter'
import { buildUserContext } from '@/lib/guidance/buildUserContext'
import { computeConfidence } from '@/lib/guidance/confidence'
import { detectMissingData } from '@/lib/guidance/missingData'
import { computePreparationScore } from '@/lib/guidance/preparationScore'
import { buildSuggestedActions } from '@/lib/guidance/suggestedActions'
import { getStandardDisclaimer } from '@/lib/guidance/disclaimers'
import { extractDeadlines, pickEarliestDeadline } from '@/lib/guidance/extractDeadlines'
import { createGuidanceCase, getPreviousCaseContext } from '@/lib/guidance/caseManager'
import type { GuidanceAnalysisResponse } from '@/lib/guidance/guidanceTypes'

const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gate = await requireFeature(user.id, EntitlementFeature.FINANZAMT)
  if (gate) return gate

  const rl = await rateLimit(`guidance:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const rawNote = formData.get('note')
    const userNote = typeof rawNote === 'string' ? rawNote.slice(0, 2000) : ''

    let upload
    try {
      upload = await validateUpload(file, { maxBytes: MAX_BYTES, accept: ['image/jpeg', 'image/png', 'application/pdf'] })
    } catch (err) {
      if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: err.status })
      throw err
    }

    const key = userFileKey(user.id, 'letters', `${Date.now()}-${upload.safeName}`)
    await uploadToR2(key, upload.buffer, upload.mimeType)

    const document = await db.document.create({
      data: {
        userId: user.id,
        type: 'OTHER',
        fileName: upload.originalName,
        r2Key: key,
        mimeType: upload.mimeType,
        status: 'PENDING',
      },
    })

    // OCR (text only — the analysis below is rule-based)
    const extracted = await extractText({
      task: 'letter-ocr',
      content: [
        fileBlock(upload.buffer.toString('base64'), upload.mimeType),
        {
          type: 'text',
          text: 'Extract all readable text from this document. Output only the raw extracted text, no commentary or formatting. Preserve German characters (ä, ö, ü, ß) exactly.',
        },
      ],
    })
    const ocrText = extracted ? extracted + (userNote ? `\n\n${userNote}` : '') : userNote

    await db.document.update({
      where: { id: document.id },
      data: {
        ocrText: ocrText || null,
        status: ocrText ? 'PROCESSED' : 'NEEDS_REVIEW',
      },
    })

    const now = new Date()
    const currentMonth = now.getMonth() + 1

    // Build context and run pipeline
    const [userCtx, previousCases] = await Promise.all([
      buildUserContext(user.id),
      getPreviousCaseContext(user.id),
    ])

    const letterAnalysis = analyzeLetter(ocrText, userCtx, currentMonth)
    const confidence = computeConfidence(userCtx, currentMonth)
    const missingData = detectMissingData(userCtx, currentMonth)
    const preparationStatus = computePreparationScore(userCtx, currentMonth)
    const suggestedActions = buildSuggestedActions(userCtx, missingData, letterAnalysis.detectedType)

    const interpretedMeaning = buildInterpretedMeaning(
      letterAnalysis.detectedType,
      letterAnalysis.urgency
    )
    const educationalNotice = buildEducationalNotice(letterAnalysis.detectedType)
    const legalLanguage = hasLegalEnforcementLanguage(ocrText)
    const escalationReason = buildEscalationReason(
      letterAnalysis.detectedType,
      letterAnalysis.urgency,
      confidence.level,
      legalLanguage
    )
    const escalationRecommended =
      letterAnalysis.escalationRecommended || legalLanguage || confidence.level === 'LOW'

    // Extract deadlines
    const deadlines = extractDeadlines(ocrText)
    const earliestDeadline = pickEarliestDeadline(deadlines)

    // Build continuity memory note
    const openPreviousCases = previousCases.filter(
      c => c.status !== 'RESOLVED' && c.status !== 'READY_FOR_REVIEW'
    )

    const missingDocuments = missingData
      .map(d => d.description)
      .concat(letterAnalysis.requestedDocuments.map(d => `Requested by Finanzamt: ${d}`))

    const response: GuidanceAnalysisResponse & {
      detectedLetterType: string
      caseId?: string
      extractedDeadline?: string
      previousOpenCases?: Array<{ title: string; status: string; openedAt: Date }>
    } = {
      summary: letterAnalysis.summary,
      interpretedMeaning,
      urgency: letterAnalysis.urgency,
      confidence,
      preparationStatus,
      missingDocuments,
      missingData,
      suggestedActions,
      suggestedSections: letterAnalysis.suggestedSections,
      estimatedReadiness: preparationStatus.score,
      escalationRecommended,
      escalationReason,
      educationalNotice,
      disclaimer: getStandardDisclaimer(),
      detectedLetterType: letterAnalysis.detectedType,
      extractedDeadline: earliestDeadline
        ? earliestDeadline.date.toLocaleDateString('de-DE')
        : undefined,
      previousOpenCases:
        openPreviousCases.length > 0
          ? openPreviousCases.map(c => ({
              title: c.title,
              status: c.status,
              openedAt: c.openedAt,
            }))
          : undefined,
    }

    // Create persistent case record
    try {
      const caseId = await createGuidanceCase(
        user.id,
        document.id,
        response,
        earliestDeadline
      )
      response.caseId = caseId
    } catch {
      // Case creation failed — don't fail the whole request
    }

    return NextResponse.json(response, { status: 200 })
  } catch (err) {
    logError('Guidance analyze-letter error', err)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
