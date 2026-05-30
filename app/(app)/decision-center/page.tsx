'use client'

import { useState, useEffect } from 'react'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import DecisionForm from '@/components/decision/DecisionForm'
import DecisionResult from '@/components/decision/DecisionResult'
import type { DecisionInput, DecisionResult as DecisionResultType } from '@/lib/decision/decisionTypes'

type SavedEvaluation = {
  id: string
  decisionType: string
  amount: number
  purpose: string
  resultLevel: string
  confidenceLevel: string
  summary: string
  createdAt: string
}

const RESULT_BADGE: Record<string, string> = {
  SAFE: 'bg-emerald-900 text-emerald-300',
  CAUTION: 'bg-amber-900 text-amber-300',
  NOT_RECOMMENDED: 'bg-red-900 text-red-300',
  INSUFFICIENT_DATA: 'bg-gray-800 text-gray-400',
}

const RESULT_LABEL: Record<string, string> = {
  SAFE: 'Manageable',
  CAUTION: 'Caution',
  NOT_RECOMMENDED: 'Not recommended',
  INSUFFICIENT_DATA: 'Not enough data',
}

export default function DecisionCenterPage() {
  const [result, setResult] = useState<DecisionResultType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [history, setHistory] = useState<SavedEvaluation[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/decision-center/history')
      .then(r => r.ok ? r.json() : [])
      .then(data => { setHistory(data); setHistoryLoading(false) })
      .catch(() => setHistoryLoading(false))
  }, [result]) // Reload history whenever a new result comes in

  async function handleSubmit(input: DecisionInput) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/decision-center/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Could not evaluate this decision. Please try again.')
        setLoading(false)
        return
      }
      setResult(data)
    } catch {
      setError('Something went wrong. Please check your connection and try again.')
    }
    setLoading(false)
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Decision Center</h1>
        <p className="text-gray-500 text-sm mt-1">
          Can I safely use this money right now?
        </p>
      </div>

      <GuidanceInfoBox
        title="What is the Decision Center?"
        whatIsThis="This tool helps you answer one question: can I safely spend this money right now? It looks at your income, taxes, fixed costs, and open obligations to give you an honest estimate — not a guarantee."
        examples={[
          'Should I buy new tyres for my van this week?',
          'Can I pay my supplier invoice before the end of the month?',
          'Is it safe to take €500 for myself from the business account?',
          'Can I buy a new laptop for work right now?',
        ]}
        whyItMatters="Many self-employed people spend money that they later realize was needed for taxes or rent. This tool helps you think before you spend — based on your actual records."
        importantNote="This is an estimate only. For large or important decisions, always speak with your Steuerberater first. TaxKontrol does not give legal or financial advice."
      />

      {!result ? (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-sm font-medium text-white mb-4">Enter your decision</p>
          {error && (
            <div className="mb-4 rounded-lg bg-red-950 border border-red-800 px-4 py-3 text-red-400 text-sm">
              {error}
            </div>
          )}
          <DecisionForm onSubmit={handleSubmit} loading={loading} />
        </div>
      ) : (
        <DecisionResult result={result} onReset={() => { setResult(null); setError('') }} />
      )}

      {/* History section */}
      {history.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <p className="text-sm font-medium text-white mb-4">Previous decisions</p>
          {historyLoading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <div className="space-y-3">
              {history.slice(0, 10).map(ev => (
                <div key={ev.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-800 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RESULT_BADGE[ev.resultLevel] ?? 'bg-gray-800 text-gray-400'}`}>
                        {RESULT_LABEL[ev.resultLevel] ?? ev.resultLevel}
                      </span>
                      <span className="text-xs text-gray-600">
                        {new Date(ev.createdAt).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                    <p className="text-sm text-white truncate">{ev.purpose}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{ev.decisionType.replace('_', ' ').toLowerCase()}</p>
                  </div>
                  <p className="text-sm font-semibold text-white shrink-0">€{ev.amount.toFixed(2)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
