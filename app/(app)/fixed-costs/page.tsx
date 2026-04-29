'use client'

import { useEffect, useState } from 'react'

type FixedCost = {
  id: string
  name: string
  amount: number
  usage: string
  frequency: string
  dayOfMonth: number
  isActive: boolean
}

const FREQ_LABELS: Record<string, string> = {
  MONTHLY: 'Monthly',
  QUARTERLY: 'Every 3 months',
  YEARLY: 'Yearly',
}

const USAGE_LABELS: Record<string, string> = {
  BUSINESS: 'Business',
  PRIVATE: 'Private',
  MIXED: 'Mixed',
}

export default function FixedCostsPage() {
  const [costs, setCosts] = useState<FixedCost[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    amount: '',
    usage: 'BUSINESS',
    frequency: 'MONTHLY',
    dayOfMonth: '1',
  })

  useEffect(() => {
    fetch('/api/v1/fixed-costs')
      .then(r => r.json())
      .then(data => {
        setCosts(data)
        setLoading(false)
      })
  }, [])

  const activeCosts = costs.filter(c => c.isActive)
  const monthlyTotal = activeCosts.reduce((sum, c) => {
    if (c.frequency === 'MONTHLY') return sum + c.amount
    if (c.frequency === 'QUARTERLY') return sum + c.amount / 3
    if (c.frequency === 'YEARLY') return sum + c.amount / 12
    return sum
  }, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/v1/fixed-costs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: parseFloat(form.amount),
        dayOfMonth: parseInt(form.dayOfMonth),
      }),
    })
    const newCost = await res.json()
    setCosts(prev => [...prev, newCost])
    setShowForm(false)
    setSaving(false)
    setForm({ name: '', amount: '', usage: 'BUSINESS', frequency: 'MONTHLY', dayOfMonth: '1' })
  }

  async function toggleActive(id: string, isActive: boolean) {
    const res = await fetch('/api/v1/fixed-costs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, isActive: !isActive }),
    })
    const updated = await res.json()
    setCosts(prev => prev.map(c => c.id === id ? updated : c))
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Fixed costs</h1>
          <p className="text-gray-500 text-sm mt-1">
            Recurring costs deducted every month (Fixkosten)
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add cost
        </button>
      </div>

      {/* Monthly total */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <p className="text-sm text-gray-400">Total monthly fixed costs</p>
        <p className="text-3xl font-bold text-white mt-1">
          €{monthlyTotal.toFixed(2)}
          <span className="text-base font-normal text-gray-500 ml-2">/ month</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">
          This is deducted before calculating your safe-to-spend
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900 border border-blue-800 p-5 space-y-4">
          <p className="text-sm font-medium text-white">New fixed cost</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                required
                placeholder="Office rent"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount (€)</label>
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
                required
                placeholder="800.00"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Usage</label>
              <select
                value={form.usage}
                onChange={e => setForm(p => ({ ...p, usage: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="BUSINESS">Business</option>
                <option value="PRIVATE">Private</option>
                <option value="MIXED">Mixed</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Frequency</label>
              <select
                value={form.frequency}
                onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Day of month</label>
              <input
                type="number"
                min="1"
                max="31"
                value={form.dayOfMonth}
                onChange={e => setForm(p => ({ ...p, dayOfMonth: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:text-white"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Cost list */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {costs.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400">No fixed costs yet.</p>
          </div>
        ) : (
          costs.map(c => (
            <div key={c.id} className={`flex items-center justify-between px-5 py-4 ${
              !c.isActive ? 'opacity-40' : ''
            }`}>
              <div>
                <p className="text-sm text-white font-medium">{c.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {USAGE_LABELS[c.usage]} · {FREQ_LABELS[c.frequency]} · day {c.dayOfMonth}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold text-white">
                  €{c.amount.toFixed(2)}
                </p>
                <button
                  onClick={() => toggleActive(c.id, c.isActive)}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    c.isActive
                      ? 'bg-gray-800 text-gray-400 hover:bg-red-900 hover:text-red-400'
                      : 'bg-gray-800 text-gray-500 hover:bg-emerald-900 hover:text-emerald-400'
                  }`}
                >
                  {c.isActive ? 'Deactivate' : 'Activate'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
