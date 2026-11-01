/** Plain-language text for each FinancialPosition.uncertainties code. */
export const UNCERTAINTY_REASONS: Record<string, string> = {
  ENDED_PERIOD_UNRESERVED: 'Tax for a period that has already ended is not recorded as paid and not fully set aside.',
  UNCLEAR_TRANSACTIONS: 'Some money is still marked "not sure" — taxes on it are not included yet.',
  ASSUMED_VAT: 'Some income or invoices have no confirmed VAT rate (19 % is assumed).',
  KLEIN_UNCLASSIFIED: 'The Kleinunternehmer limit check includes money you have not classified yet.',
  KLEIN_LIMIT: 'Your turnover is at or above a Kleinunternehmer limit — VAT may be owed.',
  TRADE_TAX_NOT_RESERVED: 'Gewerbesteuer may be due on your profit and is not included in the estimate.',
  POSSIBLE_UNLINKED_INVOICE_PAYMENT: 'An income booking may be the payment of an open invoice — link it, or its VAT is counted twice.',
  LEGACY_INVOICE_DATES: 'Some customer invoices have no confirmed invoice date / VAT rate — check them under “Customers owe me”.',
}

export function uncertaintyText(code: string): string {
  return UNCERTAINTY_REASONS[code] ?? code
}
