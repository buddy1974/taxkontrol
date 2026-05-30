import type {
  DecisionContext,
  DecisionInput,
  DecisionResult,
  ConfidenceLevel,
  ResultLevel,
  RiskSignal,
  ObligationItem,
} from './decisionTypes'
import { DECISION_DISCLAIMERS } from './decisionDisclaimers'

function computeConfidence(ctx: DecisionContext): ConfidenceLevel {
  if (ctx.monthsWithData >= 3 && ctx.hasProfile && ctx.totalTransactions >= 10) return 'HIGH'
  if (ctx.monthsWithData >= 1 || ctx.hasProfile) return 'MEDIUM'
  return 'LOW'
}

function getPersonaExample(ctx: DecisionContext, input: DecisionInput): string {
  const bt = ctx.persona?.businessType ?? 'OTHER'
  const type = input.decisionType
  if (bt === 'DRIVER') {
    if (type === 'BUY_EQUIPMENT') return 'For example: new tyres, a GPS device, or vehicle repair.'
    if (type === 'SPEND') return 'For example: fuel, car wash, or parking fees.'
  }
  if (bt === 'RESTAURANT') {
    if (type === 'BUY_EQUIPMENT') return 'For example: a kitchen appliance or food storage unit.'
    if (type === 'SPEND') return 'For example: food supplies, cleaning products, or packaging.'
    if (type === 'HIRE_HELP') return 'For example: a part-time kitchen helper or delivery person.'
  }
  if (bt === 'CONSTRUCTION') {
    if (type === 'BUY_EQUIPMENT') return 'For example: tools, safety equipment, or a work vehicle accessory.'
    if (type === 'SPEND') return 'For example: building materials or site supplies.'
    if (type === 'PAY_SUPPLIER') return 'For example: a subcontractor or material supplier payment.'
  }
  if (bt === 'FREELANCER' || bt === 'CONSULTANT') {
    if (type === 'BUY_EQUIPMENT') return 'For example: a laptop, monitor, or software licence.'
    if (type === 'SPEND') return 'For example: software subscriptions or home office supplies.'
  }
  return ''
}

export function evaluateDecision(
  ctx: DecisionContext,
  input: DecisionInput,
  obligations: ObligationItem[],
  riskSignals: RiskSignal[]
): DecisionResult {
  const confidence = computeConfidence(ctx)
  const { amount } = input
  const { safeToSpend, taxType } = ctx

  const missingData: string[] = []
  if (ctx.monthsWithData < 2)
    missingData.push('Limited transaction history — fewer than 2 months of records found.')
  if (!ctx.hasProfile)
    missingData.push('Business profile not complete — guidance may be less accurate.')
  if (ctx.totalTransactions < 5)
    missingData.push('Very few transactions recorded — income and expense estimates may be incomplete.')
  if (ctx.currentMonthIncome === 0 && ctx.totalTransactions > 0)
    missingData.push('No income recorded this month — safe-to-spend estimate may be underestimated.')

  let resultLevel: ResultLevel
  const reasons: string[] = []

  if (confidence === 'LOW' && ctx.totalTransactions === 0) {
    resultLevel = 'INSUFFICIENT_DATA'
    reasons.push(
      'No transaction records found. TaxKontrol cannot estimate your available balance without income and expense data.'
    )
  } else if (amount > safeToSpend && (safeToSpend > 0 || ctx.currentMonthIncome > 0)) {
    resultLevel = 'NOT_RECOMMENDED'
    reasons.push(
      `This amount (€${amount.toFixed(2)}) appears to exceed your estimated available balance of €${safeToSpend.toFixed(2)} after deducting taxes, fixed costs, and obligations.`
    )
    if (ctx.openCaseEscalated)
      reasons.push('You have an escalated Finanzamt case. Large spending is not recommended until this is resolved.')
    if (ctx.taxOwed > ctx.taxReserved)
      reasons.push(
        `Your tax reserve may be short by approximately €${Math.max(0, ctx.taxOwed - ctx.taxReserved).toFixed(2)}.`
      )
    if (ctx.totalFixedCosts > 0)
      reasons.push(`Your estimated monthly fixed costs are €${ctx.totalFixedCosts.toFixed(2)}.`)
  } else if (
    amount > safeToSpend * 0.7 ||
    confidence === 'MEDIUM' ||
    missingData.length > 0 ||
    ctx.openCaseCount > 0 ||
    ctx.openCaseEscalated
  ) {
    resultLevel = 'CAUTION'
    if (amount > safeToSpend * 0.7 && safeToSpend > 0)
      reasons.push(
        `This amount represents a significant portion (${Math.round((amount / safeToSpend) * 100)}%) of your estimated available balance of €${safeToSpend.toFixed(2)}.`
      )
    if (confidence === 'MEDIUM')
      reasons.push('Your records are partially complete — this estimate may change as more data is added.')
    if (ctx.openCaseEscalated)
      reasons.push('You have an escalated Finanzamt case. Proceed cautiously with large decisions.')
    else if (ctx.openCaseCount > 0)
      reasons.push('You have open Finanzamt cases. Keep enough reserve to respond to any unexpected obligations.')
    if (ctx.taxOwed > ctx.taxReserved) {
      const shortfall = ctx.taxOwed - ctx.taxReserved
      reasons.push(
        `Your tax reserve may be short by approximately €${shortfall.toFixed(2)}. Consider setting this aside first.`
      )
    }
  } else {
    resultLevel = 'SAFE'
    reasons.push(
      `This amount (€${amount.toFixed(2)}) appears to be within your estimated available balance of €${safeToSpend.toFixed(2)}.`
    )
    if (ctx.taxOwed <= ctx.taxReserved) reasons.push('Your tax reserve appears to be on track.')
    if (ctx.totalPayables === 0) reasons.push('No outstanding supplier payments detected.')
    reasons.push('Based on your current records, this appears manageable.')
  }

  const personaExample = getPersonaExample(ctx, input)

  const summaryMap: Record<ResultLevel, string> = {
    SAFE: `Based on your current records, spending €${amount.toFixed(2)} for "${input.purpose}" appears manageable.`,
    CAUTION: `You may be able to spend €${amount.toFixed(2)} for "${input.purpose}", but your records are not fully complete or upcoming obligations may reduce your available amount. Review carefully before proceeding.`,
    NOT_RECOMMENDED: `Spending €${amount.toFixed(2)} for "${input.purpose}" is not recommended at this time. Your estimated available balance may not cover this amount after taxes and obligations.`,
    INSUFFICIENT_DATA: `TaxKontrol cannot give a useful estimate for "${input.purpose}" because important records are missing. Please add your income and expenses first.`,
  }

  const nextStepMap: Record<ResultLevel, string> = {
    SAFE: 'Review your obligations below before proceeding. For large or important purchases, confirm with your Steuerberater.',
    CAUTION: 'Complete your records first — add missing transactions and upload receipts. Then check if the estimate improves.',
    NOT_RECOMMENDED: 'Review your tax reserve, open payables, and fixed costs before spending this amount. Speak to your Steuerberater if needed.',
    INSUFFICIENT_DATA: 'Start by adding your income and expenses. Once you have records, this tool can give a more useful estimate.',
  }

  const disclaimerParts = [DECISION_DISCLAIMERS.BASE, DECISION_DISCLAIMERS.STEUERBERATER]
  if (taxType !== 'KLEINUNTERNEHMER') {
    disclaimerParts.push(DECISION_DISCLAIMERS.VAT_WARNING)
  }

  return {
    resultLevel,
    confidenceLevel: confidence,
    summary: summaryMap[resultLevel] + (personaExample ? ` ${personaExample}` : ''),
    reasons,
    missingData,
    obligations,
    riskSignals,
    nextStep: nextStepMap[resultLevel],
    disclaimer: disclaimerParts.join(' '),
    safeToSpend,
    whatIfRemaining: Math.max(0, safeToSpend - amount),
  }
}
