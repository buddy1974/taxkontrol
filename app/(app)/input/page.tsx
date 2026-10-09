'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import ReceiptUpload from '@/components/input/ReceiptUpload'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { computeTransactionAmounts, TransactionValidationError, type TaxType, type Usage } from '@/lib/finance/transactionAmounts'
import { fromCents } from '@/lib/finance/money'
import { eur } from '@/lib/format'

type Category = { id: string; name: string; nameDe: string | null; type: string }
type TxType = 'INCOME' | 'EXPENSE'

const VAT_RATES = [
  { label: '19 % — standard rate', value: 19 },
  { label: '7 % — reduced rate (e.g. food, books, restaurant meals)', value: 7 },
  { label: '0 % — no VAT on this receipt', value: 0 },
]

const USAGE_OPTIONS: Record<TxType, Array<{ value: Usage; label: string; hint: string }>> = {
  INCOME: [
    { value: 'BUSINESS', label: 'Business income', hint: 'Payment from a customer' },
    { value: 'PRIVATE', label: 'Private money', hint: 'Own deposit, loan, private refund — not income' },
    { value: 'UNSURE', label: 'Not sure', hint: 'Left out of profit until you decide' },
  ],
  EXPENSE: [
    { value: 'BUSINESS', label: 'Business', hint: 'Only for the business' },
    { value: 'PRIVATE', label: 'Private', hint: 'Not deductible' },
    { value: 'MIXED', label: 'Mixed', hint: 'Partly business, e.g. phone' },
    { value: 'UNSURE', label: 'Not sure', hint: 'Not deductible until you decide' },
  ],
}

const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })

function InputForm() {
  const router = useRouter()
  const search = useSearchParams()
  const initialType: TxType = search.get('type') === 'EXPENSE' ? 'EXPENSE' : 'INCOME'

  const [type, setType] = useState<TxType>(initialType)
  const [taxType, setTaxType] = useState<TaxType | null>(null)
  const [form, setForm] = useState({
    grossAmount: '',
    vatRate: 19,
    description: '',
    merchant: '',
    categoryId: '',
    usage: 'BUSINESS' as Usage,
    businessPct: 50,
    paymentMethod: 'BANK',
    transactionDate: todayIso(),
  })
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; field?: string } | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [receiptPrefilled, setReceiptPrefilled] = useState(false)
  const [documentId, setDocumentId] = useState<string | null>(null)
  const [quickText, setQuickText] = useState('')
  const [extracting, setExtracting] = useState(false)

  useEffect(() => {
    fetch('/api/v1/categories').then(r => (r.ok ? r.json() : [])).then(setCategories).catch(() => setCategories([]))
    fetch('/api/v1/settings')
      .then(r => (r.ok ? r.json() : null))
      .then(s => setTaxType((s?.taxType as TaxType) ?? 'REGELBESTEUERUNG'))
      .catch(() => setTaxType('REGELBESTEUERUNG'))
  }, [])

  const isKlein = taxType === 'KLEINUNTERNEHMER'
  const showVat = !isKlein && !(type === 'INCOME' && form.usage !== 'BUSINESS')
  const effectiveVat = showVat ? form.vatRate : 0

  const preview = useMemo(() => {
    if (!taxType || !form.grossAmount) return null
    try {
      return computeTransactionAmounts({
        type,
        grossAmount: form.grossAmount.replace(',', '.'),
        vatRate: effectiveVat,
        usage: form.usage,
        businessPct: form.usage === 'MIXED' ? form.businessPct : 100,
        taxType,
      })
    } catch (e) {
      return e instanceof TransactionValidationError ? e : null
    }
  }, [taxType, type, form.grossAmount, form.usage, form.businessPct, effectiveVat])

  function applySuggestion(data: { merchant: string | null; amount: number | null; vatRate: number | null; date: string | null; description: string | null; type: string | null }) {
    setForm(prev => ({
      ...prev,
      grossAmount: data.amount ? String(data.amount) : prev.grossAmount,
      vatRate: data.vatRate ?? prev.vatRate,
      transactionDate: data.date ?? prev.transactionDate,
      description: data.description ?? prev.description,
      merchant: data.merchant ?? prev.merchant,
    }))
    if (data.type === 'INCOME' || data.type === 'EXPENSE') setType(data.type)
  }

  async function handleQuickText() {
    if (!quickText.trim()) return
    setExtracting(true)
    try {
      const res = await fetch('/api/v1/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: quickText }) })
      if (res.ok) applySuggestion(await res.json())
      setQuickText('')
    } finally {
      setExtracting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const res = await fetch('/api/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        grossAmount: form.grossAmount.replace(',', '.'),
        vatRate: effectiveVat,
        businessPct: form.usage === 'MIXED' ? form.businessPct : 100,
        type,
        documentId,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setLoading(false)
    if (!res.ok) {
      setError({ message: data.error ?? 'Something went wrong.', field: data.field })
      return
    }
    setSavedId(data.id)
    setReceiptPrefilled(false)
    setDocumentId(null)
    setForm(prev => ({ ...prev, grossAmount: '', description: '', merchant: '', categoryId: '' }))
  }

  const filteredCategories = categories.filter(c => c.type === type)
  const field = 'w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 text-base sm:text-sm focus:outline-none focus:border-blue-500'
  const invalid = (name: string) => (error?.field === name ? { 'aria-invalid': true, 'aria-describedby': 'form-error' } : {})

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Add transaction</h1>
        <p className="text-gray-400 text-sm mt-1">Record money that came in or went out</p>
      </div>

      <div role="tablist" aria-label="Direction" className="flex bg-gray-900 rounded-xl p-1 mb-6 border border-gray-800">
        {(['INCOME', 'EXPENSE'] as const).map(t => (
          <button
            key={t}
            role="tab"
            aria-selected={type === t}
            type="button"
            onClick={() => {
              setType(t)
              setForm(prev => ({ ...prev, categoryId: '', usage: 'BUSINESS' }))
            }}
            className={`flex-1 py-2.5 min-h-11 rounded-lg text-sm font-medium transition-colors ${
              type === t ? (t === 'INCOME' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white') : 'text-gray-300 hover:text-white'
            }`}
          >
            {t === 'INCOME' ? '+ Money in' : '− Money out'}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label htmlFor="quick" className="block text-sm text-gray-300 mb-1">Describe it in your own words (optional)</label>
          <div className="flex gap-2">
            <input
              id="quick"
              type="text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleQuickText()
                }
              }}
              placeholder='e.g. "Adobe 119 € today"'
              className={`${field} flex-1`}
            />
            <button type="button" onClick={handleQuickText} disabled={extracting || !quickText.trim()} className="px-4 min-h-11 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg disabled:opacity-50">
              {extracting ? '…' : 'Fill in'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-1">AI suggests the fields below — always check them before saving.</p>
        </div>

        <ReceiptUpload
          onExtracted={(data, docId) => {
            applySuggestion(data)
            setDocumentId(docId)
            setReceiptPrefilled(true)
          }}
        />
        {receiptPrefilled && (
          <p role="status" className="rounded-lg bg-blue-950 border border-blue-800 px-4 py-2 text-blue-200 text-xs">
            Receipt saved — please check every field. Saving this form books the receipt; it will not be booked twice.
          </p>
        )}

        <fieldset>
          <legend className="block text-sm text-gray-300 mb-2">{type === 'INCOME' ? 'What kind of money is this?' : 'Was this for the business?'}</legend>
          <div className={`grid gap-2 ${type === 'INCOME' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
            {USAGE_OPTIONS[type].map(opt => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={form.usage === opt.value}
                onClick={() => setForm(prev => ({ ...prev, usage: opt.value }))}
                className={`text-left p-3 min-h-11 rounded-lg text-sm border transition-colors ${
                  form.usage === opt.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white'
                }`}
              >
                <span className="block font-medium">{opt.label}</span>
                <span className="block text-xs opacity-80">{opt.hint}</span>
              </button>
            ))}
          </div>
          {form.usage === 'MIXED' && (
            <div className="mt-3">
              <label htmlFor="pct" className="block text-sm text-gray-300 mb-1">Business share: {form.businessPct} %</label>
              <input id="pct" type="range" min={5} max={95} step={5} value={form.businessPct} onChange={e => setForm(prev => ({ ...prev, businessPct: Number(e.target.value) }))} className="w-full accent-blue-500" />
            </div>
          )}
        </fieldset>

        <div>
          <label htmlFor="amount" className="block text-sm text-gray-300 mb-1">
            Total amount {isKlein ? '' : '(incl. VAT, Bruttobetrag)'}
          </label>
          <div className="relative">
            <input
              id="amount"
              inputMode="decimal"
              value={form.grossAmount}
              onChange={e => setForm(prev => ({ ...prev, grossAmount: e.target.value }))}
              required
              className={`${field} pr-10`}
              placeholder="0,00"
              {...invalid('grossAmount')}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true">€</span>
          </div>
        </div>

        {showVat && (
          <div>
            <label htmlFor="vat" className="block text-sm text-gray-300 mb-1">VAT rate on this {type === 'INCOME' ? 'invoice' : 'receipt'}</label>
            <select id="vat" value={form.vatRate} onChange={e => setForm(prev => ({ ...prev, vatRate: Number(e.target.value) }))} className={field} {...invalid('vatRate')}>
              {VAT_RATES.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
        )}
        {isKlein && (
          <p className="text-xs text-gray-400">
            Kleinunternehmer: no VAT is added to your invoices and receipts count with their full amount.
          </p>
        )}

        {preview && !(preview instanceof TransactionValidationError) && (
          <div className="rounded-lg bg-gray-900 border border-gray-800 p-4 space-y-1 text-sm" aria-live="polite">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">What this means</p>
            {preview.vatCents > 0 && (
              <p className="flex justify-between text-gray-300">
                <span>{type === 'INCOME' ? 'VAT you owe the Finanzamt' : 'VAT you can deduct (Vorsteuer)'}</span>
                <span className="text-yellow-300">{eur(fromCents(type === 'INCOME' ? preview.outputVatCents : preview.deductibleVatCents))}</span>
              </p>
            )}
            {preview.businessCents > 0 && (
              <p className="flex justify-between text-gray-300">
                <span>{type === 'INCOME' ? 'Counts as business income' : 'Counts as business expense'}</span>
                <span className={type === 'INCOME' ? 'text-emerald-300' : 'text-red-300'}>{eur(fromCents(preview.businessCents))}</span>
              </p>
            )}
            {preview.privateCents > 0 && (
              <p className="flex justify-between text-gray-400">
                <span>{type === 'INCOME' ? 'Private money — not income' : 'Private part — not deductible'}</span>
                <span>{eur(fromCents(preview.privateCents))}</span>
              </p>
            )}
            {preview.unclearCents > 0 && <p className="text-amber-300">Not counted until you decide whether it is business or private.</p>}
          </div>
        )}
        {preview instanceof TransactionValidationError && preview.field !== 'grossAmount' && <p className="text-amber-300 text-sm">{preview.message}</p>}

        <div>
          <label htmlFor="desc" className="block text-sm text-gray-300 mb-1">Description</label>
          <input id="desc" type="text" maxLength={500} value={form.description} onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))} className={field} placeholder="What was this for?" />
        </div>

        <div>
          <label htmlFor="merchant" className="block text-sm text-gray-300 mb-1">{type === 'INCOME' ? 'From (customer or person)' : 'Paid to (shop or supplier)'}</label>
          <input id="merchant" type="text" maxLength={200} value={form.merchant} onChange={e => setForm(prev => ({ ...prev, merchant: e.target.value }))} className={field} />
        </div>

        {filteredCategories.length > 0 && (
          <div>
            <label htmlFor="cat" className="block text-sm text-gray-300 mb-1">Category (optional)</label>
            <select id="cat" value={form.categoryId} onChange={e => setForm(prev => ({ ...prev, categoryId: e.target.value }))} className={field}>
              <option value="">No category</option>
              {filteredCategories.map(c => (
                <option key={c.id} value={c.id}>{c.nameDe ?? c.name}</option>
              ))}
            </select>
          </div>
        )}

        <fieldset>
          <legend className="block text-sm text-gray-300 mb-2">Paid how? (Zahlungsart)</legend>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'BANK', label: 'Bank' },
              { value: 'CARD', label: 'Card' },
              { value: 'CASH', label: 'Cash' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={form.paymentMethod === opt.value}
                onClick={() => setForm(prev => ({ ...prev, paymentMethod: opt.value }))}
                className={`py-3 min-h-11 rounded-lg text-sm font-medium border ${form.paymentMethod === opt.value ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div>
          <label htmlFor="date" className="block text-sm text-gray-300 mb-1">Date</label>
          <input id="date" type="date" value={form.transactionDate} onChange={e => setForm(prev => ({ ...prev, transactionDate: e.target.value }))} required className={field} {...invalid('transactionDate')} />
        </div>

        {error && (
          <p id="form-error" role="alert" className="text-red-300 text-sm">
            {error.message}
          </p>
        )}
        {savedId && (
          <div role="status" className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-3 text-emerald-200 text-sm">
            Saved. <Link href="/transactions" className="underline">See all transactions</Link> or add the next one.
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <button type="submit" disabled={loading || !taxType} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-3.5 min-h-11 text-sm">
            {loading ? 'Saving…' : 'Save transaction'}
          </button>
          <button type="button" onClick={() => router.push('/transactions')} className="px-4 min-h-11 rounded-lg text-sm text-gray-300 hover:text-white bg-gray-900 border border-gray-800">
            View all
          </button>
        </div>
      </form>

      <div className="mt-8">
        <GuidanceInfoBox
          title="Why record everything?"
          whatIsThis="Every euro that comes in or goes out tells TaxKontrol which part is profit, which part is VAT and which part is private."
          examples={['A customer pays an invoice → business income', 'You put your own savings into the account → private money, not income', 'A phone you also use privately → mixed']}
          whyItMatters="Only business income is profit. Private deposits and loans are not taxed — but they must not be counted as income either."
          importantNote="Keep the receipts: the Finanzamt may ask for them (Buchungsbelege must be kept 8 years)."
        />
      </div>
    </div>
  )
}

export default function InputPage() {
  return (
    <Suspense fallback={<p className="text-gray-400 text-sm">Loading…</p>}>
      <InputForm />
    </Suspense>
  )
}
