'use client'

import { useEffect, useState } from 'react'

type JcRecord = {
  id: string
  periodStart: string
  periodEnd: string
  type: string
  totalIncome: number
  totalExpenses: number
  netProfit: number
  freibetrag: number
  anrechenbares: number
  status: string
}

export default function JobcenterPage() {
  const [records, setRecords] = useState<JcRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [form, setForm] = useState({ periodStart: '', periodEnd: '', type: 'EKS' })

  useEffect(() => {
    fetch('/api/v1/jobcenter')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => { setRecords(data); setLoading(false) })
      .catch(err => {
        console.error('Failed to load jobcenter records:', err)
        setLoading(false)
      })
  }, [])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    const res = await fetch('/api/v1/jobcenter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const newRecord = await res.json()
    setRecords(prev => [newRecord, ...prev])
    setGenerating(false)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Jobcenter income summary</h1>
        <p className="text-gray-500 text-sm mt-1">
          Calculate your countable income for Buergergeld reporting
        </p>
      </div>

      <div className="rounded-xl bg-amber-950 border border-amber-800 p-4 space-y-2">
        <p className="text-sm text-amber-300 font-medium">For your personal reference only</p>
        <p className="text-xs text-amber-400">
          These figures are estimates based on your recorded transactions. They are not an official submission to the Jobcenter and have no legal effect.
        </p>
        <p className="text-xs text-amber-400">
          Your actual countable income and Freibetrag depend on your individual situation. Always confirm the exact figures with your Jobcenter before submitting.
        </p>
        <p className="text-xs text-amber-500">
          The Freibetrag shown here uses a simplified estimate. Your real Freibetrag may be different.
        </p>
      </div>

      <form onSubmit={handleGenerate} className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <p className="text-sm font-medium text-white">Generate period summary</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Period start</label>
            <input
              type="date"
              value={form.periodStart}
              onChange={e => setForm(p => ({ ...p, periodStart: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Period end</label>
            <input
              type="date"
              value={form.periodEnd}
              onChange={e => setForm(p => ({ ...p, periodEnd: e.target.value }))}
              required
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-400 mb-2">Type of summary</p>
          <div className="flex gap-2">
            {[
              { value: 'EKS', label: 'EKS — Estimate', hint: 'Use at the start of a period' },
              { value: 'IKS', label: 'IKS — Actual', hint: 'Use after the period ends' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(p => ({ ...p, type: opt.value }))}
                className={`flex-1 py-2 px-3 rounded-lg text-xs font-medium border transition-colors ${
                  form.type === opt.value
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}
              >
                <span className="block">{opt.label}</span>
                <span className="block text-gray-500 font-normal mt-0.5">{opt.hint}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {generating ? 'Calculating...' : 'Generate summary'}
        </button>
      </form>

      {records.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm font-medium text-white">Generated summaries</p>
          {records.map(r => (
            <div key={r.id} className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium mr-2 ${
                    r.type === 'EKS' ? 'bg-blue-900 text-blue-400' : 'bg-purple-900 text-purple-400'
                  }`}>
                    {r.type === 'EKS' ? 'EKS — Estimate' : 'IKS — Actual'}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(r.periodStart).toLocaleDateString('en-DE')} — {new Date(r.periodEnd).toLocaleDateString('en-DE')}
                  </span>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-gray-800 text-gray-400">{r.status}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                <div>
                  <p className="text-xs text-gray-500">Total income</p>
                  <p className="text-emerald-400 font-medium">€{r.totalIncome.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Total expenses</p>
                  <p className="text-red-400 font-medium">€{r.totalExpenses.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Profit (Gewinn)</p>
                  <p className="text-white font-medium">€{r.netProfit.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500">Freibetrag (estimated)</p>
                  <p className="text-white font-medium">€{r.freibetrag.toFixed(2)}</p>
                </div>
              </div>

              <div className="p-3 bg-amber-950 border border-amber-800 rounded-lg">
                <p className="text-xs text-amber-400">
                  Countable income estimate (anrechenbares Einkommen)
                </p>
                <p className="text-lg font-bold text-amber-300 mt-0.5">€{r.anrechenbares.toFixed(2)}</p>
                <p className="text-xs text-amber-600 mt-1">
                  Confirm this figure with your Jobcenter — your actual amount may differ.
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
