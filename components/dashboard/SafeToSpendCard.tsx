'use client'

import { useId, useState } from 'react'
import { eur } from '@/lib/format'

interface Props {
  /** What is left from this month after taxes and open commitments. May be negative. */
  amount: number
  hasData: boolean
}

export default function SafeToSpendCard({ amount, hasData }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const isHealthy = amount > 0

  const tone = !hasData
    ? 'bg-gray-900 border-gray-800'
    : isHealthy
      ? 'bg-emerald-950 border-emerald-800'
      : 'bg-red-950 border-red-800'

  return (
    <section aria-labelledby={`${panelId}-title`} className={`rounded-xl border overflow-hidden ${tone}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${panelId}-title`} className="text-sm text-gray-300 mb-1">
              Left from this month <span className="text-gray-500">(estimate)</span>
            </h2>
            {hasData ? (
              <p className={`text-3xl sm:text-4xl font-bold ${isHealthy ? 'text-emerald-400' : 'text-red-400'}`}>
                {amount < 0 ? `−${eur(-amount)}` : eur(amount)}
              </p>
            ) : (
              <p className="text-lg font-semibold text-gray-300">No transactions yet</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="text-xs text-blue-300 hover:text-blue-200 underline underline-offset-2 mt-1 shrink-0 min-h-11 px-2"
            aria-expanded={open}
            aria-controls={panelId}
          >
            {open ? 'Hide' : 'How is this calculated?'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          {hasData
            ? amount < 0
              ? 'This month does not cover its taxes and bills. Plan how to close the gap before spending.'
              : 'Business money received this month, minus everything paid out, minus taxes and bills still due this month.'
            : 'Add your income and expenses to see how much of this month’s money is really yours.'}
        </p>
      </div>

      {open && (
        <div id={panelId} className="border-t border-white/10 bg-black/20 px-5 py-4 space-y-3 text-sm">
          <ul className="space-y-1 text-gray-300">
            <li>+ business money received this month (incl. VAT)</li>
            <li>− all payments this month (also private ones paid from the business)</li>
            <li>− VAT and income tax caused by this month (estimate)</li>
            <li>− bills still due this month: fixed costs not yet paid, salaries, supplier bills</li>
          </ul>
          <p className="text-gray-400">
            Private deposits, loans and money marked “not sure” are <strong className="text-gray-200">not</strong> counted as available.
          </p>
          <p className="rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2 text-xs text-amber-200">
            This is not your bank balance and not advice. It is only as complete as your records.
          </p>
        </div>
      )}
    </section>
  )
}
