'use client'

import { useEffect, useState } from 'react'

type ReportData = { month: string; totalIncome: number; totalExpenses: number; netProfit: number; vatCollected: number; vatPaid: number; vatOwed: number; categories: { name: string; total: number; type: string }[] }

export default function ReportsPage() {
  const [data, setData] = useState<ReportData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/reports').then(r => r.json()).then(d => { setData(d); setLoading(false) })
  }, [])

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>
  if (!data) return <div className="text-gray-500 text-sm">No data available.</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Monthly EÜR and VAT summary for your Steuerberater</p>
        </div>
        <a
          href="/api/v1/reports/pdf"
          download
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Export EÜR
        </a>
      </div>

      <div className="rounded-xl bg-amber-950 border border-amber-800 p-4">
        <p className="text-sm text-amber-300 font-medium">Disclaimer</p>
        <p className="text-xs text-amber-400 mt-1">Estimate only. Verify with your Steuerberater. TaxKontrol does not submit taxes on your behalf.</p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <p className="text-sm font-medium text-white">{data.month} — EÜR Summary</p>
        <div className="space-y-3">
          <div className="flex justify-between text-sm"><span className="text-gray-400">Total income (Betriebseinnahmen)</span><span className="text-emerald-400 font-medium">€{data.totalIncome.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-400">Total expenses (Betriebsausgaben)</span><span className="text-red-400 font-medium">€{data.totalExpenses.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm border-t border-gray-800 pt-3"><span className="text-white font-medium">Net profit (Gewinn)</span><span className={`font-bold ${data.netProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>€{data.netProfit.toFixed(2)}</span></div>
        </div>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
        <p className="text-sm font-medium text-white">VAT Summary (Umsatzsteuer)</p>
        <div className="space-y-3">
          <div className="flex justify-between text-sm"><span className="text-gray-400">VAT collected (Umsatzsteuer)</span><span className="text-white font-medium">€{data.vatCollected.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm"><span className="text-gray-400">VAT paid on purchases (Vorsteuer)</span><span className="text-white font-medium">€{data.vatPaid.toFixed(2)}</span></div>
          <div className="flex justify-between text-sm border-t border-gray-800 pt-3"><span className="text-white font-medium">VAT owed to Finanzamt</span><span className={`font-bold ${data.vatOwed >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>€{data.vatOwed.toFixed(2)}</span></div>
        </div>
      </div>

      {data.categories.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-sm font-medium text-white mb-4">By category</p>
          <div className="space-y-2">
            {data.categories.map((c, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-400">{c.name}</span>
                <span className={c.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}>{c.type === 'INCOME' ? '+' : '-'}€{c.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
