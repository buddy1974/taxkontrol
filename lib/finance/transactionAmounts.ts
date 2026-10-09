/**
 * Single source of truth for how one transaction's money is split.
 *
 * Primary fields (what the user/receipt says): type, gross amount, VAT rate,
 * usage (business / private / mixed / unsure) and business percentage.
 * Everything else (net, VAT, deductible share, private share) is DERIVED here
 * and nowhere else. Stored derived columns on Transaction are a cache written
 * from this function; aggregations recompute from the primary fields so that
 * legacy rows and later tax-status changes are always treated consistently.
 *
 * Rules (see docs/finance/RULES.md for sources):
 * - Kleinunternehmer (§19 UStG) charge no VAT and cannot deduct input VAT
 *   (§19 Abs. 1 S. 4 UStG). Their expenses therefore count at the GROSS amount.
 * - Regelbesteuerung: income is split into net + VAT owed; for expenses only
 *   the business share of the input VAT is deductible.
 * - Incoming money is profit only when it is business income. Private
 *   deposits, loans and refunds of private money (usage PRIVATE) are not
 *   income; UNSURE money is excluded from profit until the user clarifies it.
 * - UNSURE expenses are not deductible until clarified.
 */
import { toCents, splitGross, percentOf, type MoneyInput } from './money'
import { ALLOWED_VAT_RATES } from './rules'

export type TxType = 'INCOME' | 'EXPENSE'
export type Usage = 'BUSINESS' | 'PRIVATE' | 'MIXED' | 'UNSURE'
export type TaxType = 'KLEINUNTERNEHMER' | 'REGELBESTEUERUNG' | 'PAUSCHALIERUNG'

export interface TransactionPrimary {
  type: TxType
  grossAmount: MoneyInput
  vatRate: MoneyInput
  usage: Usage
  businessPct: number
  taxType: TaxType
}

export interface TransactionAmounts {
  grossCents: number
  netCents: number
  vatCents: number
  /** Effective VAT rate applied (0 for Kleinunternehmer). */
  vatRate: number
  usage: Usage
  businessPct: number
  /** INCOME: taxable business income (net). EXPENSE: deductible business expense. */
  businessCents: number
  /** Deductible input VAT (Vorsteuer) — EXPENSE under Regelbesteuerung only. */
  deductibleVatCents: number
  /** VAT owed on this income — INCOME (business) under Regelbesteuerung only. */
  outputVatCents: number
  /** INCOME: private/non-business inflow. EXPENSE: private cash share (Privatentnahme). */
  privateCents: number
  /** Money whose business/private nature is still unknown. */
  unclearCents: number
  needsReview: boolean
  /** Values ready for the Prisma Transaction model (Decimal-safe strings). */
  db: {
    amount: string
    grossAmount: string
    netAmount: string
    vatAmount: string
    vatRate: string
    usage: Usage
    businessPct: number
    businessAmount: string
    privateAmount: string
    needsReview: boolean
  }
}

export class TransactionValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message)
    this.name = 'TransactionValidationError'
  }
}

/** Max single transaction: 10 million euros (sanity guard against typos). */
export const MAX_TRANSACTION_CENTS = 1_000_000_000

export function centsToDecimalString(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(Math.round(cents))
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

function normaliseUsage(type: TxType, usage: Usage, businessPct: number, strict: boolean): { usage: Usage; pct: number } {
  if (type === 'INCOME') {
    if (usage === 'MIXED') {
      if (strict) throw new TransactionValidationError('usage', 'Incoming money is either business income, private money or unclear — not mixed.')
      return { usage: 'BUSINESS', pct: 100 }
    }
  }
  switch (usage) {
    case 'BUSINESS':
      return { usage, pct: 100 }
    case 'PRIVATE':
      return { usage, pct: 0 }
    case 'UNSURE':
      return { usage, pct: 0 }
    case 'MIXED': {
      const pct = Math.round(businessPct)
      if (!Number.isFinite(businessPct) || pct < 1 || pct > 99) {
        if (strict) throw new TransactionValidationError('businessPct', 'For a mixed expense the business share must be between 1 and 99 %.')
        return { usage: 'MIXED', pct: Math.min(99, Math.max(1, Number.isFinite(pct) ? pct : 50)) }
      }
      return { usage, pct }
    }
    default:
      if (strict) throw new TransactionValidationError('usage', 'Unknown usage.')
      return { usage: 'UNSURE', pct: 0 }
  }
}

/**
 * Computes all derived amounts.
 * strict=true (default) validates user input and throws TransactionValidationError.
 * strict=false is used when re-reading stored rows: it never throws and
 * interprets legacy values as safely as possible.
 */
export function computeTransactionAmounts(input: TransactionPrimary, strict = true): TransactionAmounts {
  const { type, taxType } = input
  if (type !== 'INCOME' && type !== 'EXPENSE') throw new TransactionValidationError('type', 'type must be INCOME or EXPENSE.')

  const grossCents = Math.abs(toCents(input.grossAmount))
  if (strict) {
    if (toCents(input.grossAmount) <= 0) throw new TransactionValidationError('grossAmount', 'Amount must be greater than 0.')
    if (grossCents > MAX_TRANSACTION_CENTS) throw new TransactionValidationError('grossAmount', 'Amount is unrealistically large — please check it.')
  }

  let vatRate = Number(input.vatRate?.toString() ?? 0)
  if (!Number.isFinite(vatRate)) vatRate = 0
  if (strict && !ALLOWED_VAT_RATES.includes(vatRate)) {
    throw new TransactionValidationError('vatRate', `VAT rate must be one of ${ALLOWED_VAT_RATES.join(', ')} %.`)
  }

  const isKlein = taxType === 'KLEINUNTERNEHMER'
  const { usage, pct } = normaliseUsage(type, input.usage, input.businessPct, strict)
  let needsReview = usage === 'UNSURE'

  if (isKlein && type === 'INCOME' && vatRate > 0) {
    if (strict) {
      throw new TransactionValidationError(
        'vatRate',
        'As a Kleinunternehmer you do not charge VAT (§19 UStG). If an invoice wrongly shows VAT, that VAT is still owed (§14c UStG) — please talk to your Steuerberater.'
      )
    }
    needsReview = true
  }

  // Kleinunternehmer: no VAT on either side — the full gross is the amount.
  const effectiveRate = isKlein ? 0 : vatRate
  const { netCents, vatCents } = splitGross(grossCents, effectiveRate)

  let businessCents = 0
  let deductibleVatCents = 0
  let outputVatCents = 0
  let privateCents = 0
  let unclearCents = 0

  if (type === 'INCOME') {
    if (usage === 'BUSINESS') {
      businessCents = netCents
      outputVatCents = vatCents
    } else if (usage === 'PRIVATE') {
      privateCents = grossCents
    } else {
      unclearCents = grossCents
    }
  } else {
    if (usage === 'UNSURE') {
      unclearCents = grossCents
    } else {
      businessCents = percentOf(netCents, pct)
      deductibleVatCents = isKlein ? 0 : percentOf(vatCents, pct)
      privateCents = grossCents - businessCents - deductibleVatCents
    }
  }

  return {
    grossCents,
    netCents,
    vatCents,
    vatRate: effectiveRate,
    usage,
    businessPct: pct,
    businessCents,
    deductibleVatCents,
    outputVatCents,
    privateCents,
    unclearCents,
    needsReview,
    db: {
      amount: centsToDecimalString(grossCents),
      grossAmount: centsToDecimalString(grossCents),
      netAmount: centsToDecimalString(netCents),
      vatAmount: centsToDecimalString(vatCents),
      vatRate: String(effectiveRate),
      usage,
      businessPct: pct,
      businessAmount: centsToDecimalString(businessCents),
      privateAmount: centsToDecimalString(privateCents),
      needsReview,
    },
  }
}
