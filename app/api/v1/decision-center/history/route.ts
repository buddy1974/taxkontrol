import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'


export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const evaluations = await db.decisionEvaluation.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json(evaluations.map((e) => ({
    id: e.id,
    decisionType: e.decisionType,
    amount: Number(e.amount),
    purpose: e.purpose,
    note: e.note,
    resultLevel: e.resultLevel,
    confidenceLevel: e.confidenceLevel,
    summary: e.summary,
    reasons: e.reasons,
    missingData: e.missingData,
    obligations: e.obligations,
    riskSignals: e.riskSignals,
    createdAt: e.createdAt.toISOString(),
  })))
}
