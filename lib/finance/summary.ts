/**
 * Aggregates transactions into the figures every screen uses. Pure: callers
 * load rows, this module does the maths. All amounts are integer cents.
 */
import { computeTransactionAmounts, type TaxType, type TxType, type Usage } from './transactionAmounts'
import type { MoneyInput } from './money'
import { taxTypeResolver, type TaxTypeSource } from './taxStatus'

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
  /** Payment to (EXPENSE) / refund from (INCOME) the Finanzamt for this tax. */
  taxPaymentType?: 'VAT' | 'INCOME_TAX' | 'TRADE_TAX' | null
  /** Start of the tax period that payment belongs to. */
  taxPeriodStart?: Date | null
  /** Payment of this customer invoice (Soll: its VAT is counted with the invoice). */
  receivableId?: string | null
  /**
   * Date whose tax status applies, when not the booking date: a payment of an invoice is
   * taxed with the status valid when the invoice was issued (§20 S. 3 UStG — a status switch
   * must neither tax a sale twice nor leave it untaxed).
   */
  statusDate?: Date | null
}

/** VAT rate assumed for business income whose rate is not confirmed (see ASSUMED_VAT). */
export const ASSUMED_STANDARD_VAT_RATE = 19

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
  /** VAT paid to the Finanzamt minus VAT refunded by it (not a business expense for profit). */
  vatPaidToFinanzamtCents: number
  /** Income tax (incl. prepayments) paid minus refunded — never deductible (§12 Nr. 3 EStG). */
  incomeTaxPaidCents: number
  /** Business income rows whose VAT rate is unconfirmed and was assumed at 19 %. */
  assumedVatCount: number
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
    vatPaidToFinanzamtCents: 0,
    incomeTaxPaidCents: 0,
    assumedVatCount: 0,
  }
}

export interface SummaryOptions {
  /**
   * VAT-registered users: business income still flagged for review with 0 % VAT
   * (rate unknown — e.g. a bank import or a customer payment without a rate) is
   * counted at 19 %. Assuming 0 % would understate the VAT owed and overstate
   * profit; 19 % is the cautious reading until the user confirms the rate.
   * Default: on, except for rows under Kleinunternehmer status.
   */
  assumeStandardVatForUnconfirmedIncome?: boolean
}

/**
 * `taxType` is either one status for all rows or the user's status timeline: then every row
 * is read with the status valid on its date (Kleinunternehmer rows carry no VAT, standard
 * rows do), so a status change never re-reads earlier periods.
 */
export function summarizeTransactions(rows: TransactionRow[], taxTypeSource: TaxTypeSource, options: SummaryOptions = {}): TransactionTotals {
  const t = emptyTotals()
  const taxTypeAt = taxTypeResolver(taxTypeSource)
  let vatRefundCents = 0
  let vatPaymentCents = 0
  for (const row of rows) {
    const taxType: TaxType = taxTypeAt(row.statusDate ?? row.transactionDate)
    const assume = options.assumeStandardVatForUnconfirmedIncome ?? taxType !== 'KLEINUNTERNEHMER'
    if (row.taxPaymentType) {
      // Paid from the tax reserve: not profit, not private money, not this month's spending.
      t.count++
      const cents = Math.abs(computeTransactionAmounts({ type: row.type, grossAmount: row.grossAmount, vatRate: 0, usage: 'BUSINESS', businessPct: 100, taxType }, false).grossCents)
      const signed = row.type === 'EXPENSE' ? cents : -cents
      if (row.taxPaymentType === 'VAT') {
        t.vatPaidToFinanzamtCents += signed
        if (signed > 0) vatPaymentCents += signed
        else vatRefundCents -= signed
      } else if (row.taxPaymentType === 'INCOME_TAX') {
        t.incomeTaxPaidCents += signed
      }
      continue
    }
    const unconfirmedVat =
      assume && row.type === 'INCOME' && row.usage === 'BUSINESS' && row.needsReview === true && Number(row.vatRate?.toString() ?? 0) === 0
    if (unconfirmedVat) t.assumedVatCount++
    const a = computeTransactionAmounts(
      {
        type: row.type,
        grossAmount: row.grossAmount,
        vatRate: unconfirmedVat ? ASSUMED_STANDARD_VAT_RATE : row.vatRate,
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
  // Kleinunternehmer rows carry no output or input VAT (computeTransactionAmounts), so mixed
  // periods are summed correctly.
  t.vatPayableCents = t.outputVatCents - t.inputVatCents
  // Anlage EKS (cash basis): VAT refunded by the Finanzamt is a receipt, VAT paid to it an expense.
  // Income tax is not a business expense there either (§11b Abs. 1 Nr. 1 SGB II deducts it separately).
  t.businessReceiptsCents = t.businessIncomeGrossCents + vatRefundCents
  t.businessExpensesPaidCents = t.deductibleExpenseCents + t.inputVatCents + vatPaymentCents
  return t
}
