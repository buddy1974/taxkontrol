export type TaxSplitResult = {
  grossAmount: number
  vatAmount: number
  netAmount: number
  incomeTaxReserve: number
  userAmount: number
  vatRate: number
  incomeTaxRate: number
}

export function calculateTaxSplit(
  grossAmount: number,
  vatRate: number = 19,
  incomeTaxRate: number = 30
): TaxSplitResult {
  const vatMultiplier = 1 + vatRate / 100
  const netAmount = grossAmount / vatMultiplier
  const vatAmount = grossAmount - netAmount
  const incomeTaxReserve = netAmount * (incomeTaxRate / 100)
  const userAmount = netAmount - incomeTaxReserve

  return {
    grossAmount,
    vatAmount: parseFloat(vatAmount.toFixed(2)),
    netAmount: parseFloat(netAmount.toFixed(2)),
    incomeTaxReserve: parseFloat(incomeTaxReserve.toFixed(2)),
    userAmount: parseFloat(userAmount.toFixed(2)),
    vatRate,
    incomeTaxRate,
  }
}

export function formatTaxSplit(result: TaxSplitResult): string {
  return `Of €${result.grossAmount.toFixed(2)}: €${result.vatAmount.toFixed(2)} VAT → Finanzamt, €${result.incomeTaxReserve.toFixed(2)} income tax reserve, €${result.userAmount.toFixed(2)} is yours`
}
