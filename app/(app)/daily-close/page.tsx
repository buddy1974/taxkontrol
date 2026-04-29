'use client'

import { useEffect, useState } from 'react'

type DailyClose = { id: string; date: string; cashStart: number; cashSales: number; cashExpenses: number; cashEnd: number; cashDiff: number; notes: string | null; closedAt: string | null }

export default function DailyClosePage() {
  const [closes, setCloses] = useState<DailyClose[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], cashStart: '', cashSales: '', cashExpenses: '', cashEnd: '', notes: '' })

  useEffect(() => {
    fetch('/api/v1/daily-close').then(r => r.json()).then(data => { setCloses(data); setLoading(false) })
  }, [])

  const start = parseFloat(form.cashStart || '0')
  const sales = parseFloat(form.cashSales || '0')
  const expenses = parseFloat(form.cashExpenses || '0')
  const end = parseFloat(form.cashEnd || '0')
  const expected = start + sales - expenses
  const diff = end - expected

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/v1/daily-close', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const newClose = await res.json()
    setCloses(prev => [newClose, ...prev.filter(c => c.id !== newClose.id)])
    setSaving(false)
    setForm(prev => ({ ...prev, cashStart: '', cashSales: '', cashExpenses: '', cashEnd: '', notes: '' }))
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Daily close</h1>
        <p className="text-gray-500 text-sm mt-1">End of day cash check (Tagesabschluss)</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <p className="text-sm font-medium text-white">Close today</p>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date</label>
          <input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            { key: 'cashStart', label: 'Cash at start (€)' },
            { key: 'cashSales', label: 'Cash sales today (€)' },
            { key: 'cashExpenses', label: 'Cash expenses today (€)' },
            { key: 'cashEnd', label: 'Actual cash at end (€)' },
          ].map(field => (
            <div key={field.key}>
              <label className="block text-xs text-gray-400 mb-1">{field.label}</label>
              <input type="number" step="0.01" value={(form as any)[field.key]} onChange={e => setForm(p => ({ ...p, [field.key]: e.target.value }))} placeholder="0.00" className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          ))}
        </div>

        {(form.cashEnd || form.cashStart) && (
          <div className={`rounded-lg p-4 border ${Math.abs(diff) < 0.01 ? 'bg-emerald-950 border-emerald-800' : 'bg-red-950 border-red-800'}`}>
            <p className="text-sm font-medium text-white">Cash check</p>
            <p className="text-xs text-gray-400 mt-1">Expected: €{expected.toFixed(2)}</p>
            <p className={`text-sm font-semibold mt-1 ${Math.abs(diff) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>
              {Math.abs(diff) < 0.01 ? '✓ Cash matches' : diff > 0 ? `+€${diff.toFixed(2)} over` : `-€${Math.abs(diff).toFixed(2)} short — check missing entries`}
            </p>
          </div>
        )}

        <div>
          <label className="block text-xs text-gray-400 mb-1">Notes (optional)</label>
          <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any issues today?" className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500" />
        </div>

        <button type="submit" disabled={saving} className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">{saving ? 'Saving...' : 'Close the day'}</button>
      </form>

      {closes.length > 0 && (
        <div>
          <p className="text-sm font-medium text-white mb-3">Recent closes</p>
          <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
            {closes.map(c => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm text-white">{new Date(c.date).toLocaleDateString('en-DE')}</p>
                  {c.notes && <p className="text-xs text-gray-500 mt-0.5">{c.notes}</p>}
                </div>
                <p className={`text-sm font-medium ${Math.abs(c.cashDiff) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Math.abs(c.cashDiff) < 0.01 ? '✓ Matched' : `Diff: €${c.cashDiff.toFixed(2)}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
