'use client'

import { useState } from 'react'
import type {
  BureaucracyConfidence,
  OrganizationLevel,
  PaymentStyle,
  PersonaProfile,
} from '@/lib/guidance/guidanceTypes'

interface Props {
  profile: PersonaProfile | null
  onAnswered?: () => void
}

type Question = {
  id: string
  text: string
  subtext?: string
  options: Array<{ label: string; value: string; field: string }>
}

function pickQuestion(profile: PersonaProfile | null): Question | null {
  if (!profile) return null

  // Ask about bureaucracy confidence if still at default MEDIUM
  if (profile.bureaucracyConfidence === 'MEDIUM') {
    return {
      id: 'bureaucracyConfidence',
      text: 'How do you feel about German tax paperwork?',
      subtext: 'This helps us explain things at the right level.',
      options: [
        { label: 'It feels overwhelming', value: 'LOW', field: 'bureaucracyConfidence' },
        { label: 'It is manageable but stressful', value: 'MEDIUM', field: 'bureaucracyConfidence' },
        { label: 'I am fairly comfortable', value: 'HIGH', field: 'bureaucracyConfidence' },
      ],
    }
  }

  // Ask about payment style if at default MIXED
  if (profile.paymentStyle === 'MIXED' && profile.cashPercentage === null) {
    return {
      id: 'paymentStyle',
      text: 'How does your business mainly receive money?',
      options: [
        { label: 'Mostly cash', value: 'CASH_HEAVY', field: 'paymentStyle' },
        { label: 'Mostly bank transfers', value: 'TRANSFER_HEAVY', field: 'paymentStyle' },
        { label: 'A mix of both', value: 'MIXED', field: 'paymentStyle' },
      ],
    }
  }

  // Ask about organization level if at default IMPROVING
  if (profile.organizationLevel === 'IMPROVING') {
    return {
      id: 'organizationLevel',
      text: 'How organized are your business finances right now?',
      options: [
        { label: 'Pretty chaotic', value: 'OVERWHELMED', field: 'organizationLevel' },
        { label: 'Getting better', value: 'IMPROVING', field: 'organizationLevel' },
        { label: 'Fairly organized', value: 'ORGANIZED', field: 'organizationLevel' },
      ],
    }
  }

  return null
}

export default function MicroProfileQuestion({ profile, onAnswered }: Props) {
  const [answered, setAnswered] = useState(false)
  const [saving, setSaving] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  const question = pickQuestion(profile)

  if (!question || answered || dismissed) return null

  async function handleAnswer(field: string, value: string) {
    setSaving(true)
    try {
      await fetch('/api/v1/guidance/persona', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      })
      setAnswered(true)
      onAnswered?.()
    } catch {
      // Non-critical
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-blue-950 border border-blue-800 rounded-lg p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-sm text-white font-medium">{question.text}</p>
          {question.subtext && (
            <p className="text-xs text-blue-300 mt-0.5">{question.subtext}</p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="text-blue-600 hover:text-blue-400 text-xs shrink-0"
        >
          Skip
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {question.options.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleAnswer(opt.field, opt.value)}
            disabled={saving}
            className="text-xs bg-blue-900 hover:bg-blue-800 text-blue-200 border border-blue-700 rounded-lg px-3 py-2 disabled:opacity-50 transition-colors"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
