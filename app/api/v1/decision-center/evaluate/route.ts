import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { buildDecisionContext } from '@/lib/decision/buildDecisionContext'
import { buildObligationForecast } from '@/lib/decision/obligationForecast'
import { detectRiskSignals } from '@/lib/decision/riskSignals'
import { evaluateDecision } from '@/lib/decision/safeToSpendDecision'
import type { DecisionInput } from '@/lib/decision/decisionTypes'


export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: Partial<DecisionInput>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { amount, purpose, note, decisionType } = body

  if (!amount || amount <= 0)
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  if (!purpose || purpose.trim().length === 0)
    return NextResponse.json({ error: 'Purpose is required' }, { status: 400 })
  if (!decisionType)
    return NextResponse.json({ error: 'Decision type is required' }, { status: 400 })

  const input: DecisionInput = { amount, purpose: purpose.trim(), note, decisionType }

  const ctx = await buildDecisionContext(user.id)
  const obligations = await buildObligationForecast(
    user.id,
    ctx.taxOwed,
    ctx.taxReserved,
    ctx.totalFixedCosts,
    ctx.totalSalaries
  )
  const riskSignals = detectRiskSignals(ctx, amount)
  const result = evaluateDecision(ctx, input, obligations, riskSignals)

  // Save evaluation
  const saved = await db.decisionEvaluation.create({
    data: {
      userId: user.id,
      decisionType,
      amount,
      purpose: input.purpose,
      note: note ?? null,
      resultLevel: result.resultLevel,
      confidenceLevel: result.confidenceLevel,
      summary: result.summary,
      reasons: result.reasons,
      missingData: result.missingData.length > 0 ? JSON.parse(JSON.stringify(result.missingData)) : undefined,
      obligations: result.obligations.length > 0 ? JSON.parse(JSON.stringify(result.obligations)) : undefined,
      riskSignals: result.riskSignals.length > 0 ? JSON.parse(JSON.stringify(result.riskSignals)) : undefined,
    },
  })

  // Generate guidance tasks for risky decisions (upsert = create once, ignore if exists)
  if (result.resultLevel === 'CAUTION' || result.resultLevel === 'NOT_RECOMMENDED') {
    const upsertTask = async (
      taskKey: string,
      title: string,
      description: string,
      priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
      category: 'UPLOAD_DOCUMENT' | 'ADD_TRANSACTION' | 'CATEGORIZE_EXPENSE' | 'COMPLETE_PROFILE' | 'REVIEW_REPORT' | 'CONTACT_STEUERBERATER' | 'RESOLVE_CASE' | 'OTHER',
      relatedSection: string
    ) => {
      await db.guidanceTask.upsert({
        where: { userId_taskKey: { userId: user.id, taskKey } },
        create: { userId: user.id, taskKey, title, description, status: 'OPEN', priority, category, relatedSection },
        update: {},
      })
    }

    if (result.missingData.length > 0) {
      await upsertTask(
        'decision-upload-missing-records',
        'Upload missing records to improve your financial estimate',
        'A recent decision check found incomplete records. Adding transactions and receipts will improve the accuracy of your available balance estimate.',
        'MEDIUM', 'UPLOAD_DOCUMENT', '/input'
      )
    }
    if (result.riskSignals.some(s => s.code === 'LOW_TAX_RESERVE')) {
      await upsertTask(
        'decision-review-tax-reserve',
        'Review your tax reserve before making large purchases',
        'Your tax reserve appears below the estimated target. Consider setting aside the shortfall before committing to large spending decisions.',
        'HIGH', 'REVIEW_REPORT', '/tax'
      )
    }
    if (result.riskSignals.some(s => s.code === 'ESCALATED_CASE')) {
      await upsertTask(
        'decision-consult-steuerberater',
        'Consult a Steuerberater before this purchase',
        'You have an escalated Finanzamt case. For large spending decisions, speak with a Steuerberater first.',
        'HIGH', 'CONTACT_STEUERBERATER', '/guidance'
      )
    }
  }

  return NextResponse.json({ ...result, evaluationId: saved.id })
}
