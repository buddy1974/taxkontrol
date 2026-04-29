'use client'

import { useEffect, useState } from 'react'

type Reserve = {
  id: string
  type: 'VAT' | 'INCOME_TAX' | 'TRADE_TAX'
  periodStart: string
  periodEnd: string
  shouldHave: number
  actuallyReserved: number
  missing: number
}

const TYPE_LABELS: Record<string, { label: string; sublabel: string }> = {
  VAT: {
    label: 'VAT reserve',
    sublabel: 'Tax you collected for Finanzamt (Umsatzsteuer / MwSt)',
  },
  INCOME_TAX: {
    label: 'Income tax reserve',
    sublabel: 'Tax on your profit (Einkommensteuer)',
  },
  TRADE_TAX: {
    label: 'Trade tax reserve',
    sublabel: 'Local business tax (Gewerbesteuer)',
  },
}

export default function TaxPage() {
  const [reserves, setReserves] = useState<Reserve[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/v1/tax-reserve')
      .then(r => r.json())
      .then(data => {
        setReserves(data)
        setLoading(false)
      })
  }, [])

  const totalShouldHave = reserves.reduce((s, r) => s + r.shouldHave, 0)
  const totalReserved = reserves.reduce((s, r) => s + r.actuallyReserved, 0)
  const totalMissing = reserves.reduce((s, r) => s + r.missing, 0)

  async function saveReserve(id: string) {
    setSaving(true)
    const res = await fetch('/api/v1/tax-reserve', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, actuallyReserved: parseFloat(editValue) }),
    })
    const updated = await res.json()
    setReserves(prev => prev.map(r => r.id === id ? updated : r))
    setEditing(null)
    setSaving(false)
  }

  if (loading) {
    return <div className="text-gray-500 text-sm">Loading...</div>
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Tax reserve</h1>
        <p className="text-gray-500 text-sm mt-1">
          Money you must set aside for the Finanzamt (Steuerrücklage)
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Must save</p>
          <p className="text-xl font-bold text-white mt-1">
            €{totalShouldHave.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Actually saved</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">
            €{totalReserved.toFixed(2)}
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${
          totalMissing > 0
            ? 'bg-red-950 border-red-800'
            : 'bg-emerald-950 border-emerald-800'
        }`}>
          <p className="text-xs text-gray-500">Missing</p>
          <p className={`text-xl font-bold mt-1 ${
            totalMissing > 0 ? 'text-red-400' : 'text-emerald-400'
          }`}>
            {totalMissing > 0 ? `-€${totalMissing.toFixed(2)}` : '✓ On track'}
          </p>
        </div>
      </div>

      {/* Reserve cards */}
      {reserves.length === 0 ? (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No tax reserves set up yet.</p>
          <p className="text-gray-500 text-sm mt-1">
            Add income transactions and reserves will be calculated automatically.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {reserves.map(r => {
            const pct = r.shouldHave > 0
              ? Math.min(100, (r.actuallyReserved / r.shouldHave) * 100)
              : 100
            const info = TYPE_LABELS[r.type] ?? { label: r.type, sublabel: '' }
            const isEditing = editing === r.id

            return (
              <div key={r.id} className="rounded-xl bg-gray-900 border border-gray-800 p-5">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className="text-sm font-medium text-white">{info.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{info.sublabel}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    r.missing > 0
                      ? 'bg-red-900 text-red-400'
                      : 'bg-emerald-900 text-emerald-400'
                  }`}>
                    {r.missing > 0 ? `Missing €${r.missing.toFixed(2)}` : 'On track'}
                  </span>
                </div>

                <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      r.missing > 0 ? 'bg-red-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-between text-sm mb-4">
                  <div>
                    <p className="text-xs text-gray-500">Should have</p>
                    <p className="text-white font-medium">€{r.shouldHave.toFixed(2)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Actually reserved</p>
                    <p className="text-emerald-400 font-medium">€{r.actuallyReserved.toFixed(2)}</p>
                  </div>
                </div>

                {isEditing ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        autoFocus
                      />
                    </div>
                    <button
                      onClick={() => saveReserve(r.id)}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setEditing(r.id)
                      setEditValue(r.actuallyReserved.toString())
                    }}
                    className="w-full py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 text-sm transition-colors"
                  >
                    Update reserved amount
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
