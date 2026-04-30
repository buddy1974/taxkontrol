'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import ReceiptUpload from '@/components/input/ReceiptUpload'

type Category = {
  id: string
  name: string
  nameDe: string | null
  type: string
}

const VAT_RATES = [
  { label: 'No VAT — Kleinunternehmer or private', value: 0 },
  { label: '7% — Reduced rate (food, books)', value: 7 },
  { label: '19% — Standard rate (most goods/services)', value: 19 },
]

export default function InputPage() {
  const router = useRouter()
  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('INCOME')
  const [form, setForm] = useState({
    grossAmount: '',
    vatRate: 19,
    description: '',
    merchant: '',
    categoryId: '',
    usage: 'BUSINESS',
    businessPct: 100,
    paymentMethod: 'BANK',
    transactionDate: new Date().toISOString().split('T')[0],
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [receiptPrefilled, setReceiptPrefilled] = useState(false)
  const [quickText, setQuickText] = useState('')
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    fetch('/api/v1/categories')
      .then(r => r.json())
      .then(data => setCategories(data))
  }, [])

  const filteredCategories = categories.filter(c => c.type === type)

  const gross = parseFloat(form.grossAmount) || 0
  const vatMultiplier = 1 + form.vatRate / 100
  const net = gross / vatMultiplier
  const vat = gross - net
  const businessAmount = type === 'EXPENSE'
    ? (net * form.businessPct) / 100
    : net
  const privateAmount = type === 'EXPENSE' ? net - businessAmount : 0

  async function handleQuickText() {
    if (!quickText.trim()) return
    setExtracting(true)
    const res = await fetch('/api/v1/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: quickText }),
    })
    const data = await res.json()
    if (data.amount) setForm(prev => ({ ...prev, grossAmount: String(data.amount) }))
    if (data.vatRate !== null) setForm(prev => ({ ...prev, vatRate: data.vatRate ?? 19 }))
    if (data.date) setForm(prev => ({ ...prev, transactionDate: data.date ?? prev.transactionDate }))
    if (data.description) setForm(prev => ({ ...prev, description: data.description ?? '' }))
    if (data.merchant) setForm(prev => ({ ...prev, merchant: data.merchant ?? '' }))
    if (data.type === 'INCOME' || data.type === 'EXPENSE') setType(data.type)
    setExtracting(false)
    setQuickText('')
  }

  function handleExtracted(data: {
    merchant: string | null
    amount: number | null
    vatRate: number | null
    date: string | null
    description: string | null
    type: string | null
  }) {
    if (data.amount) setForm(prev => ({ ...prev, grossAmount: String(data.amount) }))
    if (data.vatRate !== null) setForm(prev => ({ ...prev, vatRate: data.vatRate ?? 19 }))
    if (data.date) setForm(prev => ({ ...prev, transactionDate: data.date ?? prev.transactionDate }))
    if (data.description) setForm(prev => ({ ...prev, description: data.description ?? '' }))
    if (data.merchant) setForm(prev => ({ ...prev, merchant: data.merchant ?? '' }))
    if (data.type === 'INCOME' || data.type === 'EXPENSE') setType(data.type)
    setReceiptPrefilled(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, type }),
    })

    if (!res.ok) {
      const data = await res.json()
      setError(data.error || 'Something went wrong.')
      setLoading(false)
      return
    }

    setSuccess(true)
    setReceiptPrefilled(false)
    setLoading(false)
    setTimeout(() => {
      setSuccess(false)
      setForm(prev => ({
        ...prev,
        grossAmount: '',
        description: '',
        merchant: '',
        categoryId: '',
      }))
    }, 2000)
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add transaction</h1>
        <p className="text-gray-500 text-sm mt-1">Record income or an expense</p>
      </div>

      {/* Type toggle */}
      <div className="flex bg-gray-900 rounded-xl p-1 mb-6 border border-gray-800">
        {(['INCOME', 'EXPENSE'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setType(t)
              setForm(prev => ({ ...prev, categoryId: '' }))
            }}
            className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              type === t
                ? t === 'INCOME'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-600 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            {t === 'INCOME' ? '+ Money in' : '− Money out'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Type naturally — AI will fill in the form (optional)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleQuickText() } }}
              placeholder='e.g. "Adobe €119 invoice today" or "received €500 from client"'
              className="flex-1 bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              type="button"
              onClick={handleQuickText}
              disabled={extracting || !quickText.trim()}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {extracting ? '...' : 'Fill'}
            </button>
          </div>
          <p className="text-xs text-gray-600 mt-1">Press Enter or tap Fill — AI reads your text and fills the form</p>
        </div>

        <ReceiptUpload onExtracted={handleExtracted} />

        {receiptPrefilled && (
          <div className="rounded-lg bg-blue-950 border border-blue-800 px-4 py-2 text-blue-400 text-xs">
            Receipt data loaded — review and confirm below
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Total amount including VAT (Bruttobetrag)
          </label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">€</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.grossAmount}
              onChange={e => setForm(prev => ({ ...prev, grossAmount: e.target.value }))}
              required
              className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg pl-8 pr-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* VAT rate */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            VAT rate — tax on sales (Umsatzsteuer / MwSt)
          </label>
          <select
            value={form.vatRate}
            onChange={e => setForm(prev => ({ ...prev, vatRate: parseInt(e.target.value) }))}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            {VAT_RATES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {/* Tax split preview */}
        {gross > 0 && (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 space-y-2">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Tax split preview
            </p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">
                {type === 'INCOME' ? 'You receive (gross)' : 'You pay (gross)'}
              </span>
              <span className="text-white font-medium">€{gross.toFixed(2)}</span>
            </div>
            {form.vatRate > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">
                  VAT portion — goes to Finanzamt (MwSt)
                </span>
                <span className="text-yellow-400">€{vat.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-gray-800 pt-2">
              <span className="text-gray-400">
                {type === 'INCOME' ? 'Your net income' : 'Net expense (business)'}
              </span>
              <span className={type === 'INCOME' ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                €{type === 'INCOME' ? net.toFixed(2) : businessAmount.toFixed(2)}
              </span>
            </div>
            {type === 'EXPENSE' && form.usage === 'MIXED' && privateAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-400">Private portion (not deductible)</span>
                <span className="text-gray-500">€{privateAmount.toFixed(2)}</span>
              </div>
            )}
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="What was this for?"
          />
        </div>

        {/* Merchant */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            {type === 'INCOME' ? 'Customer name' : 'Supplier / shop name'}
          </label>
          <input
            type="text"
            value={form.merchant}
            onChange={e => setForm(prev => ({ ...prev, merchant: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder={type === 'INCOME' ? 'Client GmbH' : 'Amazon, Ikea...'}
          />
        </div>

        {/* Category */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Category</label>
          <select
            value={form.categoryId}
            onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value }))}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Select a category</option>
            {filteredCategories.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.nameDe ? ` — ${c.nameDe}` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Usage — only for expenses */}
        {type === 'EXPENSE' && (
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              Was this for business or private? (Verwendungszweck)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'BUSINESS', label: 'Business' },
                { value: 'PRIVATE', label: 'Private' },
                { value: 'MIXED', label: 'Mixed' },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm(prev => ({
                    ...prev,
                    usage: opt.value,
                    businessPct: opt.value === 'BUSINESS' ? 100 : opt.value === 'PRIVATE' ? 0 : 50,
                  }))}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                    form.usage === opt.value
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {form.usage === 'MIXED' && (
              <div className="mt-3">
                <label className="block text-sm text-gray-400 mb-1">
                  Business portion: {form.businessPct}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={form.businessPct}
                  onChange={e => setForm(prev => ({ ...prev, businessPct: parseInt(e.target.value) }))}
                  className="w-full accent-blue-500"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>0% business</span>
                  <span>100% business</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Payment method */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            How was this paid? (Zahlungsart)
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'BANK', label: 'Bank transfer' },
              { value: 'CARD', label: 'Card' },
              { value: 'CASH', label: 'Cash — Bargeld' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(prev => ({ ...prev, paymentMethod: opt.value }))}
                className={`py-2 rounded-lg text-sm font-medium transition-colors border ${
                  form.paymentMethod === opt.value
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Date (Datum)</label>
          <input
            type="date"
            value={form.transactionDate}
            onChange={e => setForm(prev => ({ ...prev, transactionDate: e.target.value }))}
            required
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        {success && (
          <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-3 text-emerald-400 text-sm">
            Transaction saved successfully.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
          >
            {loading ? 'Saving...' : 'Save transaction'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/transactions')}
            className="px-4 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-900 border border-gray-800 transition-colors"
          >
            View all
          </button>
        </div>
      </form>
    </div>
  )
}
