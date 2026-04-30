'use client'

import { useEffect, useState } from 'react'

type MoneyData = {
  totalIncome: number
  totalExpenses: number
  totalFixedCosts: number
  taxOwed: number
  taxReserved: number
  taxMissing: number
  safeToSpend: number
}

export default function MoneyPage() {
  const [data, setData] = useState<MoneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [canISpend, setCanISpend] = useState('')
  const [decision, setDecision] = useState<{ canSpend: boolean; message: string; safeToSpend: number } | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    fetch('/api/v1/dashboard')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [])

  async function handleDecision(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    const res = await fetch('/api/v1/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: parseFloat(canISpend) }),
    })
    const result = await res.json()
    setDecision(result)
    setChecking(false)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!data) return null

  const privateMoney = data.safeToSpend
  const taxMoney = data.taxOwed
  const total = data.totalIncome

  const buckets = [
    {
      label: 'Safe to spend',
      sublabel: 'Your money — Privatentnahme',
      amount: privateMoney,
      pct: total > 0 ? (privateMoney / total) * 100 : 0,
      color: 'bg-emerald-500',
      textColor: 'text-emerald-400',
      borderColor: 'border-emerald-800',
      bgColor: 'bg-emerald-950',
    },
    {
      label: 'Tax reserve',
      sublabel: 'Goes to Finanzamt — Steuer',
      amount: taxMoney,
      pct: total > 0 ? (taxMoney / total) * 100 : 0,
      color: 'bg-yellow-500',
      textColor: 'text-yellow-400',
      borderColor: 'border-yellow-800',
      bgColor: 'bg-yellow-950',
    },
    {
      label: 'Business costs',
      sublabel: 'Expenses + fixed costs — Kosten',
      amount: data.totalExpenses + data.totalFixedCosts,
      pct: total > 0 ? ((data.totalExpenses + data.totalFixedCosts) / total) * 100 : 0,
      color: 'bg-red-500',
      textColor: 'text-red-400',
      borderColor: 'border-red-800',
      bgColor: 'bg-red-950',
    },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Money split</h1>
        <p className="text-gray-500 text-sm mt-1">
          Where your money goes — business, tax, and yours
        </p>
      </div>

      {/* Visual bar */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <div className="flex h-8 rounded-lg overflow-hidden mb-4">
          {buckets.map(b => (
            <div
              key={b.label}
              className={`${b.color} transition-all`}
              style={{ width: `${Math.max(0, b.pct)}%` }}
              title={`${b.label}: €${b.amount.toFixed(2)}`}
            />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {buckets.map(b => (
            <div key={b.label} className={`rounded-lg border p-3 ${b.bgColor} ${b.borderColor}`}>
              <p className="text-xs text-gray-500">{b.sublabel}</p>
              <p className={`text-lg font-bold mt-0.5 ${b.textColor}`}>€{b.amount.toFixed(2)}</p>
              <p className="text-xs text-gray-600 mt-0.5">{b.pct.toFixed(0)}% of income</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tax missing warning */}
      {data.taxMissing > 0 && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-4">
          <p className="text-sm font-medium text-red-300">Tax reserve gap</p>
          <p className="text-xs text-red-400 mt-1">
            You should have €{data.taxOwed.toFixed(2)} reserved but only have €{data.taxReserved.toFixed(2)}.
            You are missing €{data.taxMissing.toFixed(2)}.
          </p>
        </div>
      )}

      {/* Can I spend? */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <p className="text-sm font-medium text-white mb-1">Can I spend this amount?</p>
        <p className="text-xs text-gray-500 mb-4">
          Checks against your tax reserve, fixed costs, debts and salaries
        </p>
        <form onSubmit={handleDecision} className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">€</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={canISpend}
              onChange={e => { setCanISpend(e.target.value); setDecision(null) }}
              placeholder="500.00"
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={checking || !canISpend}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {checking ? 'Checking...' : 'Check'}
          </button>
        </form>

        {decision && (
          <div className={`mt-4 rounded-lg p-4 border ${
            decision.canSpend
              ? 'bg-emerald-950 border-emerald-800'
              : 'bg-red-950 border-red-800'
          }`}>
            <p className={`text-sm font-semibold ${decision.canSpend ? 'text-emerald-400' : 'text-red-400'}`}>
              {decision.canSpend ? '✓ Yes, you can spend this' : '✗ No, not safe to spend'}
            </p>
            <p className="text-xs text-gray-400 mt-1">{decision.message}</p>
          </div>
        )}
      </div>

      {/* Breakdown */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {[
          { label: 'Money in this month', sublabel: 'Total income (Einnahmen)', amount: data.totalIncome, color: 'text-emerald-400', sign: '+' },
          { label: 'Business expenses', sublabel: 'Ausgaben this month', amount: data.totalExpenses, color: 'text-red-400', sign: '-' },
          { label: 'Fixed costs', sublabel: 'Fixkosten monthly', amount: data.totalFixedCosts, color: 'text-orange-400', sign: '-' },
          { label: 'Tax reserve needed', sublabel: 'Steuerrücklage', amount: data.taxOwed, color: 'text-yellow-400', sign: '-' },
        ].map(row => (
          <div key={row.label} className="flex justify-between items-center px-5 py-4">
            <div>
              <p className="text-sm text-white font-medium">{row.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{row.sublabel}</p>
            </div>
            <p className={`text-lg font-semibold ${row.color}`}>
              {row.sign}€{row.amount.toFixed(2)}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
