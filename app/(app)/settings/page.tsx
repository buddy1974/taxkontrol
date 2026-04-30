'use client'

import { useEffect, useState } from 'react'

type Profile = {
  name: string | null
  email: string
  businessName: string | null
  taxType: string
  taxId: string | null
  vatId: string | null
}

export default function SettingsPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    name: '',
    businessName: '',
    taxType: 'REGELBESTEUERUNG',
    taxId: '',
    vatId: '',
  })

  useEffect(() => {
    fetch('/api/v1/settings')
      .then(r => r.json())
      .then(data => {
        setProfile(data)
        setForm({
          name: data.name ?? '',
          businessName: data.businessName ?? '',
          taxType: data.taxType ?? 'REGELBESTEUERUNG',
          taxId: data.taxId ?? '',
          vatId: data.vatId ?? '',
        })
        setLoading(false)
      })
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    await fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    setSaved(true)
    setSaving(false)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-gray-500 text-sm">Loading...</div>

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Your business and tax profile</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
          <p className="text-sm font-medium text-white">Business info</p>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Your name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Business name</label>
            <input
              type="text"
              value={form.businessName}
              onChange={e => setForm(p => ({ ...p, businessName: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="My Business GmbH"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Steuernummer (tax ID)
            </label>
            <input
              type="text"
              value={form.taxId}
              onChange={e => setForm(p => ({ ...p, taxId: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="123/456/78901"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">
              USt-IdNr. (VAT ID) — optional
            </label>
            <input
              type="text"
              value={form.vatId}
              onChange={e => setForm(p => ({ ...p, vatId: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              placeholder="DE123456789"
            />
          </div>
        </div>

        <div className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
          <p className="text-sm font-medium text-white">Tax type</p>
          {[
            { value: 'KLEINUNTERNEHMER', label: 'Kleinunternehmer', desc: 'Under €22,000/year — no VAT charged (§19 UStG)' },
            { value: 'REGELBESTEUERUNG', label: 'Regelbesteuerung', desc: 'Standard VAT — charge and reclaim 19% / 7%' },
          ].map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setForm(p => ({ ...p, taxType: opt.value }))}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                form.taxType === opt.value
                  ? 'border-blue-500 bg-blue-950'
                  : 'border-gray-700 bg-gray-800 hover:border-gray-600'
              }`}
            >
              <p className="text-white text-sm font-medium">{opt.label}</p>
              <p className="text-gray-400 text-xs mt-0.5">{opt.desc}</p>
            </button>
          ))}
        </div>

        {saved && (
          <div className="rounded-lg bg-emerald-950 border border-emerald-800 px-4 py-3 text-emerald-400 text-sm">
            Settings saved
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </form>
    </div>
  )
}
