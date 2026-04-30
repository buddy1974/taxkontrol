'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to TaxKontrol',
    subtitle: 'Your daily financial control system for Germany',
    content: `TaxKontrol helps you:
• Never get surprised by the Finanzamt
• Know exactly how much tax to save
• Track who owes you and who you owe
• Make smart spending decisions every day`,
  },
  {
    id: 'tax-type',
    title: 'What is your tax situation?',
    subtitle: 'This affects how VAT is calculated',
    content: 'tax-type-form',
  },
  {
    id: 'fixed-costs',
    title: 'What are your monthly fixed costs?',
    subtitle: 'Rent, phone, subscriptions — add them once, tracked forever',
    content: 'fixed-costs-form',
  },
  {
    id: 'done',
    title: 'You are ready',
    subtitle: 'TaxKontrol is set up for your business',
    content: 'Start by adding your first income or expense transaction.',
  },
]

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [taxType, setTaxType] = useState('REGELBESTEUERUNG')
  const [saving, setSaving] = useState(false)

  const current = STEPS[step]

  async function handleFinish() {
    setSaving(true)
    await fetch('/api/v1/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taxType }),
    })
    router.push('/dashboard')
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress dots */}
        <div className="flex gap-2 justify-center mb-8">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-8 bg-blue-500' : i < step ? 'w-2 bg-blue-800' : 'w-2 bg-gray-700'
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-8">
          <h1 className="text-2xl font-bold text-white mb-2">{current.title}</h1>
          <p className="text-gray-500 text-sm mb-6">{current.subtitle}</p>

          {current.content === 'tax-type-form' ? (
            <div className="space-y-3">
              {[
                {
                  value: 'KLEINUNTERNEHMER',
                  label: 'Kleinunternehmer',
                  desc: 'Under €22,000/year revenue — no VAT charged (§19 UStG)',
                },
                {
                  value: 'REGELBESTEUERUNG',
                  label: 'Regelbesteuerung',
                  desc: 'Standard VAT — you charge 19% or 7% and reclaim VAT on purchases',
                },
              ].map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTaxType(opt.value)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    taxType === opt.value
                      ? 'border-blue-500 bg-blue-950'
                      : 'border-gray-700 bg-gray-800 hover:border-gray-600'
                  }`}
                >
                  <p className="text-white font-medium text-sm">{opt.label}</p>
                  <p className="text-gray-400 text-xs mt-1">{opt.desc}</p>
                </button>
              ))}
            </div>
          ) : current.content === 'fixed-costs-form' ? (
            <div className="space-y-3">
              <p className="text-gray-400 text-sm">You can add these now or later in Fixed Costs.</p>
              <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
                <p className="text-sm text-white font-medium">Common fixed costs:</p>
                <ul className="text-xs text-gray-400 mt-2 space-y-1">
                  <li>• Office or workspace rent (Büromiete)</li>
                  <li>• Phone and internet (Telefon & Internet)</li>
                  <li>• Software subscriptions</li>
                  <li>• Professional insurance (Berufshaftpflicht)</li>
                  <li>• Accounting software</li>
                </ul>
              </div>
              <p className="text-xs text-gray-500">
                Go to Fixed Costs in the sidebar after setup to add them.
              </p>
            </div>
          ) : (
            <div className="text-gray-400 text-sm whitespace-pre-line leading-relaxed">
              {current.content}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-5 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white bg-gray-900 border border-gray-800"
            >
              Back
            </button>
          )}
          <button
            onClick={() => {
              if (step < STEPS.length - 1) setStep(s => s + 1)
              else handleFinish()
            }}
            disabled={saving}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {step < STEPS.length - 1 ? 'Next' : saving ? 'Setting up...' : 'Go to dashboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
