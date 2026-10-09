'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { eur, germanDate } from '@/lib/format'

type Transaction = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  grossAmount: number
  vatRate: number
  vatAmount: number
  businessAmount: number
  privateAmount: number
  businessPct: number
  description: string | null
  merchant: string | null
  usage: 'BUSINESS' | 'PRIVATE' | 'MIXED' | 'UNSURE'
  transactionDate: string
  category: { name: string } | null
  isAiClassified: boolean
  needsReview: boolean
}

type Filter = 'ALL' | 'INCOME' | 'EXPENSE' | 'REVIEW'

const USAGE_LABEL: Record<Transaction['usage'], string> = { BUSINESS: 'Business', PRIVATE: 'Private', MIXED: 'Mixed', UNSURE: 'Not sure' }

function Editor({ t, onSaved, onCancel }: { t: Transaction; onSaved: (t: Transaction) => void; onCancel: () => void }) {
  const [form, setForm] = useState({
    grossAmount: String(t.grossAmount),
    vatRate: t.vatRate,
    usage: t.usage,
    businessPct: t.usage === 'MIXED' ? t.businessPct : 50,
    transactionDate: t.transactionDate.slice(0, 10),
    description: t.description ?? '',
    merchant: t.merchant ?? '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const usages = t.type === 'INCOME' ? (['BUSINESS', 'PRIVATE', 'UNSURE'] as const) : (['BUSINESS', 'MIXED', 'PRIVATE', 'UNSURE'] as const)
  const field = 'w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm'

  async function save() {
    setSaving(true)
    setError('')
    const res = await fetch(`/api/v1/transactions/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, grossAmount: form.grossAmount.replace(',', '.'), businessPct: form.usage === 'MIXED' ? form.businessPct : 100 }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) return setError(body.error ?? 'Could not save.')
    onSaved({ ...t, ...body })
  }

  return (
    <div className="px-5 pb-4 space-y-3 bg-gray-950/40">
      <fieldset>
        <legend className="text-xs text-gray-300 mb-1">{t.type === 'INCOME' ? 'What kind of money?' : 'Business or private?'}</legend>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {usages.map(u => (
            <button key={u} type="button" aria-pressed={form.usage === u} onClick={() => setForm(f => ({ ...f, usage: u }))}
              className={`py-2 min-h-11 rounded-lg text-sm border ${form.usage === u ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
              {t.type === 'INCOME' && u === 'BUSINESS' ? 'Business income' : t.type === 'INCOME' && u === 'PRIVATE' ? 'Private / loan' : USAGE_LABEL[u]}
            </button>
          ))}
        </div>
        {form.usage === 'MIXED' && (
          <div className="mt-2">
            <label htmlFor={`pct-${t.id}`} className="text-xs text-gray-300">Business share: {form.businessPct} %</label>
            <input id={`pct-${t.id}`} type="range" min={5} max={95} step={5} value={form.businessPct} onChange={e => setForm(f => ({ ...f, businessPct: Number(e.target.value) }))} className="w-full accent-blue-500" />
          </div>
        )}
      </fieldset>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <div>
          <label htmlFor={`amt-${t.id}`} className="text-xs text-gray-300">Amount (€)</label>
          <input id={`amt-${t.id}`} inputMode="decimal" className={field} value={form.grossAmount} onChange={e => setForm(f => ({ ...f, grossAmount: e.target.value }))} />
        </div>
        <div>
          <label htmlFor={`vat-${t.id}`} className="text-xs text-gray-300">VAT</label>
          <select id={`vat-${t.id}`} className={field} value={form.vatRate} onChange={e => setForm(f => ({ ...f, vatRate: Number(e.target.value) }))}>
            <option value={19}>19 %</option>
            <option value={7}>7 %</option>
            <option value={0}>0 %</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label htmlFor={`date-${t.id}`} className="text-xs text-gray-300">Date</label>
          <input id={`date-${t.id}`} type="date" className={field} value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
        </div>
      </div>
      <div>
        <label htmlFor={`desc-${t.id}`} className="text-xs text-gray-300">Description</label>
        <input id={`desc-${t.id}`} className={field} maxLength={500} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={saving} className="flex-1 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">{saving ? 'Saving…' : 'Save correction'}</button>
        <button type="button" onClick={onCancel} className="px-4 min-h-11 bg-gray-800 text-gray-300 text-sm rounded-lg">Cancel</button>
      </div>
      <p className="text-xs text-gray-400">Every correction is kept in the history of this transaction.</p>
    </div>
  )
}

function TransactionsList() {
  const search = useSearchParams()
  const [filter, setFilter] = useState<Filter>(search.get('review') === '1' ? 'REVIEW' : 'ALL')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const load = useCallback((f: Filter) => {
    const url = f === 'ALL' ? '/api/v1/transactions?limit=200' : f === 'REVIEW' ? '/api/v1/transactions?review=1&limit=200' : `/api/v1/transactions?type=${f}&limit=200`
    return fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Transaction[]) => {
        setTransactions(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  useEffect(() => {
    load(filter)
  }, [filter, load])

  async function remove(id: string) {
    setActionError('')
    const res = await fetch(`/api/v1/transactions/${id}`, { method: 'DELETE' })
    if (!res.ok) return setActionError('Could not delete the transaction.')
    setConfirmDelete(null)
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-400 text-sm mt-1">All money in and out — correct anything at any time</p>
        </div>
        <Link href="/input" className="px-4 min-h-11 inline-flex items-center whitespace-nowrap shrink-0 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">+ Add</Link>
      </div>

      <div role="tablist" aria-label="Filter" className="flex flex-wrap gap-2">
        {(['ALL', 'INCOME', 'EXPENSE', 'REVIEW'] as const).map(f => (
          <button key={f} role="tab" aria-selected={filter === f} onClick={() => { setState('loading'); setFilter(f) }}
            className={`px-3 min-h-11 rounded-lg text-sm font-medium ${filter === f ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'}`}>
            {f === 'ALL' ? 'All' : f === 'INCOME' ? 'Money in' : f === 'EXPENSE' ? 'Money out' : 'Needs your decision'}
          </button>
        ))}
      </div>

      {actionError && <p role="alert" className="text-sm text-red-300">{actionError}</p>}
      {state === 'error' && <p role="alert" className="rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-red-200 text-sm">Could not load transactions. Please reload or sign in again.</p>}
      {state === 'loading' && <p className="text-gray-400 text-sm">Loading…</p>}

      {state === 'ready' && transactions.length === 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-300">{filter === 'REVIEW' ? 'Nothing to decide — all transactions are classified.' : 'No transactions yet.'}</p>
          {filter !== 'REVIEW' && <Link href="/input" className="text-blue-300 underline text-sm mt-2 inline-block">Add your first transaction</Link>}
        </div>
      )}

      {state === 'ready' && transactions.length > 0 && (
        <ul className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
          {transactions.map(t => (
            <li key={t.id}>
              <div className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.type === 'INCOME' ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>{t.type === 'INCOME' ? 'IN' : 'OUT'}</span>
                    {t.usage !== 'BUSINESS' && <span className={`text-xs px-2 py-0.5 rounded-full ${t.usage === 'UNSURE' ? 'bg-amber-900 text-amber-200' : 'bg-gray-800 text-gray-300'}`}>{USAGE_LABEL[t.usage]}{t.usage === 'MIXED' ? ` ${t.businessPct} %` : ''}</span>}
                    {t.isAiClassified && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-200">from receipt</span>}
                  </div>
                  <p className="text-sm text-white mt-1 truncate">{t.description || t.merchant || 'No description'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.merchant ? `${t.merchant} · ` : ''}{t.category?.name ? `${t.category.name} · ` : ''}{germanDate(t.transactionDate)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`text-base font-semibold ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}`}>{t.type === 'INCOME' ? '+' : '−'}{eur(t.grossAmount)}</p>
                  {t.vatAmount > 0 && <p className="text-xs text-gray-400">incl. {eur(t.vatAmount)} VAT</p>}
                  <div className="flex gap-3 justify-end mt-1">
                    <button type="button" onClick={() => setEditing(editing === t.id ? null : t.id)} className="text-xs text-blue-300 underline min-h-8">Correct</button>
                    <button type="button" onClick={() => setConfirmDelete(t.id)} className="text-xs text-gray-400 underline min-h-8">Delete</button>
                  </div>
                </div>
              </div>
              {confirmDelete === t.id && (
                <div className="px-5 pb-4 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-red-200">Delete this transaction? A linked receipt goes back to review.</span>
                  <button type="button" onClick={() => remove(t.id)} className="px-3 min-h-11 bg-red-700 text-white rounded-lg">Delete</button>
                  <button type="button" onClick={() => setConfirmDelete(null)} className="px-3 min-h-11 bg-gray-800 text-gray-300 rounded-lg">Keep</button>
                </div>
              )}
              {editing === t.id && (
                <Editor
                  t={t}
                  onCancel={() => setEditing(null)}
                  onSaved={u => {
                    setEditing(null)
                    setTransactions(prev => (filter === 'REVIEW' && !u.needsReview ? prev.filter(x => x.id !== u.id) : prev.map(x => (x.id === u.id ? u : x))))
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      <GuidanceInfoBox
        title="What belongs here?"
        whatIsThis="Every payment that came into or left your business account or cash box."
        examples={['Customer payments → business income', 'Your own savings or a loan → private money, not income', '“Not sure” items are left out of profit and taxes until you decide']}
        whyItMatters="Complete and correctly classified records make the tax estimate and your Steuerberater’s work reliable."
        importantNote="Corrections are always possible and are kept in the history."
      />
    </div>
  )
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<p className="text-gray-400 text-sm">Loading…</p>}>
      <TransactionsList />
    </Suspense>
  )
}
