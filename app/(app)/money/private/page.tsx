'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Transaction = {
  id: string
  type: string
  grossAmount: number
  privateAmount: number
  description: string | null
  merchant: string | null
  transactionDate: string
  usage: string
}

export default function PrivatePage() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/transactions')
      .then(r => r.json())
      .then((data: Transaction[]) => {
        setTransactions(data.filter(t => t.usage === 'PRIVATE' || t.usage === 'MIXED'))
        setLoading(false)
      })
  }, [])

  const totalPrivate = transactions.reduce((sum, t) => sum + t.privateAmount, 0)

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Private money</h1>
          <p className="text-gray-500 text-sm mt-1">
            Private expenses and Privatentnahme — not tax deductible
          </p>
        </div>
        <Link href="/money" className="text-sm text-blue-400 hover:text-blue-300">
          ← Money split
        </Link>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <p className="text-sm text-gray-400">Total private spending this month</p>
        <p className="text-3xl font-bold text-white mt-1">€{totalPrivate.toFixed(2)}</p>
        <p className="text-xs text-gray-500 mt-1">This amount is NOT deductible from your taxes</p>
      </div>

      <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
        {transactions.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-400">No private or mixed transactions yet.</p>
          </div>
        ) : (
          transactions.map(t => (
            <div key={t.id} className="flex justify-between items-center px-5 py-4">
              <div>
                <p className="text-sm text-white">{t.description || t.merchant || 'No description'}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t.usage === 'MIXED' ? 'Mixed expense' : 'Private'} · {new Date(t.transactionDate).toLocaleDateString('en-DE')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-400">€{t.privateAmount.toFixed(2)}</p>
                <p className="text-xs text-gray-600">private portion</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
