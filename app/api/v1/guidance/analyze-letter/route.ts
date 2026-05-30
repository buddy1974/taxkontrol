import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/r2'
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

  const rl = await rateLimit(`guidance:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const userNote = (formData.get('note') as string | null) ?? ''

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'File too large. Maximum size is 10 MB.' }, { status: 413 })
    }

    const isImage = file.type.startsWith('image/')
    const isPdf = file.type === 'application/pdf'
    if (!isImage && !isPdf) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload JPG, PNG, or PDF.' },
        { status: 400 }
      )
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const key = `${user.id}/letters/${Date.now()}-${file.name.replace(/\s+/g, '-')}`
    await uploadToR2(key, buffer, file.type)

    const document = await db.document.create({
      data: {
        userId: user.id,
        type: 'OTHER',
        fileName: file.name,
        r2Key: key,
        mimeType: file.type,
        status: 'PENDING',
      },
    })

    // OCR
    let ocrText = userNote
    const base64 = buffer.toString('base64')

    try {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY!,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2048,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: isImage ? 'image' : 'document',
                  source: { type: 'base64', media_type: file.type, data: base64 },
                },
                {
                  type: 'text',
                  text: 'Extract all readable text from this document. Output only the raw extracted text, no commentary or formatting. Preserve German characters (ä, ö, ü, ß) exactly.',
                },
              ],
            },
          ],
        }),
      })

      if (aiRes.ok) {
        const aiData = await aiRes.json()
        const extracted = (aiData.content?.[0]?.text ?? '').trim()
        if (extracted) ocrText = extracted + (userNote ? `\n\n${userNote}` : '')
      }
    } catch {
      // OCR failed — continue with userNote only
    }

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
    console.error('Guidance analyze-letter error:', err)
    return NextResponse.json({ error: 'Analysis failed. Please try again.' }, { status: 500 })
  }
}
