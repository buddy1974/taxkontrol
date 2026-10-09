'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { eur } from '@/lib/format'

type ReportData = {
  taxType: string
  month: string
  totalIncome: number
  totalExpenses: number
  netProfit: number
  vatCollected: number
  vatPaid: number
  vatOwed: number
  privateWithdrawals: number
  nonBusinessInflow: number
  unclear: number
  needsReviewCount: number
  categories: { name: string; total: number; type: string }[]
}

function currentMonth() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 7)
}

export default function ReportsPage() {
  const [month, setMonth] = useState(currentMonth())
  const [data, setData] = useState<ReportData | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    fetch(`/api/v1/reports?month=${month}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => {
        if (!cancelled) {
          setData(d)
          setState('ready')
        }
      })
      .catch(() => !cancelled && setState('error'))
    return () => {
      cancelled = true
    }
  }, [month])

  const isKlein = data?.taxType === 'KLEINUNTERNEHMER'

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-gray-400 text-sm mt-1">Monthly overview to prepare for your Steuerberater</p>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label htmlFor="month" className="block text-xs text-gray-400 mb-1">Month</label>
            <input id="month" type="month" value={month} max={currentMonth()} onChange={e => e.target.value && setMonth(e.target.value)}
              className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm" />
          </div>
          <a href={`/api/v1/reports/pdf?month=${month}`} download className="px-4 py-2 min-h-11 inline-flex items-center bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg">
            Download
          </a>
        </div>
      </div>

      {state === 'loading' && <p className="text-gray-400 text-sm">Loading…</p>}
      {state === 'error' && <p role="alert" className="text-red-300 text-sm">Could not load the report. Please try again.</p>}

      {state === 'ready' && data && (
        <>
          {data.needsReviewCount > 0 && (
            <p className="rounded-lg bg-amber-950 border border-amber-800 px-4 py-3 text-sm text-amber-200">
              {data.needsReviewCount} transaction(s) in {data.month} are marked “not sure” and are left out below.{' '}
              <Link href="/transactions?review=1" className="underline">Classify them</Link>
            </p>
          )}

          <section className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
            <h2 className="px-5 pt-4 pb-2 text-sm font-medium text-white">Profit {data.month} (EÜR, estimate)</h2>
            {[
              { label: 'Business income', sub: isKlein ? 'Betriebseinnahmen' : 'Betriebseinnahmen, without VAT', value: data.totalIncome, color: 'text-emerald-400' },
              { label: 'Business expenses', sub: isKlein ? 'Betriebsausgaben (full amount)' : 'Betriebsausgaben, without deductible VAT', value: -data.totalExpenses, color: 'text-red-400' },
              { label: 'Profit', sub: 'Gewinn', value: data.netProfit, color: data.netProfit >= 0 ? 'text-white' : 'text-red-400' },
            ].map(r => (
              <div key={r.label} className="flex justify-between items-center px-5 py-3">
                <div>
                  <p className="text-sm text-white">{r.label}</p>
                  <p className="text-xs text-gray-400">{r.sub}</p>
                </div>
                <p className={`font-semibold ${r.color}`}>{eur(r.value)}</p>
              </div>
            ))}
          </section>

          {!isKlein && (
            <section className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-2 text-sm">
              <h2 className="font-medium text-white">VAT (Umsatzsteuer)</h2>
              <p className="flex justify-between text-gray-300"><span>VAT on your income</span><span>{eur(data.vatCollected)}</span></p>
              <p className="flex justify-between text-gray-300"><span>Deductible VAT on purchases (Vorsteuer)</span><span>− {eur(data.vatPaid)}</span></p>
              <p className="flex justify-between text-white font-medium border-t border-gray-800 pt-2"><span>{data.vatOwed >= 0 ? 'VAT to pay (estimate)' : 'VAT refund (estimate)'}</span><span>{eur(Math.abs(data.vatOwed))}</span></p>
            </section>
          )}

          <section className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-2 text-sm">
            <h2 className="font-medium text-white">Not part of the profit</h2>
            <p className="flex justify-between text-gray-300"><span>Private shares of payments (Privatentnahmen)</span><span>{eur(data.privateWithdrawals)}</span></p>
            <p className="flex justify-between text-gray-300"><span>Private money in, loans (Einlagen)</span><span>{eur(data.nonBusinessInflow)}</span></p>
            <p className="flex justify-between text-amber-300"><span>Not yet classified</span><span>{eur(data.unclear)}</span></p>
          </section>

          {data.categories.length > 0 ? (
            <section className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <h2 className="text-sm font-medium text-white mb-3">By category</h2>
              <ul className="space-y-2">
                {data.categories.map(c => (
                  <li key={`${c.type}-${c.name}`} className="flex justify-between text-sm">
                    <span className="text-gray-300">{c.name}</span>
                    <span className={c.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}>{eur(c.total)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="text-sm text-gray-400">No business transactions in {data.month}.</p>
          )}
        </>
      )}

      <GuidanceInfoBox
        title="What is this report?"
        whatIsThis="A monthly summary of your business income and expenses (Einnahmen-Überschuss-Rechnung) — the basis your Steuerberater needs."
        whyItMatters="Only business money counts. Private money and unclear items are shown separately so nothing is mixed up."
        examples={['Download the month and send it to your Steuerberater', 'Classify all “not sure” items first']}
        importantNote="This is a preparation aid, not a tax return. TaxKontrol does not send anything to the Finanzamt."
      />
    </div>
  )
}
