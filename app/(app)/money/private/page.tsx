'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { eur, germanDate } from '@/lib/format'

type Transaction = {
  id: string
  type: 'INCOME' | 'EXPENSE'
  grossAmount: number
  privateAmount: number
  description: string | null
  merchant: string | null
  transactionDate: string
  usage: string
}

const thisMonth = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 7)

export default function PrivatePage() {
  const [rows, setRows] = useState<Transaction[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    fetch(`/api/v1/transactions?month=${thisMonth()}&limit=200`)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Transaction[]) => {
        setRows(data.filter(t => t.privateAmount > 0))
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  const withdrawals = rows.filter(t => t.type === 'EXPENSE').reduce((s, t) => s + t.privateAmount, 0)
  const deposits = rows.filter(t => t.type === 'INCOME').reduce((s, t) => s + t.privateAmount, 0)

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Private money</h1>
          <p className="text-gray-400 text-sm mt-1">This month — not business income, not deductible</p>
        </div>
        <Link href="/money" className="text-sm text-blue-300 hover:text-blue-200">← Money split</Link>
      </div>

      {state === 'loading' && <p className="text-gray-400 text-sm">Loading…</p>}
      {state === 'error' && <p role="alert" className="text-red-300 text-sm">Could not load transactions.</p>}

      {state === 'ready' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <p className="text-sm text-gray-400">Private spending paid from business (Privatentnahmen)</p>
              <p className="text-2xl font-bold text-white mt-1">{eur(withdrawals)}</p>
              <p className="text-xs text-gray-500 mt-1">Not deductible from your taxes</p>
            </div>
            <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
              <p className="text-sm text-gray-400">Private money put in, loans (Einlagen)</p>
              <p className="text-2xl font-bold text-white mt-1">{eur(deposits)}</p>
              <p className="text-xs text-gray-500 mt-1">Not business income — not taxed as profit</p>
            </div>
          </div>

          <ul className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
            {rows.length === 0 ? (
              <li className="p-8 text-center text-gray-400">No private money recorded this month.</li>
            ) : (
              rows.map(t => (
                <li key={t.id} className="flex justify-between items-center gap-3 px-5 py-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{t.description || t.merchant || 'No description'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {t.type === 'INCOME' ? 'Money in — private' : t.usage === 'MIXED' ? 'Private part of a mixed expense' : 'Private expense'} · {germanDate(t.transactionDate)}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-gray-300 whitespace-nowrap">{eur(t.privateAmount)}</p>
                </li>
              ))
            )}
          </ul>
        </>
      )}
    </div>
  )
}
