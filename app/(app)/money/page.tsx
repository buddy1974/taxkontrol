'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eur } from '@/lib/format'
import type { PresentedPosition } from '@/lib/finance/present'

type Check = { canSpend: boolean; insufficientData: boolean; message: string; safeToSpend: number; remainingAfter: number; bufferWarning: boolean }

export default function MoneyPage() {
  const [data, setData] = useState<PresentedPosition | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [amount, setAmount] = useState('')
  const [check, setCheck] = useState<Check | null>(null)
  const [checkError, setCheckError] = useState('')
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    fetch('/api/v1/dashboard')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(d => {
        setData(d)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  async function handleCheck(e: React.FormEvent) {
    e.preventDefault()
    setChecking(true)
    setCheckError('')
    const res = await fetch('/api/v1/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: amount.replace(',', '.') }),
    })
    const body = await res.json().catch(() => ({}))
    setChecking(false)
    if (!res.ok) {
      setCheckError(body.error ?? 'Could not check this amount.')
      return
    }
    setCheck(body)
  }

  if (state === 'loading') return <p className="text-gray-400 text-sm">Loading…</p>
  if (state === 'error' || !data) return <p role="alert" className="text-red-300 text-sm">Could not load your numbers. Please reload.</p>

  const m = data.month
  const income = m.businessIncomeGross
  const buckets = [
    { label: 'Paid out', sub: 'Expenses this month (Ausgaben)', amount: m.outflowGross, color: 'bg-red-500', text: 'text-red-300' },
    { label: 'Taxes', sub: 'VAT + income tax from this month (estimate)', amount: data.monthTax.total, color: 'bg-yellow-500', text: 'text-yellow-300' },
    { label: 'Still due', sub: 'Fixed costs, salaries, bills', amount: data.commitmentsTotal, color: 'bg-orange-500', text: 'text-orange-300' },
    { label: 'Left for you', sub: 'Could be withdrawn (Privatentnahme)', amount: Math.max(0, data.leftFromThisMonth), color: 'bg-emerald-500', text: 'text-emerald-300' },
  ]

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Money split</h1>
        <p className="text-gray-400 text-sm mt-1">Where this month’s business money goes</p>
      </header>

      {m.transactionCount === 0 ? (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-6 text-center">
          <p className="text-gray-300">No transactions this month yet.</p>
          <Link href="/input" className="text-blue-300 underline text-sm mt-2 inline-block">Add your first one</Link>
        </div>
      ) : (
        <section aria-labelledby="split-title" className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 id="split-title" className="text-sm text-gray-300 mb-3">Business money in: <span className="text-white font-semibold">{eur(income)}</span></h2>
          {income > 0 && (
            <div className="flex h-6 rounded-lg overflow-hidden mb-4" aria-hidden="true">
              {buckets.map(b => (
                <div key={b.label} className={b.color} style={{ width: `${Math.min(100, (b.amount / income) * 100)}%` }} />
              ))}
            </div>
          )}
          <ul className="grid grid-cols-2 gap-3">
            {buckets.map(b => (
              <li key={b.label} className="rounded-lg border border-gray-800 bg-gray-950/40 p-3">
                <p className="text-xs text-gray-400">{b.sub}</p>
                <p className={`text-lg font-bold mt-0.5 ${b.text}`}>{eur(b.amount)}</p>
                <p className="text-xs text-gray-500">{b.label}{income > 0 ? ` · ${Math.round((b.amount / income) * 100)} %` : ''}</p>
              </li>
            ))}
          </ul>
          {data.leftFromThisMonth < 0 && (
            <p role="alert" className="mt-4 rounded-lg bg-red-950 border border-red-800 px-3 py-2 text-sm text-red-200">
              This month is {eur(-data.leftFromThisMonth)} short after taxes and bills. Money for these must come from earlier months or reserves.
            </p>
          )}
          {(m.nonBusinessInflow > 0 || m.unclearInflow > 0) && (
            <p className="mt-3 text-xs text-gray-400">
              Not included: private money / loans {eur(m.nonBusinessInflow)}{m.unclearInflow > 0 ? `, not yet classified ${eur(m.unclearInflow)}` : ''}.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="spend-title" className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <h2 id="spend-title" className="text-sm font-medium text-white mb-1">Can I spend this amount?</h2>
        <p className="text-xs text-gray-400 mb-4">Checks against this month’s money after taxes and bills. Not your bank balance.</p>
        <form onSubmit={handleCheck} className="flex gap-2">
          <label htmlFor="spend" className="sr-only">Amount in euros</label>
          <input id="spend" inputMode="decimal" value={amount} onChange={e => { setAmount(e.target.value); setCheck(null) }} placeholder="500"
            className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm" />
          <button type="submit" disabled={checking || !amount} className="px-5 min-h-11 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {checking ? 'Checking…' : 'Check'}
          </button>
        </form>
        {checkError && <p role="alert" className="text-sm text-red-300 mt-3">{checkError}</p>}
        {check && (
          <div role="status" className={`mt-4 rounded-lg p-4 border ${check.insufficientData ? 'bg-gray-800 border-gray-700' : check.canSpend ? 'bg-emerald-950 border-emerald-800' : 'bg-red-950 border-red-800'}`}>
            <p className={`text-sm font-semibold ${check.insufficientData ? 'text-gray-200' : check.canSpend ? 'text-emerald-300' : 'text-red-300'}`}>
              {check.insufficientData ? 'Not enough data yet' : check.canSpend ? (check.bufferWarning ? 'Possible, but it uses most of this month’s money' : 'Probably yes') : 'Not from this month’s money'}
            </p>
            <p className="text-sm text-gray-300 mt-1">{check.message}</p>
          </div>
        )}
        <p className="text-xs text-gray-500 mt-3">For bigger decisions use the <Link href="/decision-center" className="underline">Decision Center</Link>.</p>
      </section>
    </div>
  )
}
