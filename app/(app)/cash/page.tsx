'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

type CashEntry = {
  id: string
  date: string
  cashStart: number
  cashSales: number
  cashExpenses: number
  cashEnd: number
  cashDiff: number
  notes: string | null
}

export default function CashPage() {
  const [entries, setEntries] = useState<CashEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/daily-close')
      .then(r => r.json())
      .then(data => {
        setEntries(data)
        setLoading(false)
      })
  }, [])

  const totalCashSales = entries.reduce((sum, e) => sum + e.cashSales, 0)
  const totalMismatches = entries.filter(e => Math.abs(e.cashDiff) > 0.01).length

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Cash control</h1>
          <p className="text-gray-500 text-sm mt-1">
            Track your daily cash — Bargeld Kontrolle
          </p>
        </div>
        <Link
          href="/daily-close"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg"
        >
          + Close today
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Total cash sales</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">€{totalCashSales.toFixed(2)}</p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Days recorded</p>
          <p className="text-xl font-bold text-white mt-1">{entries.length}</p>
        </div>
        <div className={`rounded-xl border p-4 ${totalMismatches > 0 ? 'bg-red-950 border-red-800' : 'bg-emerald-950 border-emerald-800'}`}>
          <p className="text-xs text-gray-500">Cash mismatches</p>
          <p className={`text-xl font-bold mt-1 ${totalMismatches > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalMismatches === 0 ? '✓ Clean' : `${totalMismatches} day(s)`}
          </p>
        </div>
      </div>

      {totalMismatches > 0 && (
        <div className="rounded-xl bg-red-950 border border-red-800 p-4">
          <p className="text-sm font-medium text-red-300">Cash mismatch warning</p>
          <p className="text-xs text-red-400 mt-1">
            {totalMismatches} day(s) have cash differences. This could indicate missing receipts or recording errors.
            The Finanzamt may flag this during an audit (Betriebsprüfung).
          </p>
        </div>
      )}

      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {entries.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400">No cash records yet.</p>
            <Link href="/daily-close" className="text-blue-400 text-sm mt-2 inline-block">
              Start daily close →
            </Link>
          </div>
        ) : (
          entries.map(e => (
            <div key={e.id} className="flex items-center justify-between px-5 py-4">
              <div>
                <p className="text-sm text-white">{new Date(e.date).toLocaleDateString('en-DE')}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Sales: €{e.cashSales.toFixed(2)} · Expenses: €{e.cashExpenses.toFixed(2)}
                </p>
                {e.notes && <p className="text-xs text-gray-600 mt-0.5">{e.notes}</p>}
              </div>
              <div className="text-right">
                <p className={`text-sm font-medium ${Math.abs(e.cashDiff) < 0.01 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {Math.abs(e.cashDiff) < 0.01 ? '✓ Matched' : `Diff: €${e.cashDiff.toFixed(2)}`}
                </p>
                <p className="text-xs text-gray-500">End: €{e.cashEnd.toFixed(2)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
