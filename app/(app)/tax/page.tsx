'use client'

import { useEffect, useState } from 'react'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { eur, germanDate } from '@/lib/format'

type Reserve = {
  id: string
  type: 'VAT' | 'INCOME_TAX'
  label: string
  status: 'CURRENT' | 'ENDED'
  periodLabel: string
  periodStart: string
  target: number
  paid: number
  open: number
  reserved: number
  shortfall: number
  dueNote: string
}

type TaxData = {
  taxType: string
  vatFilingPeriod: string
  reserves: Reserve[]
  history: Array<{ id: string; type: string; periodStart: string; periodEnd: string; target: number; reserved: number; settledAt: string | null }>
  incomeTax: {
    year: number
    profitYearToDate: number
    projectedAnnualProfit: number
    minimumOnProfitSoFar: number
    estimatedAnnualTax: number
    effectiveRate: number
    provisionalRules: boolean
    assumptions: string[]
    basis: string
  }
  limitations: Array<{ code: string; message: string }>
}

export default function TaxPage() {
  const [data, setData] = useState<TaxData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [paying, setPaying] = useState<string | null>(null)
  const [payAmount, setPayAmount] = useState('')
  const [payDate, setPayDate] = useState('')
  const [paySettle, setPaySettle] = useState(true)
  const [notice, setNotice] = useState('')

  function load() {
    fetch('/api/v1/tax-reserve')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: TaxData) => {
        setData(d)
        setState('ready')
      })
      .catch(() => setState('error'))
  }
  useEffect(load, [])

  async function save(id: string) {
    setSaving(true)
    setSaveError('')
    const res = await fetch('/api/v1/tax-reserve', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, actuallyReserved: editValue }),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setSaveError(body.error ?? 'Could not save.')
      return
    }
    setEditing(null)
    load()
  }

  async function post(payload: Record<string, unknown>, success: string) {
    setSaving(true)
    setSaveError('')
    setNotice('')
    const res = await fetch('/api/v1/tax-reserve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setSaveError(body.error ?? 'Could not save.')
      return
    }
    setPaying(null)
    setNotice(success)
    load()
  }

  function recordPayment(r: Reserve) {
    return post(
      { action: 'recordPayment', type: r.type, periodStart: r.periodStart, amount: payAmount, date: payDate || undefined, settle: paySettle },
      `Payment for ${r.label} ${r.periodLabel} recorded.${paySettle ? ' The period is marked settled.' : ''}`
    )
  }

  if (state === 'loading') return <p className="text-gray-400 text-sm">Loading…</p>
  if (state === 'error' || !data) return <p role="alert" className="text-red-300 text-sm">Could not load your tax reserve. Please reload.</p>

  const total = data.reserves.reduce((s, r) => ({ target: s.target + r.open, reserved: s.reserved + r.reserved, shortfall: s.shortfall + r.shortfall }), { target: 0, reserved: 0, shortfall: 0 })

  return (
    <div className="max-w-2xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Tax reserve (Steuerrücklage)</h1>
        <p className="text-gray-400 text-sm mt-1">Money to set aside so you can pay when the Finanzamt asks</p>
      </header>

      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4">
          <p className="text-xs text-gray-400">Estimated need</p>
          <p className="text-base sm:text-xl font-bold text-white mt-1">{eur(total.target)}</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-3 sm:p-4">
          <p className="text-xs text-gray-400">You set aside</p>
          <p className="text-base sm:text-xl font-bold text-emerald-400 mt-1">{eur(total.reserved)}</p>
        </div>
        <div className={`rounded-xl border p-3 sm:p-4 ${total.shortfall > 0 ? 'bg-amber-950 border-amber-800' : 'bg-emerald-950 border-emerald-800'}`}>
          <p className="text-xs text-gray-300">Still to set aside</p>
          <p className={`text-base sm:text-xl font-bold mt-1 ${total.shortfall > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>{total.shortfall > 0 ? eur(total.shortfall) : 'On track'}</p>
        </div>
      </div>

      {saveError && <p role="alert" className="text-sm text-red-300">{saveError}</p>}
      {notice && <p role="status" className="text-sm text-emerald-300">{notice}</p>}

      <div className="space-y-4">
        {data.reserves.map(r => {
          const pct = r.open > 0 ? Math.min(100, Math.round((r.reserved / r.open) * 100)) : 100
          return (
            <section key={r.id} aria-labelledby={`r-${r.id}`} className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <div className="flex justify-between items-start gap-3 mb-3">
                <div>
                  <h2 id={`r-${r.id}`} className="text-sm font-medium text-white">
                    {r.label} · {r.periodLabel}
                  </h2>
                  {r.status === 'ENDED' && (
                    <p className="mt-1 inline-block text-xs px-2 py-0.5 rounded-full bg-red-900 text-red-100">Period ended — payment not recorded yet</p>
                  )}
                  <p className="text-xs text-gray-400 mt-0.5">
                    {r.type === 'VAT'
                      ? `VAT filing period ${r.periodLabel} — VAT on income minus deductible VAT`
                      : r.status === 'ENDED'
                        ? `Year ${r.periodLabel} — estimate on last year's recorded profit`
                        : `Year ${r.periodLabel} — estimate on your profit so far`}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">{r.dueNote}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${r.shortfall > 0 ? 'bg-amber-900 text-amber-300' : 'bg-emerald-900 text-emerald-300'}`}>
                  {r.shortfall > 0 ? `${eur(r.shortfall)} missing` : 'On track'}
                </span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-2 mb-3" role="progressbar" aria-label={`${r.label}: share set aside`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <div className={`h-2 rounded-full ${r.shortfall > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-4">
                <div><p className="text-xs text-gray-400">Estimated tax</p><p className="text-white font-medium">{eur(r.target)}</p></div>
                <div><p className="text-xs text-gray-400">Paid (recorded)</p><p className="text-white font-medium">{eur(r.paid)}</p></div>
                <div className="text-right"><p className="text-xs text-gray-400">You set aside</p><p className="text-emerald-400 font-medium">{eur(r.reserved)}</p></div>
              </div>
              {editing === r.id ? (
                <div className="flex gap-2">
                  <label htmlFor={`v-${r.id}`} className="sr-only">Amount you have set aside</label>
                  <input id={`v-${r.id}`} inputMode="decimal" value={editValue} onChange={e => setEditValue(e.target.value)} autoFocus
                    className="flex-1 bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm" />
                  <button type="button" onClick={() => save(r.id)} disabled={saving} className="px-4 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">Save</button>
                  <button type="button" onClick={() => setEditing(null)} className="px-4 min-h-11 bg-gray-800 text-gray-300 text-sm rounded-lg">Cancel</button>
                </div>
              ) : (
                <button type="button" onClick={() => { setEditing(r.id); setEditValue(String(r.reserved)) }}
                  className="w-full py-2 min-h-11 rounded-lg border border-gray-700 text-gray-300 hover:text-white text-sm">
                  Update the amount I set aside
                </button>
              )}
              {paying === r.id ? (
                <form
                  className="mt-3 space-y-2 rounded-lg border border-gray-700 p-3"
                  onSubmit={e => {
                    e.preventDefault()
                    recordPayment(r)
                  }}
                >
                  <p className="text-xs text-gray-300">Record a payment you made to the Finanzamt for {r.label} {r.periodLabel}. It is not counted as a business expense.</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="flex-1">
                      <label htmlFor={`pa-${r.id}`} className="block text-xs text-gray-400 mb-1">Amount paid (€)</label>
                      <input id={`pa-${r.id}`} inputMode="decimal" required value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm" />
                    </div>
                    <div className="flex-1">
                      <label htmlFor={`pd-${r.id}`} className="block text-xs text-gray-400 mb-1">Payment date</label>
                      <input id={`pd-${r.id}`} type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-300">
                    <input type="checkbox" checked={paySettle} onChange={e => setPaySettle(e.target.checked)} className="h-4 w-4" />
                    This settles the period (nothing more to pay for {r.periodLabel})
                  </label>
                  <div className="flex gap-2">
                    <button type="submit" disabled={saving} className="px-4 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">Save payment</button>
                    <button type="button" onClick={() => setPaying(null)} className="px-4 min-h-11 bg-gray-800 text-gray-300 text-sm rounded-lg">Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="mt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPaying(r.id)
                      setPayAmount(r.open > 0 ? String(r.open).replace('.', ',') : '')
                      setPayDate('')
                      setPaySettle(r.status === 'ENDED')
                    }}
                    className="flex-1 py-2 min-h-11 rounded-lg border border-gray-700 text-gray-300 hover:text-white text-sm"
                  >
                    Record a payment to the Finanzamt
                  </button>
                  {r.status === 'ENDED' && (
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => post({ action: 'settle', type: r.type, periodStart: r.periodStart, settled: true }, `${r.label} ${r.periodLabel} marked settled.`)}
                      className="flex-1 py-2 min-h-11 rounded-lg border border-gray-700 text-gray-300 hover:text-white text-sm disabled:opacity-50"
                    >
                      Mark as settled
                    </button>
                  )}
                </div>
              )}
            </section>
          )
        })}
      </div>

      <details className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <summary className="text-sm font-medium text-white cursor-pointer">How the income tax estimate works</summary>
        <div className="mt-3 space-y-2 text-xs text-gray-300">
          <p>
            Profit {data.incomeTax.year} so far: {eur(data.incomeTax.profitYearToDate)}. Projected for the whole year: {eur(data.incomeTax.projectedAnnualProfit)}.
            Tax on the profit so far alone (if you earned nothing more this year): {eur(data.incomeTax.minimumOnProfitSoFar)}. The reserve uses the
            projection, because later income raises the tax rate; one unusually large payment can make the projection too high.
            Estimated income tax incl. Soli{data.incomeTax.effectiveRate > 0 ? '' : ''}: {eur(data.incomeTax.estimatedAnnualTax)} ({data.incomeTax.effectiveRate} % of the profit).
          </p>
          <ul className="list-disc pl-4 text-gray-400">
            {data.incomeTax.assumptions.map(a => <li key={a}>{a}</li>)}
            {data.limitations.map(l => <li key={l.code}>{l.message}</li>)}
          </ul>
          <p className="text-gray-400">Legal basis: {data.incomeTax.basis}</p>
          <p className="text-gray-400">If the Finanzamt has set advance payments (Vorauszahlungen), record each one as a payment for the current year.</p>
        </div>
      </details>

      {data.history.length > 0 && (
        <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 className="text-sm font-medium text-white mb-3">Earlier periods</h2>
          <ul className="space-y-1 text-xs text-gray-400">
            {data.history.map(h => (
              <li key={h.id} className="flex justify-between gap-3">
                <span>{h.type === 'VAT' ? 'VAT' : h.type === 'INCOME_TAX' ? 'Income tax' : 'Trade tax'} · {germanDate(h.periodStart)}–{germanDate(h.periodEnd)}</span>
                <span>
                  {eur(h.reserved)} of {eur(h.target)}
                  {h.settledAt ? ' · settled' : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <GuidanceInfoBox
        title="What is a tax reserve?"
        whatIsThis="Money you move to a separate account regularly, so you can pay VAT and income tax when they are due."
        examples={[
          'VAT: you collected it from customers — it was never yours',
          'Income tax: assessed once a year, sometimes with quarterly advance payments',
          'Only the amount you enter as “set aside” counts — TaxKontrol never assumes a transfer happened',
        ]}
        whyItMatters="Many self-employed people are surprised by their first tax bill. A reserve prevents this."
        importantNote="These are estimates, not a bill from the Finanzamt. Your real tax is set by the Finanzamt, ideally prepared with a Steuerberater."
      />
    </div>
  )
}
