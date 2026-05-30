import { db } from '@/lib/db'
import type {
  CaseSummary,
  GuidanceAnalysisResponse,
  PreviousCaseContext,
} from './guidanceTypes'
import type { ExtractedDeadline } from './guidanceTypes'
import type {
  GuidanceCaseType,
  GuidanceCaseStatus,
  GuidanceCaseEventType,
  Prisma,
} from '@prisma/client'

function letterTypeToCaseType(letterType: string | undefined): GuidanceCaseType {
  switch (letterType) {
    case 'REQUEST_DOCUMENTS': return 'DOCUMENT_REQUEST'
    case 'PAYMENT_REMINDER': return 'PAYMENT'
    case 'TAX_ESTIMATE': return 'FINANZAMT'
    case 'MISSING_DECLARATION': return 'FINANZAMT'
    default: return 'OTHER'
  }
}

function deriveStatus(
  analysis: GuidanceAnalysisResponse
): GuidanceCaseStatus {
  if (analysis.escalationRecommended) return 'ESCALATED'
  const hasBlocking = analysis.missingData.some(d => d.severity === 'blocking')
  if (hasBlocking) return 'WAITING_FOR_DOCUMENTS'
  if (
    analysis.confidence.level === 'HIGH' &&
    (analysis.preparationStatus.status === 'GOOD' || analysis.preparationStatus.status === 'READY')
  ) return 'READY_FOR_REVIEW'
  return 'ACTION_REQUIRED'
}

function buildCaseTitle(letterType: string | undefined, now: Date): string {
  const month = now.toLocaleString('en-DE', { month: 'long', year: 'numeric' })
  switch (letterType) {
    case 'REQUEST_DOCUMENTS': return `Document Request — ${month}`
    case 'PAYMENT_REMINDER': return `Payment Reminder — ${month}`
    case 'TAX_ESTIMATE': return `Tax Estimate — ${month}`
    case 'MISSING_DECLARATION': return `Missing Declaration — ${month}`
    default: return `Finanzamt Letter — ${month}`
  }
}

export async function createGuidanceCase(
  userId: string,
  documentId: string,
  analysis: GuidanceAnalysisResponse,
  deadline: ExtractedDeadline | null
): Promise<string> {
  const now = new Date()
  const status = deriveStatus(analysis)
  const caseType = letterTypeToCaseType(analysis.missingData[0]?.type as string | undefined)
  const letterCaseType = letterTypeToCaseType(
    (analysis as GuidanceAnalysisResponse & { detectedLetterType?: string }).detectedLetterType
  )

  const guidanceCase = await db.guidanceCase.create({
    data: {
      userId,
      title: buildCaseTitle(
        (analysis as GuidanceAnalysisResponse & { detectedLetterType?: string }).detectedLetterType,
        now
      ),
      caseType: letterCaseType,
      status,
      urgency: analysis.urgency,
      confidenceLevel: analysis.confidence.level,
      preparationStatus: analysis.preparationStatus.status,
      escalationRecommended: analysis.escalationRecommended,
      summary: analysis.summary,
      detectedLetterType:
        (analysis as GuidanceAnalysisResponse & { detectedLetterType?: string }).detectedLetterType ??
        null,
      latestDeadline: deadline?.date ?? null,
      documentId,
    },
  })

  const events: Array<{
    caseId: string
    eventType: GuidanceCaseEventType
    title: string
    description: string
    metadata?: Prisma.InputJsonValue
  }> = []

  events.push({
    caseId: guidanceCase.id,
    eventType: 'LETTER_UPLOADED',
    title: 'Letter uploaded',
    description: 'A Finanzamt letter was uploaded and queued for analysis.',
  })

  events.push({
    caseId: guidanceCase.id,
    eventType: 'OCR_COMPLETED',
    title: 'Text extracted from letter',
    description: `Letter classified as: ${(analysis as GuidanceAnalysisResponse & { detectedLetterType?: string }).detectedLetterType ?? 'Unknown'}. Urgency: ${analysis.urgency}.`,
    metadata: {
      confidenceScore: analysis.confidence.score,
      detectedLetterType:
        (analysis as GuidanceAnalysisResponse & { detectedLetterType?: string }).detectedLetterType,
    },
  })

  if (deadline) {
    events.push({
      caseId: guidanceCase.id,
      eventType: 'DEADLINE_DETECTED',
      title: 'Deadline identified',
      description: `A deadline was found in the letter: ${deadline.date.toLocaleDateString('de-DE')} (${deadline.rawText}).`,
      metadata: { deadline: deadline.date.toISOString(), confidence: deadline.confidence },
    })
  }

  for (const item of analysis.missingData.filter(d => d.severity === 'blocking')) {
    events.push({
      caseId: guidanceCase.id,
      eventType: 'DOCUMENT_MISSING',
      title: 'Missing records detected',
      description: item.description,
      metadata: { missingType: item.type, affectedPeriod: item.affectedPeriod },
    })
  }

  if (analysis.escalationRecommended) {
    events.push({
      caseId: guidanceCase.id,
      eventType: 'ESCALATION_RECOMMENDED',
      title: 'Professional review recommended',
      description: analysis.escalationReason ?? 'This case should be reviewed by a Steuerberater before you respond.',
    })
  }

  await db.guidanceCaseEvent.createMany({ data: events })

  return guidanceCase.id
}

export async function getOpenCases(userId: string): Promise<CaseSummary[]> {
  const cases = await db.guidanceCase.findMany({
    where: {
      userId,
      status: { not: 'RESOLVED' },
    },
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: {
      events: {
        orderBy: { createdAt: 'desc' },
        take: 3,
        select: { eventType: true, title: true, createdAt: true },
      },
    },
  })

  return cases.map(c => ({
    id: c.id,
    title: c.title,
    caseType: c.caseType,
    status: c.status,
    urgency: c.urgency,
    confidenceLevel: c.confidenceLevel,
    escalationRecommended: c.escalationRecommended,
    summary: c.summary,
    detectedLetterType: c.detectedLetterType,
    latestDeadline: c.latestDeadline,
    openedAt: c.openedAt,
    updatedAt: c.updatedAt,
    recentEvents: c.events.map(e => ({
      eventType: e.eventType,
      title: e.title,
      createdAt: e.createdAt,
    })),
  }))
}

export async function getUpcomingDeadlines(userId: string) {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() + 30)

  return db.guidanceCase.findMany({
    where: {
      userId,
      status: { not: 'RESOLVED' },
      latestDeadline: { gte: new Date(), lte: cutoff },
    },
    orderBy: { latestDeadline: 'asc' },
    select: {
      id: true,
      title: true,
      latestDeadline: true,
      urgency: true,
      status: true,
    },
  })
}

export async function getPreviousCaseContext(userId: string): Promise<PreviousCaseContext[]> {
  const cases = await db.guidanceCase.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      detectedLetterType: true,
      status: true,
      openedAt: true,
    },
  })

  return cases.map(c => ({
    caseId: c.id,
    title: c.title,
    detectedLetterType: c.detectedLetterType,
    status: c.status,
    openedAt: c.openedAt,
  }))
}

export async function getCaseDetail(caseId: string, userId: string) {
  return db.guidanceCase.findFirst({
    where: { id: caseId, userId },
    include: {
      events: { orderBy: { createdAt: 'asc' } },
    },
  })
}

export async function getMostRecentOpenCase(userId: string) {
  return db.guidanceCase.findFirst({
    where: {
      userId,
      status: { not: 'RESOLVED' },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, confidenceLevel: true, status: true, title: true },
  })
}

export async function linkDocumentToCase(
  caseId: string,
  documentId: string,
  fileName: string
): Promise<void> {
  await db.guidanceCaseEvent.create({
    data: {
      caseId,
      eventType: 'USER_UPLOADED_RECEIPT',
      title: 'Document uploaded',
      description: `File "${fileName}" was uploaded and linked to this case.`,
      metadata: { documentId },
    },
  })
}

export async function updateCaseStatus(
  caseId: string,
  status: GuidanceCaseStatus,
  reason?: string
): Promise<void> {
  await db.guidanceCase.update({
    where: { id: caseId },
    data: {
      status,
      resolvedAt: status === 'RESOLVED' ? new Date() : undefined,
    },
  })

  await db.guidanceCaseEvent.create({
    data: {
      caseId,
      eventType: status === 'RESOLVED' ? 'CASE_RESOLVED' : 'STATUS_CHANGED',
      title: `Status changed to ${status.replace(/_/g, ' ').toLowerCase()}`,
      description: reason ?? `Case status updated to ${status}.`,
    },
  })
}
