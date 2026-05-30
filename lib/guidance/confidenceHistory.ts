import { db } from '@/lib/db'
import { buildUserContext } from './buildUserContext'
import { computeConfidence } from './confidence'
import type { Prisma } from '@prisma/client'

const LEVELS: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 }

export async function recomputeAndTrackConfidence(
  userId: string,
  caseId: string
): Promise<{ improved: boolean; oldLevel: string; newLevel: string }> {
  const now = new Date()
  const currentMonth = now.getMonth() + 1

  const [userCtx, existingCase] = await Promise.all([
    buildUserContext(userId),
    db.guidanceCase.findUnique({
      where: { id: caseId },
      select: { confidenceLevel: true, status: true },
    }),
  ])

  if (!existingCase || existingCase.status === 'RESOLVED') {
    return { improved: false, oldLevel: 'LOW', newLevel: 'LOW' }
  }

  const newConfidence = computeConfidence(userCtx, currentMonth)
  const oldLevel = existingCase.confidenceLevel
  const newLevel = newConfidence.level

  const oldScore = LEVELS[oldLevel] ?? 0
  const newScore = LEVELS[newLevel] ?? 0
  const improved = newScore > oldScore
  const worsened = newScore < oldScore

  await db.guidanceCase.update({
    where: { id: caseId },
    data: { confidenceLevel: newLevel },
  })

  if (improved) {
    await db.guidanceCaseEvent.create({
      data: {
        caseId,
        eventType: 'CONFIDENCE_IMPROVED',
        title: 'Record confidence improved',
        description: `Your preparation confidence improved from ${oldLevel} to ${newLevel} (${newConfidence.score}/100). Keep adding records to continue improving.`,
        metadata: {
          oldLevel,
          newLevel,
          score: newConfidence.score,
        } satisfies Prisma.InputJsonValue,
      },
    })
  } else if (worsened) {
    await db.guidanceCaseEvent.create({
      data: {
        caseId,
        eventType: 'STATUS_CHANGED',
        title: 'Record confidence changed',
        description: `Confidence changed from ${oldLevel} to ${newLevel}. This may affect guidance quality for this case.`,
        metadata: {
          oldLevel,
          newLevel,
          score: newConfidence.score,
        } satisfies Prisma.InputJsonValue,
      },
    })
  }

  return { improved, oldLevel, newLevel }
}
