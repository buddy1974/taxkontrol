export type JobcenterPeriodResult = {
  periodStart: Date
  periodEnd: Date
  totalIncome: number
  totalExpenses: number
  netProfit: number
  freibetrag: number
  anrechenbares: number
  buergerGeldImpact: string
}

export function calculateJobcenterPeriod(
  totalIncome: number,
  totalExpenses: number,
  periodStart: Date,
  periodEnd: Date,
  freibetrag: number = 100
): JobcenterPeriodResult {
  const netProfit = totalIncome - totalExpenses
  const anrechenbares = Math.max(0, (netProfit - freibetrag) * 0.3)

  let buergerGeldImpact: string
  if (anrechenbares === 0) {
    buergerGeldImpact = 'Your income does not affect your Bürgergeld this period.'
  } else if (anrechenbares < 200) {
    buergerGeldImpact = `Your Bürgergeld may be reduced by approximately €${anrechenbares.toFixed(2)} this period.`
  } else {
    buergerGeldImpact = `Your Bürgergeld may be significantly reduced by €${anrechenbares.toFixed(2)}. Contact your Jobcenter.`
  }

  return {
    periodStart,
    periodEnd,
    totalIncome,
    totalExpenses,
    netProfit,
    freibetrag,
    anrechenbares,
    buergerGeldImpact,
  }
}
