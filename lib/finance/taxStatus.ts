/**
 * Tax status over time (pure). A user's VAT status, VAT method (Soll / Ist), filing
 * period and Dauerfristverlängerung are a HISTORY: each entry is valid from its date until
 * the next entry. Every tax period and every booking is calculated with the status that
 * was valid at that time, so changing the status in Settings never rewrites the past
 * (a switch to Kleinunternehmer on 5 January does not make last quarter's VAT disappear).
 *
 * Legal background (docs/finance/RULES.md):
 * - Sollversteuerung (§13 Abs. 1 Nr. 1a, §16 Abs. 1 UStG) is the legal default: output VAT
 *   is due for the period in which the service was performed / the invoice issued.
 * - Istversteuerung (§20 UStG, VAT due when the money is received) is only allowed when the
 *   Finanzamt approved it on application. TaxKontrol never assumes it: IST is only used
 *   when the user confirmed the approval.
 */
import type { TaxType } from './transactionAmounts'

export type VatMethod = 'SOLL' | 'IST'
export type VatFilingPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export interface TaxStatus {
  taxType: TaxType
  vatMethod: VatMethod
  vatFilingPeriod: VatFilingPeriod
  dauerfristverlaengerung: boolean
}

export interface TaxStatusEntry extends TaxStatus {
  validFrom: Date
}

export const DEFAULT_TAX_STATUS: TaxStatus = {
  taxType: 'KLEINUNTERNEHMER',
  vatMethod: 'SOLL',
  vatFilingPeriod: 'QUARTERLY',
  dauerfristverlaengerung: false,
}

/** Earliest possible start: the status "since always" (initial setup, migrated users). */
export const SINCE_ALWAYS = new Date(Date.UTC(1970, 0, 1))

export class TaxStatusTimeline {
  /** Sorted by validFrom ascending; never empty. */
  readonly entries: TaxStatusEntry[]

  constructor(entries: TaxStatusEntry[], fallback: TaxStatus = DEFAULT_TAX_STATUS) {
    const sorted = [...entries].sort((a, b) => a.validFrom.getTime() - b.validFrom.getTime())
    this.entries = sorted.length > 0 ? sorted : [{ ...fallback, validFrom: SINCE_ALWAYS }]
    // Anything before the first entry is read with the first entry's status.
    if (this.entries[0].validFrom.getTime() > SINCE_ALWAYS.getTime()) {
      this.entries = [{ ...this.entries[0], validFrom: SINCE_ALWAYS }, ...this.entries.slice(1)]
    }
  }

  static constant(status: Partial<TaxStatus> & { taxType: TaxType }): TaxStatusTimeline {
    return new TaxStatusTimeline([{ ...DEFAULT_TAX_STATUS, ...status, validFrom: SINCE_ALWAYS }])
  }

  statusAt(date: Date): TaxStatus {
    let found = this.entries[0]
    for (const e of this.entries) {
      if (e.validFrom.getTime() <= date.getTime()) found = e
      else break
    }
    return found
  }

  taxTypeAt(date: Date): TaxType {
    return this.statusAt(date).taxType
  }

  /** Statuses that apply at some moment within [start, end). */
  statusesWithin(start: Date, end: Date): TaxStatus[] {
    const out: TaxStatus[] = [this.statusAt(start)]
    for (const e of this.entries) {
      if (e.validFrom.getTime() > start.getTime() && e.validFrom.getTime() < end.getTime()) out.push(e)
    }
    return out
  }

  /** True when VAT had to be charged at some moment within [start, end). */
  vatLiableWithin(start: Date, end: Date): boolean {
    return this.statusesWithin(start, end).some(s => s.taxType !== 'KLEINUNTERNEHMER')
  }

  /** True when the status changed within the range (one period calculated with two statuses). */
  changesWithin(start: Date, end: Date): boolean {
    return this.statusesWithin(start, end).length > 1
  }
}

/** Accepts either a fixed tax type (old callers) or a timeline. */
export type TaxTypeSource = TaxType | TaxStatusTimeline

export function taxTypeResolver(source: TaxTypeSource): (date: Date) => TaxType {
  if (source instanceof TaxStatusTimeline) return d => source.taxTypeAt(d)
  return () => source
}
