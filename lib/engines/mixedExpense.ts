export type MixedExpenseResult = {
  grossAmount: number
  netAmount: number
  vatAmount: number
  businessPct: number
  privatePct: number
  businessAmount: number
  privateAmount: number
  businessVat: number
}

export function splitMixedExpense(
  grossAmount: number,
  vatRate: number,
  businessPct: number
): MixedExpenseResult {
  const vatMultiplier = 1 + vatRate / 100
  const netAmount = grossAmount / vatMultiplier
  const vatAmount = grossAmount - netAmount
  const privatePct = 100 - businessPct
  const businessAmount = parseFloat((netAmount * businessPct / 100).toFixed(2))
  const privateAmount = parseFloat((netAmount * privatePct / 100).toFixed(2))
  const businessVat = parseFloat((vatAmount * businessPct / 100).toFixed(2))

  return {
    grossAmount,
    netAmount: parseFloat(netAmount.toFixed(2)),
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    businessPct,
    privatePct,
    businessAmount,
    privateAmount,
    businessVat,
  }
}
