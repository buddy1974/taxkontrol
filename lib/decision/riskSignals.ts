import type { DecisionContext, RiskSignal } from './decisionTypes'

export function detectRiskSignals(ctx: DecisionContext, amount: number): RiskSignal[] {
  const signals: RiskSignal[] = []

  const taxShortfall = Math.max(0, ctx.taxOwed - ctx.taxReserved)
  if (taxShortfall > 100) {
    signals.push({
      code: 'LOW_TAX_RESERVE',
      label: 'Tax reserve below target',
      severity: taxShortfall > 500 ? 'HIGH' : 'MEDIUM',
      description: `Your tax reserve is approximately €${taxShortfall.toFixed(2)} below the estimated target. Tax bills can arrive once or twice a year.`,
    })
  }

  if (ctx.openCaseEscalated) {
    signals.push({
      code: 'ESCALATED_CASE',
      label: 'Open Finanzamt case (escalated)',
      severity: 'HIGH',
      description:
        'You have an escalated Finanzamt case. Large spending decisions should be reviewed carefully until this is resolved.',
    })
  } else if (ctx.openCaseCount > 0) {
    signals.push({
      code: 'OPEN_CASE',
      label: 'Open Finanzamt case',
      severity: 'MEDIUM',
      description:
        'You have an open Finanzamt case. Be cautious with large spending decisions until it is resolved.',
    })
  }

  if (ctx.totalPayables > 0) {
    signals.push({
      code: 'OUTSTANDING_PAYABLES',
      label: 'Outstanding supplier payments',
      severity: ctx.totalPayables > 1000 ? 'HIGH' : 'MEDIUM',
      description: `You owe approximately €${ctx.totalPayables.toFixed(2)} to suppliers. These obligations reduce your available balance.`,
    })
  }

  if (ctx.monthsWithData < 2 && ctx.totalTransactions < 5) {
    signals.push({
      code: 'INCOMPLETE_RECORDS',
      label: 'Records appear incomplete',
      severity: 'MEDIUM',
      description:
        'Your transaction records are limited. The safe-to-spend estimate may not reflect your full situation.',
    })
  }

  if (amount > ctx.safeToSpend && ctx.safeToSpend >= 0) {
    signals.push({
      code: 'EXCEEDS_SAFE_AMOUNT',
      label: 'Amount exceeds estimated available balance',
      severity: 'HIGH',
      description: `This amount (€${amount.toFixed(2)}) exceeds your estimated available balance of €${ctx.safeToSpend.toFixed(2)} after obligations.`,
    })
  }

  return signals
}
