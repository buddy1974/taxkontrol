'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { eur, germanDate } from '@/lib/format'

type Usage = 'BUSINESS' | 'PRIVATE' | 'MIXED' | 'UNSURE'
type Line = {
  date: string
  description: string
  merchant: string | null
  amount: number
  type: 'INCOME' | 'EXPENSE'
  selected: boolean
  usage: Usage
  vatRate: number | null
  businessPct: number
}
type Result = { created: number; duplicates: number; flagged: number }

const USAGE_IN: Array<[Usage, string]> = [['UNSURE', 'Not sure yet'], ['BUSINESS', 'Business income'], ['PRIVATE', 'Private money / loan']]
const USAGE_OUT: Array<[Usage, string]> = [['UNSURE', 'Not sure yet'], ['BUSINESS', 'Business'], ['MIXED', 'Mixed (50 %)'], ['PRIVATE', 'Private']]

export default function ImportPage() {
  const [taxType, setTaxType] = useState<string>('REGELBESTEUERUNG')
  const [uploading, setUploading] = useState(false)
  const [lines, setLines] = useState<Line[]>([])
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/v1/settings').then(r => (r.ok ? r.json() : null)).then(s => s?.taxType && setTaxType(s.taxType)).catch(() => undefined)
  }, [])
  const isKlein = taxType === 'KLEINUNTERNEHMER'

  async function handleFile(file: File) {
    setUploading(true)
    setError('')
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/v1/bank-statement', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(data.transactions)) {
        setError(data.error ?? 'Could not read the bank statement.')
        return
      }
      setLines(
        data.transactions.map((t: Omit<Line, 'selected' | 'usage' | 'vatRate' | 'businessPct'>) => ({
          ...t,
          selected: true,
          usage: 'UNSURE' as Usage,
          vatRate: null,
          businessPct: 50,
        }))
      )
      if (data.transactions.length === 0) setError('No bookings found in this file.')
    } catch {
      setError('Upload failed. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const update = (i: number, patch: Partial<Line>) => setLines(prev => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)))
  const selected = lines.filter(l => l.selected)

  async function handleImport() {
    setImporting(true)
    setError('')
    const items = selected.map(l => ({
      date: l.date,
      description: l.description,
      merchant: l.merchant,
      amount: l.amount,
      type: l.type,
      usage: l.usage,
      businessPct: l.usage === 'MIXED' ? l.businessPct : 100,
      ...(l.usage === 'BUSINESS' || l.usage === 'MIXED' ? (l.vatRate !== null ? { vatRate: l.vatRate } : {}) : { vatRate: 0 }),
    }))
    const res = await fetch('/api/v1/transactions/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
    const body = await res.json().catch(() => ({}))
    setImporting(false)
    if (!res.ok) {
      const first = Array.isArray(body.errors) && body.errors[0] ? ` (line ${body.errors[0].index + 1}: ${body.errors[0].message})` : ''
      setError((body.error ?? 'Import failed.') + first)
      return
    }
    setResult(body)
    setLines([])
  }

  const select = 'bg-gray-800 border border-gray-700 text-white rounded-lg px-2 py-1.5 min-h-11 text-sm'

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Import bank statement</h1>
        <p className="text-gray-400 text-sm mt-1">Upload a PDF Kontoauszug, check every line, then import</p>
      </header>

      {lines.length === 0 && !result && (
        <label className="block border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-xl p-10 text-center cursor-pointer focus-within:border-blue-500">
          <input type="file" accept="application/pdf" className="sr-only" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          {uploading ? (
            <span role="status">
              <span className="block text-white font-medium">Reading bank statement…</span>
              <span className="block text-gray-400 text-sm mt-1">This can take up to a minute</span>
            </span>
          ) : (
            <span>
              <span className="block text-white font-medium">Choose a PDF bank statement</span>
              <span className="block text-gray-400 text-sm mt-1">Kontoauszug from your online banking</span>
            </span>
          )}
        </label>
      )}

      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}

      {result && (
        <div role="status" className="rounded-xl bg-emerald-950 border border-emerald-800 p-4 space-y-1 text-sm text-emerald-100">
          <p className="font-medium">Imported {result.created} transaction(s).</p>
          {result.duplicates > 0 && <p>{result.duplicates} line(s) were already recorded and were skipped.</p>}
          {result.flagged > 0 && (
            <p>
              {result.flagged} line(s) need your decision (business or private, VAT).{' '}
              <Link href="/transactions?review=1" className="underline">Decide now</Link>
            </p>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <section className="space-y-4" aria-labelledby="lines-title">
          <div className="rounded-lg bg-amber-950 border border-amber-800 px-4 py-3 text-sm text-amber-100">
            TaxKontrol does not guess whether money is business or private. Lines you leave on “Not sure” are imported but not counted in profit or taxes until you decide.
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="lines-title" className="text-sm text-white font-medium">{lines.length} lines found · {selected.length} selected</h2>
            <div className="flex gap-2 text-xs">
              <button type="button" onClick={() => setLines(p => p.map(l => ({ ...l, selected: true })))} className="text-blue-300 underline min-h-8">Select all</button>
              <button type="button" onClick={() => setLines(p => p.map(l => ({ ...l, selected: false })))} className="text-gray-400 underline min-h-8">Select none</button>
              <button type="button" onClick={() => setLines(p => p.map(l => (l.selected && l.type === 'EXPENSE' ? { ...l, usage: 'BUSINESS' } : l)))} className="text-gray-300 underline min-h-8">Selected payments → business</button>
            </div>
          </div>

          <ul className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
            {lines.map((l, i) => (
              <li key={i} className={`px-4 py-3 space-y-2 ${l.selected ? '' : 'opacity-50'}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" aria-label={`Import line ${i + 1}`} checked={l.selected} onChange={e => update(i, { selected: e.target.checked })} className="mt-1 h-5 w-5 accent-blue-500" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white break-words">{l.description}</p>
                    <p className="text-xs text-gray-500">{l.merchant ? `${l.merchant} · ` : ''}{germanDate(l.date)}</p>
                  </div>
                  <p className={`text-sm font-medium whitespace-nowrap ${l.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}`}>{l.type === 'INCOME' ? '+' : '−'}{eur(l.amount)}</p>
                </div>
                {l.selected && (
                  <div className="flex flex-wrap gap-2 pl-8">
                    <label className="sr-only" htmlFor={`u-${i}`}>Classification</label>
                    <select id={`u-${i}`} className={select} value={l.usage} onChange={e => update(i, { usage: e.target.value as Usage })}>
                      {(l.type === 'INCOME' ? USAGE_IN : USAGE_OUT).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                    </select>
                    {!isKlein && (l.usage === 'BUSINESS' || l.usage === 'MIXED') && (
                      <>
                        <label className="sr-only" htmlFor={`v-${i}`}>VAT rate</label>
                        <select id={`v-${i}`} className={select} value={l.vatRate ?? ''} onChange={e => update(i, { vatRate: e.target.value === '' ? null : Number(e.target.value) })}>
                          <option value="">VAT unknown</option>
                          <option value={19}>19 % VAT</option>
                          <option value={7}>7 % VAT</option>
                          <option value={0}>no VAT</option>
                        </select>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-3">
            <button type="button" onClick={handleImport} disabled={importing || selected.length === 0} className="flex-1 min-h-11 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${selected.length} line(s)`}
            </button>
            <button type="button" onClick={() => setLines([])} className="px-4 min-h-11 bg-gray-900 border border-gray-800 text-gray-300 text-sm rounded-lg">Cancel</button>
          </div>
        </section>
      )}

      <GuidanceInfoBox
        title="What does the import do?"
        whatIsThis="TaxKontrol reads the bookings from your PDF bank statement. You decide for each line whether it is business or private money."
        examples={['Customer payment → Business income', 'Transfer from your private account or a loan → Private money', 'Supermarket for your household → Private']}
        whyItMatters="Not every incoming payment is profit and not every payment is deductible. Wrong classification means wrong taxes."
        importantNote="Lines that are already recorded are skipped automatically, so importing the same statement twice is safe."
      />
    </div>
  )
}
