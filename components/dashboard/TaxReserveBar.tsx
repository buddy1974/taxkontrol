import Link from 'next/link'
import { eur } from '@/lib/format'

interface Reserve {
  type: 'VAT' | 'INCOME_TAX'
  label: string
  periodLabel: string
  target: number
  reserved: number
  shortfall: number
}

interface Props {
  reserves: Reserve[]
  taxType: string
}

/**
 * Estimated reserve per tax period vs. what the user says they set aside.
 * "Reserved" is never assumed — it is only what the user entered.
 */
export default function TaxReserveBar({ reserves, taxType }: Props) {
  const target = reserves.reduce((s, r) => s + r.target, 0)
  const reserved = reserves.reduce((s, r) => s + r.reserved, 0)
  const shortfall = reserves.reduce((s, r) => s + r.shortfall, 0)
  const pct = target > 0 ? Math.min(100, Math.round((reserved / target) * 100)) : 100
  const onTrack = shortfall === 0

  return (
    <section aria-labelledby="tax-reserve-title" className="rounded-xl p-5 sm:p-6 bg-gray-900 border border-gray-800">
      <div className="flex justify-between items-start gap-3 mb-3">
        <div>
          <h2 id="tax-reserve-title" className="text-sm text-gray-300">Tax reserve (Steuerrücklage)</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {taxType === 'KLEINUNTERNEHMER' ? 'Income tax estimate for this year' : 'VAT for this filing period + income tax estimate for this year'}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${onTrack ? 'bg-emerald-900 text-emerald-300' : 'bg-amber-900 text-amber-300'}`}>
          {onTrack ? 'On track' : `${eur(shortfall)} still to set aside`}
        </span>
      </div>

      <div
        className="w-full bg-gray-800 rounded-full h-2 mb-3"
        role="progressbar"
        aria-label="Share of the estimated tax reserve set aside"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className={`h-2 rounded-full ${onTrack ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs">
        {reserves.map(r => (
          <div key={r.type} className="col-span-2 flex justify-between text-gray-400">
            <dt>
              {r.label} · {r.periodLabel}
            </dt>
            <dd>
              {eur(r.reserved)} of {eur(r.target)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-gray-400 mt-3">
        Estimate to prepare for tax payments — not a bill from the Finanzamt. Only the amount you enter as “set aside” counts as reserved.{' '}
        <Link href="/tax" className="text-blue-300 underline underline-offset-2">Update what you set aside</Link>
      </p>
    </section>
  )
}
