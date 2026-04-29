'use client'

import { useEffect, useState } from 'react'

type Receivable = {
  id: string
  customerName: string
  description: string | null
  totalAmount: number
  paidAmount: number
  outstandingAmount: number
  dueDate: string | null
  status: string
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-900 text-blue-400',
  PARTIAL: 'bg-amber-900 text-amber-400',
  PAID: 'bg-emerald-900 text-emerald-400',
  OVERDUE: 'bg-red-900 text-red-400',
}

export default function CustomersPage() {
  const [items, setItems] = useState<Receivable[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payingId, setPayingId] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [form, setForm] = useState({
    customerName: '',
    description: '',
    totalAmount: '',
    dueDate: '',
  })

  useEffect(() => {
    fetch('/api/v1/receivables')
      .then(r => r.json())
      .then(data => {
        setItems(data)
        setLoading(false)
      })
  }, [])

  const totalOutstanding = items
    .filter(i => i.status !== 'PAID')
    .reduce((s, i) => s + i.outstandingAmount, 0)

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    const res = await fetch('/api/v1/receivables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const newItem = await res.json()
    setItems(prev => [newItem, ...prev])
    setShowForm(false)
    setSaving(false)
    setForm({ customerName: '', description: '', totalAmount: '', dueDate: '' })
  }

  async function handlePay(id: string) {
    const res = await fetch('/api/v1/receivables', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, paidAmount: parseFloat(payAmount) }),
    })
    const updated = await res.json()
    setItems(prev => prev.map(i => i.id === id ? updated : i))
    setPayingId(null)
    setPayAmount('')
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Customers owe me</h1>
          <p className="text-gray-500 text-sm mt-1">
            Unpaid invoices and outstanding payments (Offene Forderungen)
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg"
        >
          + Add invoice
        </button>
      </div>

      {/* Total outstanding */}
      <div className={`rounded-xl border p-5 ${
        totalOutstanding > 0
          ? 'bg-amber-950 border-amber-800'
          : 'bg-emerald-950 border-emerald-800'
      }`}>
        <p className="text-sm text-gray-400">Total outstanding</p>
        <p className={`text-3xl font-bold mt-1 ${
          totalOutstanding > 0 ? 'text-amber-400' : 'text-emerald-400'
        }`}>
          €{totalOutstanding.toFixed(2)}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          {items.filter(i => i.status !== 'PAID').length} open invoice(s)
        </p>
      </div>

      {/* Add form */}
      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl bg-gray-900 border border-blue-800 p-5 space-y-4">
          <p className="text-sm font-medium text-white">New invoice</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Customer name</label>
              <input
                type="text"
                value={form.customerName}
                onChange={e => setForm(p => ({ ...p, customerName: e.target.value }))}
                required
                placeholder="Client GmbH"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Amount (€)</label>
              <input
                type="number"
                step="0.01"
                value={form.totalAmount}
                onChange={e => setForm(p => ({ ...p, totalAmount: e.target.value }))}
                required
                placeholder="1500.00"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Description</label>
              <input
                type="text"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Invoice #2024-016"
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Due date</label>
              <input
                type="date"
                value={form.dueDate}
                onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50">
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:text-white">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* List */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {items.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400">No invoices yet.</p>
          </div>
        ) : (
          items.map(item => (
            <div key={item.id} className="px-5 py-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-white">{item.customerName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[item.status]}`}>
                      {item.status}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.description}</p>
                  )}
                  {item.dueDate && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Due: {new Date(item.dueDate).toLocaleDateString('en-DE')}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold text-emerald-400">
                    €{item.outstandingAmount.toFixed(2)}
                  </p>
                  {item.paidAmount > 0 && (
                    <p className="text-xs text-gray-500">
                      Paid: €{item.paidAmount.toFixed(2)}
                    </p>
                  )}
                </div>
              </div>

              {item.status !== 'PAID' && (
                <div className="mt-3">
                  {payingId === item.id ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
                        <input
                          type="number"
                          step="0.01"
                          value={payAmount}
                          onChange={e => setPayAmount(e.target.value)}
                          placeholder={item.outstandingAmount.toFixed(2)}
                          className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                          autoFocus
                        />
                      </div>
                      <button onClick={() => handlePay(item.id)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm rounded-lg">
                        Record payment
                      </button>
                      <button onClick={() => setPayingId(null)} className="px-3 py-2 bg-gray-800 text-gray-400 text-sm rounded-lg hover:text-white">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setPayingId(item.id)
                        setPayAmount(item.outstandingAmount.toFixed(2))
                      }}
                      className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
                    >
                      Record payment →
                    </button>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
