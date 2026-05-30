'use client'

import { useState } from 'react'

interface Props {
  amount: number
}

export default function SafeToSpendCard({ amount }: Props) {
  const [open, setOpen] = useState(false)
  const isHealthy = amount > 0

  return (
    <div className={`rounded-xl border overflow-hidden ${
      isHealthy ? 'bg-emerald-950 border-emerald-800' : 'bg-red-950 border-red-800'
    }`}>
      <div className="p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-400 mb-1">Safe to spend</p>
            <p className={`text-4xl font-bold ${isHealthy ? 'text-emerald-400' : 'text-red-400'}`}>
              €{amount.toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => setOpen(o => !o)}
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-1"
            aria-expanded={open}
          >
            <span className="text-base">ⓘ</span>
            <span>{open ? 'Hide' : 'What is this?'}</span>
          </button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Estimated amount available after taxes, fixed costs and obligations.
          Not all money in your account is safely spendable.
        </p>
      </div>

      {open && (
        <div className="border-t border-emerald-800/60 bg-blue-950/40 px-5 py-4 space-y-3">
          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">What is this?</p>
            <p className="text-sm text-gray-300 leading-relaxed">
              This is an estimate of money that may be available to you after setting aside taxes, paying fixed costs, and covering what you owe to suppliers.
            </p>
            <p className="text-sm text-gray-400 mt-1">
              <strong className="text-amber-400">Important:</strong> This is NOT your bank balance. Your bank may show more money — but some of it is already needed for taxes and bills.
            </p>
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">What reduces this number?</p>
            <ul className="space-y-1">
              {[
                'Taxes you will owe (Einkommensteuer, Umsatzsteuer)',
                'Fixed monthly costs (rent, phone, insurance)',
                'Unpaid supplier bills',
                'Employee wages',
              ].map((ex, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-red-400 mt-0.5 flex-shrink-0">−</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2">
            <p className="text-xs text-amber-300 leading-relaxed">
              Always review important spending decisions carefully. This estimate depends on how complete your records are in TaxKontrol.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
