'use client'

import { useEffect, useState } from 'react'
import type {
  BureaucracyConfidence,
  BusinessType,
  GuidanceComplexity,
  OrganizationLevel,
  PaymentStyle,
  PersonaProfile,
} from '@/lib/guidance/guidanceTypes'

interface State {
  businessType: BusinessType
  employeeCount: number
  paymentStyle: PaymentStyle
  operatingDaysPerWeek: number
  averageMonthlyRevenue: number | null
  bureaucracyConfidence: BureaucracyConfidence
  organizationLevel: OrganizationLevel
  guidanceComplexity: GuidanceComplexity
}

const defaultState: State = {
  businessType: 'OTHER',
  employeeCount: 0,
  paymentStyle: 'MIXED',
  operatingDaysPerWeek: 5,
  averageMonthlyRevenue: null,
  bureaucracyConfidence: 'MEDIUM',
  organizationLevel: 'IMPROVING',
  guidanceComplexity: 'STANDARD',
}

const BUSINESS_OPTIONS: Array<{ value: BusinessType; label: string; emoji: string }> = [
  { value: 'FREELANCER', label: 'Freelancer', emoji: '💻' },
  { value: 'RESTAURANT', label: 'Restaurant / Food', emoji: '🍽️' },
  { value: 'CONSTRUCTION', label: 'Construction / Trade', emoji: '🏗️' },
  { value: 'DRIVER', label: 'Driver / Delivery', emoji: '🚗' },
  { value: 'RETAIL', label: 'Retail / Shop', emoji: '🛍️' },
  { value: 'CREATIVE', label: 'Creative / Artist', emoji: '🎨' },
  { value: 'CONSULTANT', label: 'Consultant', emoji: '📋' },
  { value: 'OTHER', label: 'Other business', emoji: '🏢' },
]

export default function PersonaSetup({
  initialProfile,
  onSaved,
}: {
  initialProfile: PersonaProfile | null
  onSaved?: () => void
}) {
  const [step, setStep] = useState(1)
  const [state, setState] = useState<State>({ ...defaultState })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [editing, setEditing] = useState(!initialProfile)
  const [error, setError] = useState('')

  useEffect(() => {
    if (initialProfile) {
      setState({
        businessType: initialProfile.businessType as BusinessType,
        employeeCount: initialProfile.employeeCount,
        paymentStyle: initialProfile.paymentStyle as PaymentStyle,
        operatingDaysPerWeek: initialProfile.operatingDaysPerWeek ?? 5,
        averageMonthlyRevenue: initialProfile.averageMonthlyRevenue ?? null,
        bureaucracyConfidence: initialProfile.bureaucracyConfidence as BureaucracyConfidence,
        organizationLevel: initialProfile.organizationLevel as OrganizationLevel,
        guidanceComplexity: initialProfile.guidanceComplexity as GuidanceComplexity,
      })
    }
  }, [initialProfile])

  function set<K extends keyof State>(key: K, value: State[K]) {
    setState(prev => ({ ...prev, [key]: value }))
  }

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/v1/guidance/persona', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...state,
          averageMonthlyRevenue: state.averageMonthlyRevenue ?? undefined,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      setEditing(false)
      onSaved?.()
    } catch {
      setError('Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (!editing && (initialProfile || saved)) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs text-emerald-400">
            ✓ Profile saved — guidance is now adapted for your business type.
          </p>
          <button
            onClick={() => { setEditing(true); setSaved(false) }}
            className="text-xs text-gray-500 hover:text-gray-300 underline"
          >
            Edit
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          <span>Type: {BUSINESS_OPTIONS.find(o => o.value === state.businessType)?.label ?? 'Unknown'}</span>
          <span>Employees: {state.employeeCount}</span>
          <span>Payment: {state.paymentStyle.replace('_', ' ').toLowerCase()}</span>
          <span>Active days: {state.operatingDaysPerWeek}/week</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map(n => (
          <div
            key={n}
            className={`h-1 flex-1 rounded-full transition-colors ${
              n <= step ? 'bg-blue-600' : 'bg-gray-700'
            }`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-white mb-3">What type of business do you run?</p>
            <div className="grid grid-cols-2 gap-2">
              {BUSINESS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('businessType', opt.value)}
                  className={`text-left rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    state.businessType === opt.value
                      ? 'bg-blue-900 border border-blue-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <span className="mr-1.5">{opt.emoji}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-2">How many people work for you?</p>
            <div className="flex gap-2">
              {[0, 1, 2, 5, 10].map(n => (
                <button
                  key={n}
                  onClick={() => set('employeeCount', n)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    state.employeeCount === n
                      ? 'bg-blue-900 border border-blue-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {n === 0 ? 'Just me' : n === 10 ? '10+' : n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-2">How does your business mainly receive money?</p>
            <div className="space-y-2">
              {[
                { value: 'CASH_HEAVY', label: 'Mostly cash', hint: 'Restaurant, market, delivery' },
                { value: 'TRANSFER_HEAVY', label: 'Mostly bank transfers / invoices', hint: 'Freelancer, consultant' },
                { value: 'MIXED', label: 'Mix of both', hint: 'Varies by customer' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('paymentStyle', opt.value as PaymentStyle)}
                  className={`w-full text-left rounded-lg px-4 py-3 transition-colors ${
                    state.paymentStyle === opt.value
                      ? 'bg-blue-900 border border-blue-600'
                      : 'bg-gray-800 border border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <p className="text-sm text-white">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.hint}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep(2)}
            className="w-full bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
          >
            Continue →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-white mb-1">How many days a week is your business usually active?</p>
            <p className="text-xs text-gray-500 mb-3">This helps detect unusual gaps in your records.</p>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5, 6, 7].map(d => (
                <button
                  key={d}
                  onClick={() => set('operatingDaysPerWeek', d)}
                  className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    state.operatingDaysPerWeek === d
                      ? 'bg-blue-900 border border-blue-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-1">Currently: {state.operatingDaysPerWeek} day(s)/week</p>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-1">Roughly how much does your business earn per month?</p>
            <p className="text-xs text-gray-500 mb-2">This is an estimate — it stays private and helps calibrate your guidance.</p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { label: 'Under €1,000', value: 700 },
                { label: '€1,000–2,500', value: 1750 },
                { label: '€2,500–5,000', value: 3750 },
                { label: '€5,000–10,000', value: 7500 },
                { label: 'Over €10,000', value: 12000 },
                { label: 'Prefer not to say', value: null },
              ].map(opt => (
                <button
                  key={opt.label}
                  onClick={() => set('averageMonthlyRevenue', opt.value)}
                  className={`text-left rounded-lg px-3 py-2 text-xs transition-colors ${
                    state.averageMonthlyRevenue === opt.value
                      ? 'bg-blue-900 border border-blue-600 text-white'
                      : 'bg-gray-800 border border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-2.5 text-sm transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
            >
              Continue →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-medium text-white mb-1">How comfortable are you with German tax paperwork?</p>
            <p className="text-xs text-gray-500 mb-3">Be honest — this helps us explain things at the right level.</p>
            <div className="space-y-2">
              {[
                {
                  value: 'LOW',
                  label: 'Not comfortable at all — it feels overwhelming',
                  color: 'border-red-800',
                  active: 'bg-red-950 border-red-600',
                },
                {
                  value: 'MEDIUM',
                  label: 'I manage, but it is often stressful',
                  color: 'border-gray-700',
                  active: 'bg-blue-900 border-blue-600',
                },
                {
                  value: 'HIGH',
                  label: 'I am fairly comfortable with it',
                  color: 'border-gray-700',
                  active: 'bg-emerald-950 border-emerald-600',
                },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('bureaucracyConfidence', opt.value as BureaucracyConfidence)}
                  className={`w-full text-left rounded-lg px-4 py-3 text-sm border transition-colors ${
                    state.bureaucracyConfidence === opt.value
                      ? `${opt.active} text-white`
                      : `bg-gray-800 ${opt.color} text-gray-300 hover:border-gray-500`
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-2">How organized are your business finances right now?</p>
            <div className="space-y-2">
              {[
                { value: 'OVERWHELMED', label: 'Pretty chaotic, honestly', sub: 'Many things are missing or unclear' },
                { value: 'IMPROVING', label: 'Getting better', sub: 'I am working on it' },
                { value: 'ORGANIZED', label: 'Pretty organized', sub: 'I keep good records' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('organizationLevel', opt.value as OrganizationLevel)}
                  className={`w-full text-left rounded-lg px-4 py-3 border transition-colors ${
                    state.organizationLevel === opt.value
                      ? 'bg-blue-900 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <p className="text-sm">{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white mb-2">How much detail do you want in guidance?</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'SIMPLE', label: 'Simple', sub: 'Plain steps, no jargon' },
                { value: 'STANDARD', label: 'Standard', sub: 'Balanced detail' },
                { value: 'ADVANCED', label: 'Advanced', sub: 'Full financial detail' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => set('guidanceComplexity', opt.value as GuidanceComplexity)}
                  className={`text-left rounded-lg px-3 py-2.5 text-xs border transition-colors ${
                    state.guidanceComplexity === opt.value
                      ? 'bg-blue-900 border-blue-600 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-600'
                  }`}
                >
                  <p className="font-medium">{opt.label}</p>
                  <p className="text-gray-400 mt-0.5">{opt.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg py-2.5 text-sm transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 bg-blue-700 hover:bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save profile'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
