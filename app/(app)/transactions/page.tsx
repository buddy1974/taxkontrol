'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Transaction = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  grossAmount: number
  netAmount: number
  vatAmount: number
  businessAmount: number
  description: string | null
  merchant: string | null
  usage: string
  paymentMethod: string
  transactionDate: string
  category: { name: string } | null
  aiConfidence: number | null
  isAiClassified: boolean
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [filter, setFilter] = useState<'ALL' | 'INCOME' | 'EXPENSE'>('ALL')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const url = filter === 'ALL'
      ? '/api/v1/transactions'
      : `/api/v1/transactions?type=${filter}`

    fetch(url)
      .then(r => r.json())
      .then(data => {
        setTransactions(data)
        setLoading(false)
      })
  }, [filter])

  const totalIncome = transactions
    .filter(t => t.type === 'INCOME')
    .reduce((sum, t) => sum + t.netAmount, 0)

  const totalExpenses = transactions
    .filter(t => t.type === 'EXPENSE')
    .reduce((sum, t) => sum + t.businessAmount, 0)

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transactions</h1>
          <p className="text-gray-500 text-sm mt-1">All your income and expenses</p>
        </div>
        <Link
          href="/input"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add new
        </Link>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Total income (net)</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">
            +€{totalIncome.toFixed(2)}
          </p>
        </div>
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500">Total expenses (business)</p>
          <p className="text-xl font-bold text-red-400 mt-1">
            -€{totalExpenses.toFixed(2)}
          </p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['ALL', 'INCOME', 'EXPENSE'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {f === 'ALL' ? 'All' : f === 'INCOME' ? 'Income' : 'Expenses'}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-500 text-sm">Loading...</p>
      ) : transactions.length === 0 ? (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-8 text-center">
          <p className="text-gray-400">No transactions yet.</p>
          <Link
            href="/input"
            className="text-blue-400 text-sm mt-2 inline-block hover:text-blue-300"
          >
            Add your first transaction
          </Link>
        </div>
      ) : (
        <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
          {transactions.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    t.type === 'INCOME'
                      ? 'bg-emerald-900 text-emerald-400'
                      : 'bg-red-900 text-red-400'
                  }`}>
                    {t.type === 'INCOME' ? 'IN' : 'OUT'}
                  </span>
                  {t.usage === 'MIXED' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900 text-blue-400 font-medium">
                      Mixed
                    </span>
                  )}
                  {t.isAiClassified && t.aiConfidence !== null && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      t.aiConfidence > 0.8
                        ? 'bg-emerald-900 text-emerald-400'
                        : t.aiConfidence > 0.5
                        ? 'bg-amber-900 text-amber-400'
                        : 'bg-gray-800 text-gray-500'
                    }`}>
                      AI {Math.round(t.aiConfidence * 100)}%
                    </span>
                  )}
                </div>
                <p className="text-sm text-white mt-1 truncate">
                  {t.description || t.merchant || 'No description'}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.merchant && `${t.merchant} · `}
                  {t.category?.name && `${t.category.name} · `}
                  {new Date(t.transactionDate).toLocaleDateString('en-DE')}
                </p>
              </div>
              <div className="text-right ml-4">
                <p className={`text-base font-semibold ${
                  t.type === 'INCOME' ? 'text-emerald-400' : 'text-red-400'
                }`}>
                  {t.type === 'INCOME' ? '+' : '-'}€{t.grossAmount.toFixed(2)}
                </p>
                {t.vatAmount > 0 && (
                  <p className="text-xs text-gray-500">
                    incl. €{t.vatAmount.toFixed(2)} VAT
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
