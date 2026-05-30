'use client'

import { useState } from 'react'
import type { DecisionInput, DecisionType } from '@/lib/decision/decisionTypes'

const DECISION_TYPES: { value: DecisionType; label: string; example: string }[] = [
  { value: 'SPEND', label: 'Buy / spend', example: 'fuel, supplies, materials' },
  { value: 'BUY_EQUIPMENT', label: 'Buy equipment', example: 'laptop, tools, vehicle part' },
  { value: 'PAY_SUPPLIER', label: 'Pay supplier', example: 'invoice, subcontractor' },
  { value: 'WITHDRAW', label: 'Take money for myself', example: 'personal withdrawal' },
  { value: 'HIRE_HELP', label: 'Hire help', example: 'staff, temporary worker' },
  { value: 'OTHER', label: 'Other', example: 'anything else' },
]

interface Props {
  onSubmit: (input: DecisionInput) => Promise<void>
  loading: boolean
}

export default function DecisionForm({ onSubmit, loading }: Props) {
  const [amount, setAmount] = useState('')
  const [purpose, setPurpose] = useState('')
  const [note, setNote] = useState('')
  const [decisionType, setDecisionType] = useState<DecisionType>('SPEND')
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) { setError('Please enter a valid amount greater than 0.'); return }
    if (!purpose.trim()) { setError('Please describe what this is for.'); return }
    await onSubmit({ amount: amt, purpose: purpose.trim(), note: note.trim() || undefined, decisionType })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Amount */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          How much do you want to spend or use?
        </label>
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 text-sm">€</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            required
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg pl-8 pr-4 py-3 text-sm focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Type */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">What type of decision is this?</label>
        <div className="grid grid-cols-2 gap-2">
          {DECISION_TYPES.map(dt => (
            <button
              key={dt.value}
              type="button"
              onClick={() => setDecisionType(dt.value)}
              className={`rounded-lg px-3 py-3 text-left transition-colors border ${
                decisionType === dt.value
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              <p className="text-sm font-medium">{dt.label}</p>
              <p className="text-xs opacity-60 mt-0.5">{dt.example}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Purpose */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          What is this for? (briefly describe)
        </label>
        <input
          type="text"
          value={purpose}
          onChange={e => setPurpose(e.target.value)}
          placeholder='e.g. "new tyres for my van" or "restaurant supplies this week"'
          required
          className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {/* Note (optional) */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          Additional note (optional)
        </label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Any extra context..."
          className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-blue-500"
        />
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition-colors"
      >
        {loading ? 'Checking...' : 'Check this decision'}
      </button>
    </form>
  )
}
