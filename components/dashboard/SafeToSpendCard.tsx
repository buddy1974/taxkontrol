'use client'

import { useId, useState } from 'react'
import { eur } from '@/lib/format'

interface Props {
  /** Safe to spend: left from this month minus unreserved taxes of earlier periods. May be negative. */
  amount: number
  /** Left from this month after its own taxes and bills (the flow figure). */
  leftFromThisMonth: number
  hasData: boolean
  /** Open questions that make the figure unreliable (plain-language list). */
  uncertainties: string[]
}

export default function SafeToSpendCard({ amount, leftFromThisMonth, hasData, uncertainties }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const uncertain = uncertainties.length > 0
  const isHealthy = amount > 0 && !uncertain
  const earlierTaxGap = Math.round((leftFromThisMonth - amount) * 100) / 100

  const tone = !hasData
    ? 'bg-gray-900 border-gray-800'
    : isHealthy
      ? 'bg-emerald-950 border-emerald-800'
      : amount > 0
        ? 'bg-amber-950 border-amber-800'
        : 'bg-red-950 border-red-800'

  return (
    <section aria-labelledby={`${panelId}-title`} className={`rounded-xl border overflow-hidden ${tone}`}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={`${panelId}-title`} className="text-sm text-gray-300 mb-1">
              Safe to spend <span className="text-gray-400">(estimate)</span>
            </h2>
            {hasData ? (
              <p className={`text-3xl sm:text-4xl font-bold ${isHealthy ? 'text-emerald-400' : amount > 0 ? 'text-amber-300' : 'text-red-400'}`}>
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
              ? 'Your records do not cover the taxes and bills due. Plan how to close the gap before spending.'
              : 'Business money received this month, minus everything paid out, minus taxes and bills still due — including taxes from earlier periods you have not set aside.'
            : 'Add your income and expenses to see how much of this month’s money is really yours.'}
        </p>
        {hasData && earlierTaxGap > 0 && (
          <p className="text-xs text-amber-200 mt-2">
            Includes {eur(earlierTaxGap)} of estimated tax from earlier months or ended periods that is not set aside yet. Enter what you have set aside on the Tax page.
          </p>
        )}
        {hasData && uncertain && (
          <div role="note" className="mt-3 rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2 text-xs text-amber-100">
            <p className="font-medium">Not reliable yet:</p>
            <ul className="list-disc pl-4 mt-1 space-y-0.5">
              {uncertainties.map(u => (
                <li key={u}>{u}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <div id={panelId} className="border-t border-white/10 bg-black/20 px-5 py-4 space-y-3 text-sm">
          <ul className="space-y-1 text-gray-300">
            <li>+ business money received this month (incl. VAT)</li>
            <li>− all payments this month (also private ones paid from the business)</li>
            <li>− VAT and income tax caused by this month (estimate)</li>
            <li>− bills still due this month: fixed costs not yet paid, salaries, supplier bills</li>
            <li>= left from this month: {eur(leftFromThisMonth)}</li>
            <li>− estimated tax of ended periods and earlier months that is not set aside</li>
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
