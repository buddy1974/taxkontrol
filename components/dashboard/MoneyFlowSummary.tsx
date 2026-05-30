'use client'

import { useState } from 'react'

interface Props {
  totalIncome: number
  totalExpenses: number
  totalFixedCosts: number
  taxOwed: number
  taxType?: string
}

const INFO: Record<string, { whatIsThis: string; examples: string[]; whyItMatters: string }> = {
  'Money in': {
    whatIsThis: 'All the money received by your business this month.',
    examples: [
      'Customer payments for your work',
      'Cash sales at a market or shop',
      'Payments for invoices you sent',
      'Service fees or delivery income',
    ],
    whyItMatters: 'This helps TaxKontrol understand how much your business is earning and calculate your tax estimate.',
  },
  'Money out': {
    whatIsThis: 'Money spent on running your business this month.',
    examples: [
      'Fuel for work travel',
      'Work mobile phone bill',
      'Tools and equipment',
      'Supplies and materials',
      'Software or app subscriptions',
    ],
    whyItMatters: 'Business expenses may reduce your taxable profit, which means you could owe less tax.',
  },
  'Fixed costs': {
    whatIsThis: 'Regular costs that you pay every month regardless of how much you earn.',
    examples: [
      'Office or workshop rent',
      'Insurance',
      'Internet or phone contract',
      'Accounting software',
      'Vehicle lease',
    ],
    whyItMatters: 'Fixed costs are predictable and must be paid even in quiet months. TaxKontrol uses them to estimate your available money.',
  },
  'Tax reserve': {
    whatIsThis: 'An estimate of money to set aside so you are ready when taxes become due.',
    examples: [
      'Income tax (Einkommensteuer) on your profit',
      'VAT collected for the Finanzamt (Umsatzsteuer) — if applicable',
    ],
    whyItMatters: 'Taxes are not paid monthly but when they are due the amount can be large. Setting money aside regularly avoids surprises.',
  },
}

export default function MoneyFlowSummary({
  totalIncome,
  totalExpenses,
  totalFixedCosts,
  taxOwed,
  taxType,
}: Props) {
  const [openRow, setOpenRow] = useState<string | null>(null)
  const isKleinunternehmer = taxType === 'KLEINUNTERNEHMER'

  const rows = [
    {
      label: 'Money in',
      sublabel: 'Income this month (Einnahmen)',
      amount: totalIncome,
      color: 'text-emerald-400',
      sign: '+',
    },
    {
      label: 'Money out',
      sublabel: 'Business spending (Ausgaben)',
      amount: totalExpenses,
      color: 'text-red-400',
      sign: '-',
    },
    {
      label: 'Fixed costs',
      sublabel: 'Recurring monthly costs (Fixkosten)',
      amount: totalFixedCosts,
      color: 'text-orange-400',
      sign: '-',
    },
    {
      label: 'Tax reserve',
      sublabel: isKleinunternehmer
        ? 'Money set aside for income tax (Steuerrücklage)'
        : 'Money set aside for VAT + income tax (Steuerrücklage)',
      amount: taxOwed,
      color: 'text-yellow-400',
      sign: '-',
    },
  ]

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
      {rows.map(row => {
        const info = INFO[row.label]
        const isOpen = openRow === row.label

        return (
          <div key={row.label}>
            <div className="flex items-center justify-between px-5 py-4">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white font-medium">{row.label}</p>
                  {info && (
                    <button
                      onClick={() => setOpenRow(isOpen ? null : row.label)}
                      className="text-blue-400 hover:text-blue-300 text-xs leading-none"
                      aria-label={`What is ${row.label}?`}
                    >
                      ⓘ
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{row.sublabel}</p>
              </div>
              <p className={`text-lg font-semibold ${row.color} ml-4`}>
                {row.sign}€{row.amount.toFixed(2)}
              </p>
            </div>

            {isOpen && info && (
              <div className="px-5 pb-4 bg-blue-950/30 border-t border-blue-900/40 space-y-3">
                <div className="pt-3">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">What is this?</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{info.whatIsThis}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Examples</p>
                  <ul className="space-y-1">
                    {info.examples.map((ex, i) => (
                      <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                        <span>{ex}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Why does it matter?</p>
                  <p className="text-sm text-gray-300 leading-relaxed">{info.whyItMatters}</p>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
