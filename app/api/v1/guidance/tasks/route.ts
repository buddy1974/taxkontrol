import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { buildUserContext, getPersonaProfile } from '@/lib/guidance/buildUserContext'
import { detectMissingData } from '@/lib/guidance/missingData'
import { getOpenCases } from '@/lib/guidance/caseManager'
import { getOpenIssues } from '@/lib/guidance/openIssues'
import { buildPersonaContext } from '@/lib/guidance/personaContext'
import { computeProfileCompleteness } from '@/lib/guidance/profileCompleteness'
import { generateTaskCandidates } from '@/lib/guidance/taskEngine'
import type {
  GuidanceTaskCategory,
  GuidanceTaskPriority,
  GuidanceTaskStatus,
  TaskCandidate,
} from '@/lib/guidance/guidanceTypes'
import type { Prisma } from '@prisma/client'

const VALID_STATUSES: GuidanceTaskStatus[] = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED']

// Upsert a task candidate: create if missing, refresh title/description if still OPEN/IN_PROGRESS
async function syncCandidate(userId: string, candidate: TaskCandidate): Promise<void> {
  const existing = await db.guidanceTask.findUnique({
    where: { userId_taskKey: { userId, taskKey: candidate.taskKey } },
    select: { id: true, status: true },
  })

  if (!existing) {
    await db.guidanceTask.create({
      data: {
        userId,
        caseId: candidate.caseId ?? null,
        taskKey: candidate.taskKey,
        title: candidate.title,
        description: candidate.description,
        status: 'OPEN',
        priority: candidate.priority as GuidanceTaskPriority,
        category: candidate.category as GuidanceTaskCategory,
        relatedSection: candidate.relatedSection ?? null,
      },
    })
  } else if (existing.status === 'OPEN' || existing.status === 'IN_PROGRESS') {
    await db.guidanceTask.update({
      where: { id: existing.id },
      data: {
        title: candidate.title,
        description: candidate.description,
        priority: candidate.priority as GuidanceTaskPriority,
        relatedSection: candidate.relatedSection ?? null,
      },
    })
  }
  // COMPLETED / DISMISSED: leave untouched
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = user.id
  const now = new Date()
  const currentMonth = now.getMonth() + 1

  const [userCtx, personaProfileRaw, openCases] = await Promise.all([
    buildUserContext(userId),
    getPersonaProfile(userId),
    getOpenCases(userId),
  ])

  const personaCtx = buildPersonaContext(personaProfileRaw)
  const missingData = detectMissingData(userCtx, currentMonth)
  const openIssues = await getOpenIssues(userId)
  const profileCompleteness = computeProfileCompleteness(personaProfileRaw)

  const candidates = generateTaskCandidates(
    userCtx,
    personaCtx,
    missingData,
    openCases,
    profileCompleteness
  )

  // Sync candidates to DB in sequence to avoid race conditions
  for (const candidate of candidates) {
    await syncCandidate(userId, candidate)
  }

  const tasks = await db.guidanceTask.findMany({
    where: { userId, status: { not: 'DISMISSED' } },
    orderBy: [
      { status: 'asc' },
      { priority: 'asc' },
      { createdAt: 'asc' },
    ],
  })

  return NextResponse.json(tasks)
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { taskId, status } = await req.json() as { taskId: string; status: string }

    if (!taskId || !status) {
      return NextResponse.json({ error: 'taskId and status are required' }, { status: 400 })
    }
    if (!VALID_STATUSES.includes(status as GuidanceTaskStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    const task = await db.guidanceTask.findFirst({
      where: { id: taskId, userId: user.id },
      select: { id: true, caseId: true, title: true, status: true },
    })

    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 })

    const updateData: Prisma.GuidanceTaskUpdateInput = {
      status: status as GuidanceTaskStatus,
      ...(status === 'COMPLETED' && { completedAt: new Date() }),
    }

    await db.guidanceTask.update({ where: { id: task.id }, data: updateData })

    // Create case timeline event when a case-linked task is completed
    if (status === 'COMPLETED' && task.caseId) {
      await db.guidanceCaseEvent.create({
        data: {
          caseId: task.caseId,
          eventType: 'STATUS_CHANGED',
          title: 'Task completed',
          description: `Task completed: "${task.title}"`,
        },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Task update error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
