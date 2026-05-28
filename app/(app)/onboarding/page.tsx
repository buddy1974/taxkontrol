'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to TaxKontrol',
    subtitle: 'Financial clarity for your business in Germany',
    content: 'TaxKontrol helps you stay on top of taxes and spending without needing an accounting degree.',
  },
  {
    id: 'tax-type',
    title: 'Do you charge VAT on your invoices?',
    subtitle: 'This helps TaxKontrol show you the right information. You can change this anytime in Settings.',
    content: 'tax-type-form',
  },
  {
    id: 'fixed-costs',
    title: 'What are your regular monthly costs?',
    subtitle: 'Rent, phone, subscriptions — add them once and TaxKontrol tracks them automatically.',
    content: 'fixed-costs-form',
  },
  {
    id: 'done',
    title: "You are all set",
    subtitle: 'TaxKontrol is ready for your business',
    content: 'Start by adding your first income or expense. TaxKontrol will handle the tax calculations for you.',
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
                  label: 'No — I am a Kleinunternehmer',
                  desc: 'My total yearly revenue is under 22,000 EUR. I do not add VAT to my invoices.',
                  hint: 'Section 19 UStG — VAT exempt',
                },
                {
                  value: 'REGELBESTEUERUNG',
                  label: 'Yes — I charge VAT',
                  desc: 'I add VAT (19% or 7%) to invoices and can reclaim VAT on business purchases.',
                  hint: 'Standard VAT rules apply',
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
                  <p className="text-gray-600 text-xs mt-1">{opt.hint}</p>
                </button>
              ))}
              <p className="text-xs text-gray-600 pt-1">
                Not sure? Most freelancers starting out are Kleinunternehmer. You can change this later in Settings.
              </p>
            </div>
          ) : current.content === 'fixed-costs-form' ? (
            <div className="space-y-3">
              <p className="text-gray-400 text-sm">
                Fixed costs are bills that come every month at the same amount.
              </p>
              <div className="rounded-lg bg-gray-800 border border-gray-700 p-4">
                <p className="text-sm text-white font-medium">Common examples:</p>
                <ul className="text-xs text-gray-400 mt-2 space-y-1">
                  <li>Office or workspace rent</li>
                  <li>Phone and internet</li>
                  <li>Software subscriptions</li>
                  <li>Professional insurance</li>
                  <li>Accounting software</li>
                </ul>
              </div>
              <p className="text-xs text-gray-500">
                You can add these now or any time later in the Fixed Costs section.
              </p>
            </div>
          ) : (
            <div className="text-gray-400 text-sm leading-relaxed">
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
