/**
 * Aggregates transactions into the figures every screen uses. Pure: callers
 * load rows, this module does the maths. All amounts are integer cents.
 */
import { computeTransactionAmounts, type TaxType, type TxType, type Usage } from './transactionAmounts'
import type { MoneyInput } from './money'

export interface TransactionRow {
  id?: string
  type: TxType
  grossAmount: MoneyInput
  vatRate: MoneyInput
  usage: Usage
  businessPct: number
  transactionDate: Date
  merchant?: string | null
  description?: string | null
  needsReview?: boolean
}

export interface TransactionTotals {
  count: number
  /** Business income received, incl. VAT (cash). */
  businessIncomeGrossCents: number
  /** Business income without VAT — this is income for profit. */
  businessIncomeNetCents: number
  /** VAT charged on business income (Regelbesteuerung only). */
  outputVatCents: number
  /** Private deposits, loans, private refunds — not income. */
  nonBusinessInflowCents: number
  /** Incoming money not yet classified — excluded from profit. */
  unclearInflowCents: number
  /** Everything paid out (all expenses, gross). */
  outflowGrossCents: number
  /** Deductible business expenses (net for Regelbesteuerung, gross for Kleinunternehmer). */
  deductibleExpenseCents: number
  /** Deductible input VAT (Vorsteuer). */
  inputVatCents: number
  /** Private share of payments (Privatentnahmen). */
  privateOutflowCents: number
  /** Payments not yet classified — not deductible until clarified. */
  unclearOutflowCents: number
  /** Business profit = net business income − deductible expenses. */
  profitCents: number
  /** VAT payable to the Finanzamt (output VAT − input VAT); can be negative (refund). */
  vatPayableCents: number
  /** Business cash receipts minus business cash expenses (Jobcenter cash basis). */
  businessReceiptsCents: number
  businessExpensesPaidCents: number
  needsReviewCount: number
}

export function emptyTotals(): TransactionTotals {
  return {
    count: 0,
    businessIncomeGrossCents: 0,
    businessIncomeNetCents: 0,
    outputVatCents: 0,
    nonBusinessInflowCents: 0,
    unclearInflowCents: 0,
    outflowGrossCents: 0,
    deductibleExpenseCents: 0,
    inputVatCents: 0,
    privateOutflowCents: 0,
    unclearOutflowCents: 0,
    profitCents: 0,
    vatPayableCents: 0,
    businessReceiptsCents: 0,
    businessExpensesPaidCents: 0,
    needsReviewCount: 0,
  }
}

export function summarizeTransactions(rows: TransactionRow[], taxType: TaxType): TransactionTotals {
  const t = emptyTotals()
  for (const row of rows) {
    const a = computeTransactionAmounts(
      {
        type: row.type,
        grossAmount: row.grossAmount,
        vatRate: row.vatRate,
        usage: row.usage,
        businessPct: row.businessPct,
        taxType,
      },
      false
    )
    t.count++
    if (a.needsReview || row.needsReview) t.needsReviewCount++
    if (row.type === 'INCOME') {
      if (a.usage === 'BUSINESS') {
        t.businessIncomeGrossCents += a.grossCents
        t.businessIncomeNetCents += a.businessCents
        t.outputVatCents += a.outputVatCents
      }
      t.nonBusinessInflowCents += a.privateCents
      t.unclearInflowCents += a.unclearCents
    } else {
      t.outflowGrossCents += a.grossCents
      t.deductibleExpenseCents += a.businessCents
      t.inputVatCents += a.deductibleVatCents
      t.privateOutflowCents += a.usage === 'UNSURE' ? 0 : a.privateCents
      t.unclearOutflowCents += a.unclearCents
    }
  }
  t.profitCents = t.businessIncomeNetCents - t.deductibleExpenseCents
  t.vatPayableCents = taxType === 'KLEINUNTERNEHMER' ? 0 : t.outputVatCents - t.inputVatCents
  t.businessReceiptsCents = t.businessIncomeGrossCents
  t.businessExpensesPaidCents = t.deductibleExpenseCents + t.inputVatCents
  return t
}
