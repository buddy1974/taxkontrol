'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { RecurringExpenseCandidate, PersonaSuggestion } from '@/lib/guidance/prefillEngine'

interface SuggestionsPayload {
  recurringExpenses: RecurringExpenseCandidate[]
  personaSuggestions: PersonaSuggestion[]
}

export default function SmartSuggestions() {
  const [data, setData] = useState<SuggestionsPayload | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/v1/guidance/suggestions')
      .then(r => r.json())
      .then((d: SuggestionsPayload) => setData(d))
      .catch(() => {})
  }, [])

  if (!data) return null

  const activeRecurring = data.recurringExpenses.filter(
    e => !dismissed.has(`recurring:${e.merchant}`)
  )
  const activePersona = data.personaSuggestions.filter(
    (_, i) => !dismissed.has(`persona:${i}`)
  )

  if (activeRecurring.length === 0 && activePersona.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-1">Smart suggestions</p>

      {activeRecurring.map(e => (
        <div
          key={e.merchant}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-3"
        >
          <span className="text-base mt-0.5 shrink-0">🔁</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">
              <span className="font-medium">{e.merchant}</span> appears {e.occurrences} times
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Average amount: €{e.amount.toFixed(2)}. Would you like to add this as a monthly fixed cost?
            </p>
            <div className="flex gap-3 mt-2">
              <Link
                href="/fixed-costs"
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Add fixed cost →
              </Link>
              <button
                onClick={() =>
                  setDismissed(prev => new Set(prev).add(`recurring:${e.merchant}`))
                }
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ))}

      {activePersona.map((s, i) => (
        <div
          key={i}
          className="bg-gray-900 border border-gray-800 rounded-lg p-4 flex items-start gap-3"
        >
          <span className="text-base mt-0.5 shrink-0">💡</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white font-medium">{s.title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.description}</p>
            <div className="flex gap-3 mt-2">
              <Link
                href={s.route}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg px-3 py-1.5 transition-colors"
              >
                Try it →
              </Link>
              <button
                onClick={() =>
                  setDismissed(prev => new Set(prev).add(`persona:${i}`))
                }
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
