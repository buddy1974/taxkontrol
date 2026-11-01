'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eur, germanDate } from '@/lib/format'

type JcRecord = {
  id: string
  periodStart: string
  periodEnd: string
  type: 'EKS' | 'IKS'
  totalIncome: number
  totalExpenses: number
  netProfit: number
  freibetrag: number
  anrechenbares: number
  status: string
  warnings?: string[]
  estimate?: {
    benefitName: string
    months: number
    monthlyIncome: number
    monthlyPauschale: number
    monthlyErwerbstaetigenFreibetrag: number
    monthlyCountable: number
    notes: string[]
    basis: string
    unclearTransactions: boolean
    needsReviewCount: number
  }
}

const TYPE_LABEL = { EKS: 'Provisional (vorläufige EKS)', IKS: 'Final (abschließende EKS)' }

export default function JobcenterPage() {
  const [records, setRecords] = useState<JcRecord[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ periodStart: '', periodEnd: '', type: 'EKS' as 'EKS' | 'IKS', hasMinorChild: false })

  useEffect(() => {
    fetch('/api/v1/jobcenter')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(data => {
        setRecords(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    setError('')
    const res = await fetch('/api/v1/jobcenter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const body = await res.json().catch(() => ({}))
    setGenerating(false)
    if (!res.ok) return setError(body.error ?? 'Could not calculate.')
    setRecords(prev => [body, ...prev])
  }

  const input = 'w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm'

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Jobcenter — Anlage EKS</h1>
        <p className="text-gray-400 text-sm mt-1">Prepare your income from self-employment for Grundsicherungsgeld (formerly Bürgergeld)</p>
      </header>

      <div className="rounded-xl bg-amber-950 border border-amber-800 p-4 space-y-2 text-xs text-amber-100">
        <p className="text-sm font-medium">Estimate for your preparation — not a decision of the Jobcenter</p>
        <p>
          TaxKontrol uses the money actually received and paid in the period (not the tax profit), averages it per month and subtracts the allowances
          of § 11b SGB II: 100 € flat amount plus 20 % of income between 100 and 520 €, 30 % between 520 and 1,000 € and 10 % between 1,000 and 1,200 €
          (1,500 € with a child under 18).
        </p>
        <p>The Jobcenter decides which expenses it accepts. Private money and loans are not counted as income.</p>
      </div>

      <form onSubmit={handleGenerate} className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <h2 className="text-sm font-medium text-white">Calculate a period</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="jc-start" className="block text-xs text-gray-300 mb-1">First month</label>
            <input id="jc-start" type="date" required value={form.periodStart} onChange={e => setForm(p => ({ ...p, periodStart: e.target.value }))} className={input} />
          </div>
          <div>
            <label htmlFor="jc-end" className="block text-xs text-gray-300 mb-1">Last month</label>
            <input id="jc-end" type="date" required value={form.periodEnd} onChange={e => setForm(p => ({ ...p, periodEnd: e.target.value }))} className={input} />
          </div>
        </div>
        <p className="text-xs text-gray-400">Whole calendar months are used. The Bewilligungszeitraum is usually 6 months.</p>
        <fieldset>
          <legend className="text-xs text-gray-300 mb-2">Which statement?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(['EKS', 'IKS'] as const).map(t => (
              <button key={t} type="button" aria-pressed={form.type === t} onClick={() => setForm(p => ({ ...p, type: t }))}
                className={`py-2 px-3 min-h-11 rounded-lg text-xs font-medium border ${form.type === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                <span className="block">{TYPE_LABEL[t]}</span>
                <span className="block font-normal mt-0.5">{t === 'EKS' ? 'Before or at the start of the period' : 'After the period, with real figures'}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-3 text-sm text-gray-200 min-h-11">
          <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={form.hasMinorChild} onChange={e => setForm(p => ({ ...p, hasMinorChild: e.target.checked }))} />
          At least one child under 18 lives with me
        </label>
        {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
        <button type="submit" disabled={generating} className="w-full min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {generating ? 'Calculating…' : 'Calculate'}
        </button>
      </form>

      {state === 'loading' && <p className="text-gray-400 text-sm">Loading…</p>}
      {state === 'error' && <p role="alert" className="text-red-300 text-sm">Could not load earlier calculations.</p>}

      {records.map(r => (
        <section key={r.id} className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <span className={`text-xs px-2 py-1 rounded-full font-medium ${r.type === 'EKS' ? 'bg-blue-900 text-blue-200' : 'bg-purple-900 text-purple-200'}`}>{TYPE_LABEL[r.type]}</span>
            <span className="text-xs text-gray-400">{germanDate(r.periodStart)} – {germanDate(r.periodEnd)}</span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-xs text-gray-400">Business receipts</dt><dd className="text-emerald-400 font-medium">{eur(r.totalIncome)}</dd></div>
            <div><dt className="text-xs text-gray-400">Business expenses paid</dt><dd className="text-red-400 font-medium">{eur(r.totalExpenses)}</dd></div>
            <div><dt className="text-xs text-gray-400">Income in the period</dt><dd className="text-white font-medium">{eur(r.netProfit)}</dd></div>
            <div><dt className="text-xs text-gray-400">Allowances in the period</dt><dd className="text-white font-medium">{eur(r.freibetrag)}</dd></div>
          </dl>
          {(r.warnings?.length ?? 0) > 0 && (
            <ul role="alert" className="text-xs text-amber-200 space-y-1 rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2 list-disc pl-6">
              {r.warnings!.map(w => <li key={w}>{w}</li>)}
            </ul>
          )}
          {r.estimate && (
            <div className="text-xs text-gray-300 space-y-1 border-t border-gray-800 pt-3">
              <p>Per month: income {eur(r.estimate.monthlyIncome)} − flat amount {eur(r.estimate.monthlyPauschale)} − earned-income allowance {eur(r.estimate.monthlyErwerbstaetigenFreibetrag)} = <strong className="text-white">{eur(r.estimate.monthlyCountable)}</strong> counted</p>
              {r.estimate.needsReviewCount > 0 && (
                <p className="text-amber-300">{r.estimate.needsReviewCount} transaction(s) in this period are not classified and were left out. <Link href="/transactions?review=1" className="underline">Classify them</Link> and calculate again.</p>
              )}
              <ul className="list-disc pl-4 text-gray-400">{r.estimate.notes.map(n => <li key={n}>{n}</li>)}</ul>
              <p className="text-gray-400">Basis: {r.estimate.basis}</p>
            </div>
          )}
          <div className="p-3 bg-amber-950 border border-amber-800 rounded-lg">
            <p className="text-xs text-amber-200">Estimated countable income for the whole period (anrechenbares Einkommen)</p>
            <p className="text-lg font-bold text-amber-100 mt-0.5">{eur(r.anrechenbares)}</p>
            <p className="text-xs text-amber-300/80 mt-1">The Jobcenter calculates the final amount.</p>
          </div>
        </section>
      ))}
    </div>
  )
}
