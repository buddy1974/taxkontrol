'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type TaxChoice = 'KLEINUNTERNEHMER' | 'REGELBESTEUERUNG'

const STEPS = ['welcome', 'tax-type', 'jobcenter', 'fixed-costs', 'done'] as const

export default function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [taxType, setTaxType] = useState<TaxChoice | null>(null)
  const [isJobcenter, setIsJobcenter] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const current = STEPS[step]
  const canContinue = (current !== 'tax-type' || taxType !== null) && (current !== 'jobcenter' || isJobcenter !== null)

  async function handleFinish() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxType, isJobcenter: isJobcenter === true }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Could not save.')
      router.push('/dashboard')
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
      setSaving(false)
    }
  }

  const choice = (selected: boolean) =>
    `w-full text-left p-4 rounded-xl border transition-colors min-h-11 ${selected ? 'border-blue-500 bg-blue-950' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-lg">
        <ol className="flex gap-2 justify-center mb-8" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <li key={s} className={`h-2 rounded-full transition-all ${i === step ? 'w-8 bg-blue-500' : i < step ? 'w-2 bg-blue-800' : 'w-2 bg-gray-700'}`} />
          ))}
        </ol>

        <div className="rounded-2xl bg-gray-900 border border-gray-800 p-6 sm:p-8">
          {current === 'welcome' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">Welcome to TaxKontrol</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                TaxKontrol shows you each month which part of your money is really yours, which part belongs to the tax office, and what is still due.
                Three short questions first — you can change every answer later in Settings.
              </p>
            </>
          )}

          {current === 'tax-type' && (
            <fieldset>
              <legend className="text-xl font-bold text-white mb-1">Do you add VAT (Umsatzsteuer) to your invoices?</legend>
              <p className="text-gray-400 text-sm mb-5">This changes how every amount is calculated.</p>
              <div className="space-y-3">
                <button type="button" aria-pressed={taxType === 'KLEINUNTERNEHMER'} onClick={() => setTaxType('KLEINUNTERNEHMER')} className={choice(taxType === 'KLEINUNTERNEHMER')}>
                  <p className="text-white font-medium text-sm">No — I am a Kleinunternehmer (§ 19 UStG)</p>
                  <p className="text-gray-400 text-xs mt-1">
                    No VAT on my invoices and no VAT refund on purchases. Allowed if last year’s turnover was at most 25,000 € and this year’s stays at most 100,000 € (rules since 2025).
                  </p>
                </button>
                <button type="button" aria-pressed={taxType === 'REGELBESTEUERUNG'} onClick={() => setTaxType('REGELBESTEUERUNG')} className={choice(taxType === 'REGELBESTEUERUNG')}>
                  <p className="text-white font-medium text-sm">Yes — I charge VAT</p>
                  <p className="text-gray-400 text-xs mt-1">I add 19 % or 7 % VAT to invoices, pay it to the Finanzamt and can deduct VAT on business purchases.</p>
                </button>
              </div>
              <p className="text-xs text-gray-400 pt-3">
                Not sure? Check what you chose in the “Fragebogen zur steuerlichen Erfassung” you sent to the Finanzamt, or ask your Steuerberater.
              </p>
            </fieldset>
          )}

          {current === 'jobcenter' && (
            <fieldset>
              <legend className="text-xl font-bold text-white mb-1">Do you receive Grundsicherungsgeld (formerly Bürgergeld)?</legend>
              <p className="text-gray-400 text-sm mb-5">Then TaxKontrol helps you prepare the Anlage EKS for the Jobcenter.</p>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" aria-pressed={isJobcenter === true} onClick={() => setIsJobcenter(true)} className={choice(isJobcenter === true)}>
                  <p className="text-white font-medium text-sm">Yes</p>
                </button>
                <button type="button" aria-pressed={isJobcenter === false} onClick={() => setIsJobcenter(false)} className={choice(isJobcenter === false)}>
                  <p className="text-white font-medium text-sm">No</p>
                </button>
              </div>
            </fieldset>
          )}

          {current === 'fixed-costs' && (
            <>
              <h1 className="text-xl font-bold text-white mb-2">Regular costs</h1>
              <p className="text-gray-400 text-sm mb-4">
                Rent, phone, insurance, subscriptions: add them under <strong className="text-gray-200">Fixed costs</strong>. TaxKontrol then reminds you of
                what is still due each month — and does not count a cost twice once you have booked the payment.
              </p>
            </>
          )}

          {current === 'done' && (
            <>
              <h1 className="text-2xl font-bold text-white mb-2">You are all set</h1>
              <p className="text-gray-400 text-sm leading-relaxed">
                Start with your first money in or money out. All numbers are estimates to help you plan — TaxKontrol does not file taxes.
              </p>
            </>
          )}

          {error && <p role="alert" className="text-red-400 text-sm mt-4">{error}</p>}
        </div>

        <div className="flex gap-3 mt-6">
          {step > 0 && (
            <button type="button" onClick={() => setStep(s => s - 1)} className="px-5 py-2.5 min-h-11 rounded-lg text-sm text-gray-300 hover:text-white bg-gray-900 border border-gray-800">
              Back
            </button>
          )}
          <button
            type="button"
            onClick={() => (step < STEPS.length - 1 ? setStep(s => s + 1) : handleFinish())}
            disabled={saving || !canContinue}
            className="flex-1 py-2.5 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
          >
            {step < STEPS.length - 1 ? 'Next' : saving ? 'Saving…' : 'Go to dashboard'}
          </button>
        </div>
      </div>
    </div>
  )
}
