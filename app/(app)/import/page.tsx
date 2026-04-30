'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type ParsedTransaction = {
  date: string
  description: string
  amount: number
  type: 'INCOME' | 'EXPENSE'
  merchant: string | null
  selected: boolean
}

export default function ImportPage() {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [transactions, setTransactions] = useState<ParsedTransaction[]>([])
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(file: File) {
    setUploading(true)
    setError('')
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/v1/bank-statement', { method: 'POST', body: formData })
    const data = await res.json()

    if (!res.ok || !data.transactions) {
      setError(data.error ?? 'Could not read bank statement.')
      setUploading(false)
      return
    }

    setTransactions(data.transactions.map((t: Omit<ParsedTransaction, 'selected'>) => ({ ...t, selected: true })))
    setUploading(false)
  }

  async function handleImport() {
    setImporting(true)
    const selected = transactions.filter(t => t.selected)

    for (const t of selected) {
      await fetch('/api/v1/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: t.type,
          grossAmount: Math.abs(t.amount),
          vatRate: 0,
          description: t.description,
          merchant: t.merchant,
          transactionDate: t.date,
          usage: 'BUSINESS',
          businessPct: 100,
          paymentMethod: 'BANK',
        }),
      })
    }

    setDone(true)
    setImporting(false)
    setTimeout(() => router.push('/transactions'), 2000)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Import bank statement</h1>
        <p className="text-gray-500 text-sm mt-1">
          Upload a PDF Kontoauszug — AI reads every transaction automatically
        </p>
      </div>

      {transactions.length === 0 && (
        <div
          onClick={() => document.getElementById('bank-file')?.click()}
          className="border-2 border-dashed border-gray-700 hover:border-gray-600 rounded-xl p-12 text-center cursor-pointer transition-colors"
        >
          <input
            id="bank-file"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />
          {uploading ? (
            <div>
              <p className="text-white font-medium">Reading bank statement...</p>
              <p className="text-gray-500 text-sm mt-1">AI is extracting all transactions</p>
            </div>
          ) : (
            <div>
              <p className="text-white font-medium">Drop PDF bank statement here</p>
              <p className="text-gray-500 text-sm mt-1">Kontoauszug PDF — any German bank</p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {done && (
        <div className="rounded-xl bg-emerald-950 border border-emerald-800 p-4">
          <p className="text-emerald-400 font-medium">Import complete — redirecting to transactions...</p>
        </div>
      )}

      {transactions.length > 0 && !done && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white font-medium">{transactions.length} transactions found</p>
            <div className="flex gap-2">
              <button
                onClick={() => setTransactions(prev => prev.map(t => ({ ...t, selected: true })))}
                className="text-xs text-blue-400 hover:text-blue-300"
              >
                Select all
              </button>
              <button
                onClick={() => setTransactions(prev => prev.map(t => ({ ...t, selected: false })))}
                className="text-xs text-gray-500 hover:text-gray-400"
              >
                Deselect all
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800 max-h-96 overflow-y-auto">
            {transactions.map((t, i) => (
              <div
                key={i}
                onClick={() => setTransactions(prev => prev.map((tx, j) => j === i ? { ...tx, selected: !tx.selected } : tx))}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors ${t.selected ? '' : 'opacity-40'}`}
              >
                <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${t.selected ? 'bg-blue-600 border-blue-500' : 'border-gray-600'}`}>
                  {t.selected && <span className="text-white text-xs">✓</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{t.description}</p>
                  <p className="text-xs text-gray-500">{t.merchant ?? ''} · {t.date}</p>
                </div>
                <p className={`text-sm font-medium flex-shrink-0 ${t.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {t.type === 'INCOME' ? '+' : '-'}€{Math.abs(t.amount).toFixed(2)}
                </p>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={importing || transactions.filter(t => t.selected).length === 0}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
            >
              {importing ? 'Importing...' : `Import ${transactions.filter(t => t.selected).length} transactions`}
            </button>
            <button
              onClick={() => setTransactions([])}
              className="px-4 py-2.5 bg-gray-900 border border-gray-800 text-gray-400 text-sm rounded-lg hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
