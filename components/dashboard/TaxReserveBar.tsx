'use client'

import { useState } from 'react'

interface Props {
  taxOwed: number
  taxReserved: number
  taxMissing: number
  taxType?: string
}

export default function TaxReserveBar({ taxOwed, taxReserved, taxMissing, taxType }: Props) {
  const [open, setOpen] = useState(false)
  const pct = taxOwed > 0 ? Math.min(100, (taxReserved / taxOwed) * 100) : 100
  const isHealthy = taxMissing === 0
  const isKleinunternehmer = taxType === 'KLEINUNTERNEHMER'

  return (
    <div className="rounded-xl p-6 bg-gray-900 border border-gray-800">
      <div className="flex justify-between items-start mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="text-sm text-gray-400">Tax reserve (Steuerrücklage)</p>
            <button
              onClick={() => setOpen(o => !o)}
              className="text-blue-400 hover:text-blue-300 text-xs"
              aria-label="What is tax reserve?"
            >
              ⓘ
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {isKleinunternehmer
              ? 'Money set aside for income tax — Finanzamt'
              : 'Money set aside for VAT + income tax — Finanzamt'}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          isHealthy ? 'bg-emerald-900 text-emerald-400' : 'bg-amber-900 text-amber-400'
        }`}>
          {isHealthy ? 'On track' : `€${taxMissing.toFixed(2)} to save`}
        </span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${isHealthy ? 'bg-emerald-500' : 'bg-amber-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>Saved: €{taxReserved.toFixed(2)}</span>
        <span>Target: €{taxOwed.toFixed(2)}</span>
      </div>

      {open && (
        <div className="mt-4 border-t border-gray-800 pt-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">What is a tax reserve?</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              Money you set aside regularly so you are ready to pay taxes when the Finanzamt asks. Taxes are not paid every month — but when they are due, the amount can be large.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Example</p>
            <ul className="space-y-1">
              <li className="text-sm text-gray-400 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                <span>You receive €1,000 in income</span>
              </li>
              <li className="text-sm text-gray-400 flex items-start gap-2">
                <span className="text-amber-500 mt-0.5 flex-shrink-0">→</span>
                <span>TaxKontrol may suggest reserving €200–€300</span>
              </li>
              <li className="text-sm text-gray-400 flex items-start gap-2">
                <span className="text-blue-400 mt-0.5 flex-shrink-0">ℹ</span>
                <span>This does NOT mean you owe that amount today — it is a preparation estimate</span>
              </li>
            </ul>
          </div>
          <div className="rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2">
            <p className="text-xs text-amber-300 leading-relaxed">
              These are estimates only. Always verify with your Steuerberater before making any tax payments.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
