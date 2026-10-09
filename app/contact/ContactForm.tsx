'use client'

import { useState } from 'react'

interface ContactFormProps {
  isTaxKontrol: boolean
  system: string | null
}

const HELP_OPTIONS = [
  { value: 'finanzamt_brief', label: 'Finanzamt-Brief' },
  { value: 'belege_rechnungen', label: 'Belege und Rechnungen' },
  { value: 'einnahmen_ausgaben', label: 'Einnahmen und Ausgaben' },
  { value: 'jobcenter_buergergelder', label: 'Jobcenter / Bürgergeld-Unterlagen' },
  { value: 'steuerberater_vorbereitung', label: 'Vorbereitung für Steuerberater' },
  { value: 'steuerreserve', label: 'Steuerreserve-Übersicht' },
  { value: 'dokumente_hochladen', label: 'Dokumente hochladen und sortieren' },
  { value: 'noch_unsicher', label: 'Ich bin noch nicht sicher' },
]

export default function ContactForm({ isTaxKontrol, system }: ContactFormProps) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '', helpNeeded: '' })
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setState('loading')
    setErrorMsg('')

    const payload = {
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      message: form.message,
      helpNeeded: form.helpNeeded || undefined,
      system: isTaxKontrol ? 'taxkontrol' : (system ?? undefined),
      source: isTaxKontrol ? 'taxkontrol_consultation_request' : 'contact',
    }

    try {
      const res = await fetch('/api/v1/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorMsg(data.error || 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.')
        setState('error')
      } else {
        setState('success')
      }
    } catch {
      setErrorMsg('Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.')
      setState('error')
    }
  }

  if (state === 'success') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 text-center space-y-2">
        <p className="text-white font-semibold">Anfrage eingegangen</p>
        <p className="text-sm text-gray-400">
          {isTaxKontrol
            ? 'Wir haben Ihre Anfrage erhalten und melden uns in der Regel innerhalb eines Werktags.'
            : 'Wir haben Ihre Nachricht erhalten und melden uns bald.'}
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">

      <div>
        <label className="block text-sm text-gray-400 mb-1">Name</label>
        <input
          name="name"
          type="text"
          value={form.name}
          onChange={handleChange}
          required
          maxLength={120}
          className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          placeholder="Ihr vollständiger Name"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">E-Mail</label>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={handleChange}
          required
          maxLength={200}
          className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          placeholder="ihre@email.de"
        />
      </div>

      {isTaxKontrol && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            Telefon <span className="text-gray-600">(optional)</span>
          </label>
          <input
            name="phone"
            type="tel"
            value={form.phone}
            onChange={handleChange}
            maxLength={30}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
            placeholder="+49 ..."
          />
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-1">
          {isTaxKontrol ? 'Ihre aktuelle Situation' : 'Nachricht'}
        </label>
        <textarea
          name="message"
          value={form.message}
          onChange={handleChange}
          required
          minLength={20}
          maxLength={2000}
          rows={5}
          className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 resize-none"
          placeholder={
            isTaxKontrol
              ? 'Beschreiben Sie kurz: Haben Sie Finanzamt-Briefe, fehlende Belege, unklare Ausgaben, Jobcenter-Berichte? Was möchten Sie mit einem Steuerberater klären?'
              : 'Wie können wir Ihnen helfen?'
          }
        />
        <p className="text-xs text-gray-600 mt-1 text-right">{form.message.length} / 2000</p>
      </div>

      {isTaxKontrol && (
        <div>
          <label className="block text-sm text-gray-400 mb-1">Wobei benötigen Sie Unterstützung?</label>
          <select
            name="helpNeeded"
            value={form.helpNeeded}
            onChange={handleChange}
            className="w-full bg-gray-900 border border-gray-800 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">Bitte auswählen (optional)</option>
            {HELP_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      )}

      {state === 'error' && (
        <p className="text-red-400 text-sm">{errorMsg}</p>
      )}

      <button
        type="submit"
        disabled={state === 'loading'}
        className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition-colors"
      >
        {state === 'loading'
          ? 'Wird gesendet...'
          : isTaxKontrol
            ? 'TaxKontrol Beratung anfragen'
            : 'Nachricht senden'}
      </button>

      <p className="text-xs text-gray-600">
        Ihre Daten werden ausschließlich zur Bearbeitung Ihrer Anfrage verwendet.{' '}
        <a href="/datenschutz" className="hover:text-gray-400 underline">Datenschutz</a>
      </p>

    </form>
  )
}
