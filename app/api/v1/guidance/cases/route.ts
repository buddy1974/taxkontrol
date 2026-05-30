import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { updateCaseStatus } from '@/lib/guidance/caseManager'
import type { GuidanceCaseStatus } from '@prisma/client'

const VALID_STATUSES: GuidanceCaseStatus[] = [
  'OPEN',
  'ACTION_REQUIRED',
  'WAITING_FOR_DOCUMENTS',
  'READY_FOR_REVIEW',
  'ESCALATED',
  'RESOLVED',
]

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { caseId, status, reason } = await req.json() as {
      caseId: string
      status: string
      reason?: string
    }

    if (!caseId || !status) {
      return NextResponse.json({ error: 'caseId and status are required' }, { status: 400 })
    }

    if (!VALID_STATUSES.includes(status as GuidanceCaseStatus)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Verify ownership
    const existing = await db.guidanceCase.findFirst({
      where: { id: caseId, userId: user.id },
      select: { id: true },
    })

    if (!existing) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    await updateCaseStatus(caseId, status as GuidanceCaseStatus, reason)

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('Case status update error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
