'use client'

import { useEffect, useState } from 'react'
import { signOut } from 'next-auth/react'

type Settings = {
  name: string | null
  email: string
  businessName: string | null
  taxType: 'KLEINUNTERNEHMER' | 'REGELBESTEUERUNG' | 'PAUSCHALIERUNG'
  taxId: string | null
  vatId: string | null
  isJobcenter: boolean
  vatFilingPeriod: 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
  vatMethod: 'SOLL' | 'IST'
  dauerfristverlaengerung: boolean
  churchTax: boolean
  churchTaxRate: number
  taxStatusHistory: Array<{ validFrom: string | null; taxType: string; vatMethod: string; vatFilingPeriod: string; dauerfristverlaengerung: boolean }>
}

const TAX_LABEL: Record<string, string> = { KLEINUNTERNEHMER: 'Kleinunternehmer', REGELBESTEUERUNG: 'Regelbesteuerung', PAUSCHALIERUNG: 'Pauschalierung' }
const PERIOD_LABEL: Record<string, string> = { MONTHLY: 'monthly', QUARTERLY: 'quarterly', YEARLY: 'yearly' }
const berlinToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' })

const input = 'w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 min-h-11 text-base sm:text-sm focus:outline-none focus:border-blue-500'
const choice = (on: boolean) =>
  `w-full text-left p-3 min-h-11 rounded-lg border transition-colors ${on ? 'border-blue-500 bg-blue-950' : 'border-gray-700 bg-gray-800 hover:border-gray-600'}`

export default function SettingsPage() {
  const [form, setForm] = useState<Settings | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [deletePw, setDeletePw] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [saved, setSaved] = useState<Settings | null>(null)
  const [istApproved, setIstApproved] = useState(false)
  // From when a changed tax status applies: never silently retroactive.
  const [effectiveMode, setEffectiveMode] = useState<'TODAY' | 'YEAR_START' | 'NEXT_YEAR' | 'DATE' | 'ALWAYS'>('TODAY')
  const [effectiveDate, setEffectiveDate] = useState('')

  useEffect(() => {
    fetch('/api/v1/settings')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Settings) => {
        setForm(data)
        setSaved(data)
        setState('ready')
      })
      .catch(() => setState('error'))
  }, [])

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setForm(f => (f ? { ...f, [key]: value } : f))
  const statusChanged =
    !!form &&
    !!saved &&
    (form.taxType !== saved.taxType ||
      form.vatMethod !== saved.vatMethod ||
      form.vatFilingPeriod !== saved.vatFilingPeriod ||
      form.dauerfristverlaengerung !== saved.dauerfristverlaengerung)
  function effectiveFromValue(): string | undefined {
    if (!statusChanged) return undefined
    if (effectiveMode === 'ALWAYS') return 'ALWAYS'
    if (effectiveMode === 'YEAR_START') return `${berlinToday().slice(0, 4)}-01-01`
    if (effectiveMode === 'NEXT_YEAR') return `${Number(berlinToday().slice(0, 4)) + 1}-01-01`
    if (effectiveMode === 'DATE') return effectiveDate || undefined
    return berlinToday()
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!form) return
    setSaving(true)
    setMessage(null)
    const res = await fetch('/api/v1/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name ?? '',
        businessName: form.businessName ?? '',
        taxType: form.taxType,
        taxId: form.taxId ?? '',
        vatId: form.vatId ?? '',
        isJobcenter: form.isJobcenter,
        vatFilingPeriod: form.vatFilingPeriod,
        vatMethod: form.vatMethod,
        istApproved,
        dauerfristverlaengerung: form.dauerfristverlaengerung,
        statusEffectiveFrom: effectiveFromValue(),
        churchTax: form.churchTax,
        churchTaxRate: form.churchTaxRate,
      }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) {
      setMessage({ ok: false, text: data.error ?? 'Could not save.' })
      return
    }
    setForm(data)
    setSaved(data)
    setMessage({ ok: true, text: statusChanged ? 'Settings saved. Earlier periods keep the tax status that was valid then.' : 'Settings saved.' })
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    setDeleting(true)
    setDeleteError('')
    const res = await fetch('/api/v1/account', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: deletePw, confirm: deleteConfirm }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setDeleteError(data.error ?? 'Could not delete the account.')
      setDeleting(false)
      return
    }
    await signOut({ callbackUrl: '/login' })
  }

  if (state === 'loading') return <p className="text-gray-400 text-sm">Loading…</p>
  if (state === 'error' || !form) return <p role="alert" className="text-red-300 text-sm">Could not load your settings. Please reload the page.</p>

  return (
    <div className="max-w-xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Your business and tax profile</p>
      </header>

      <form onSubmit={handleSave} className="space-y-4">
        <section className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-4">
          <h2 className="text-sm font-medium text-white">Business</h2>
          <div>
            <label htmlFor="s-name" className="block text-xs text-gray-300 mb-1">Your name</label>
            <input id="s-name" className={input} maxLength={120} value={form.name ?? ''} onChange={e => set('name', e.target.value)} required />
          </div>
          <div>
            <label htmlFor="s-biz" className="block text-xs text-gray-300 mb-1">Business name (optional)</label>
            <input id="s-biz" className={input} maxLength={160} value={form.businessName ?? ''} onChange={e => set('businessName', e.target.value)} />
          </div>
          <div>
            <label htmlFor="s-taxid" className="block text-xs text-gray-300 mb-1">Steuernummer (optional)</label>
            <input id="s-taxid" className={input} maxLength={40} value={form.taxId ?? ''} onChange={e => set('taxId', e.target.value)} placeholder="123/456/78901" />
          </div>
          <div>
            <label htmlFor="s-vatid" className="block text-xs text-gray-300 mb-1">USt-IdNr. (optional)</label>
            <input id="s-vatid" className={input} maxLength={20} value={form.vatId ?? ''} onChange={e => set('vatId', e.target.value)} placeholder="DE123456789" />
          </div>
        </section>

        <fieldset className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
          <legend className="text-sm font-medium text-white px-1">VAT status</legend>
          {[
            { value: 'KLEINUNTERNEHMER' as const, label: 'Kleinunternehmer (§ 19 UStG)', desc: 'No VAT. Since 2025: last year at most 25,000 €, this year at most 100,000 € turnover.' },
            { value: 'REGELBESTEUERUNG' as const, label: 'Regelbesteuerung', desc: 'You charge 19 % / 7 % VAT and deduct VAT on business purchases.' },
          ].map(opt => (
            <button key={opt.value} type="button" aria-pressed={form.taxType === opt.value} onClick={() => set('taxType', opt.value)} className={choice(form.taxType === opt.value)}>
              <span className="block text-white text-sm font-medium">{opt.label}</span>
              <span className="block text-gray-400 text-xs mt-0.5">{opt.desc}</span>
            </button>
          ))}
          {form.taxType !== 'KLEINUNTERNEHMER' && (
            <div className="pt-2">
              <label htmlFor="s-period" className="block text-xs text-gray-300 mb-1">How often do you file the VAT return (Voranmeldung)?</label>
              <select id="s-period" className={input} value={form.vatFilingPeriod} onChange={e => set('vatFilingPeriod', e.target.value as Settings['vatFilingPeriod'])}>
                <option value="QUARTERLY">Quarterly (default)</option>
                <option value="MONTHLY">Monthly (more than 9,000 € VAT last year)</option>
                <option value="YEARLY">Only yearly (exempt from Voranmeldung)</option>
              </select>
              <label className="flex items-center gap-3 text-sm text-gray-200 min-h-11 mt-2">
                <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={form.dauerfristverlaengerung} onChange={e => set('dauerfristverlaengerung', e.target.checked)} />
                I have a Dauerfristverlängerung (returns one month later)
              </label>
              <label htmlFor="s-method" className="block text-xs text-gray-300 mb-1 mt-2">When is VAT due?</label>
              <select id="s-method" className={input} value={form.vatMethod} onChange={e => set('vatMethod', e.target.value as Settings['vatMethod'])}>
                <option value="SOLL">With the invoice date — Sollversteuerung (legal default)</option>
                <option value="IST">When the money arrives — Istversteuerung (needs approval)</option>
              </select>
              {form.vatMethod === 'IST' && saved?.vatMethod !== 'IST' && (
                <label className="flex items-start gap-3 text-sm text-gray-200 mt-2">
                  <input type="checkbox" className="h-5 w-5 mt-0.5 accent-blue-500" checked={istApproved} onChange={e => setIstApproved(e.target.checked)} />
                  <span>The Finanzamt has approved Istversteuerung for me (§ 20 UStG). Without this approval VAT is due with the invoice.</span>
                </label>
              )}
            </div>
          )}
          {statusChanged && (
            <div className="pt-2 space-y-2 border-t border-gray-800">
              <label htmlFor="s-eff" className="block text-xs text-gray-300">From when does the change apply?</label>
              <select id="s-eff" className={input} value={effectiveMode} onChange={e => setEffectiveMode(e.target.value as typeof effectiveMode)}>
                <option value="TODAY">From today</option>
                <option value="YEAR_START">From 1 January of this year</option>
                <option value="NEXT_YEAR">From 1 January of next year</option>
                <option value="DATE">From a date I choose</option>
                <option value="ALWAYS">It was always like this (correct a wrong setting)</option>
              </select>
              {effectiveMode === 'DATE' && (
                <div>
                  <label htmlFor="s-eff-date" className="block text-xs text-gray-300 mb-1">Applies from</label>
                  <input id="s-eff-date" type="date" className={input} value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} required />
                </div>
              )}
              <p className="text-xs text-gray-400">Periods before that date keep the status valid then, so taxes already owed for them do not disappear.</p>
              {saved && form.vatFilingPeriod !== saved.vatFilingPeriod && (
                <p className="text-xs text-amber-300">The filing period (monthly / quarterly / yearly) changes per calendar year: choose 1 January, or “It was always like this”.</p>
              )}
            </div>
          )}
          {form.taxStatusHistory.length > 1 && (
            <div className="pt-2 border-t border-gray-800">
              <p className="text-xs text-gray-300 mb-1">Your status history</p>
              <ul className="text-xs text-gray-400 space-y-0.5">
                {form.taxStatusHistory.map(h => (
                  <li key={h.validFrom ?? 'always'}>
                    {h.validFrom ? `From ${h.validFrom.split('-').reverse().join('.')}` : 'Before that'}: {TAX_LABEL[h.taxType] ?? h.taxType}
                    {h.taxType !== 'KLEINUNTERNEHMER' ? ` · ${h.vatMethod === 'IST' ? 'Ist' : 'Soll'} · ${PERIOD_LABEL[h.vatFilingPeriod] ?? h.vatFilingPeriod}${h.dauerfristverlaengerung ? ' · DFV' : ''}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </fieldset>

        <fieldset className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
          <legend className="text-sm font-medium text-white px-1">Income tax estimate</legend>
          <label className="flex items-center gap-3 text-sm text-gray-200 min-h-11">
            <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={form.churchTax} onChange={e => set('churchTax', e.target.checked)} />
            I pay church tax (Kirchensteuer)
          </label>
          {form.churchTax && (
            <div>
              <label htmlFor="s-church" className="block text-xs text-gray-300 mb-1">Federal state</label>
              <select id="s-church" className={input} value={form.churchTaxRate} onChange={e => set('churchTaxRate', Number(e.target.value))}>
                <option value={9}>All states except Bayern and Baden-Württemberg (9 %)</option>
                <option value={8}>Bayern or Baden-Württemberg (8 %)</option>
              </select>
            </div>
          )}
          <p className="text-xs text-gray-400">The estimate assumes single assessment and no other income. Ask your Steuerberater if this does not fit you.</p>
        </fieldset>

        <fieldset className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <legend className="text-sm font-medium text-white px-1">Jobcenter</legend>
          <label className="flex items-center gap-3 text-sm text-gray-200 min-h-11">
            <input type="checkbox" className="h-5 w-5 accent-blue-500" checked={form.isJobcenter} onChange={e => set('isJobcenter', e.target.checked)} />
            I receive Grundsicherungsgeld (formerly Bürgergeld)
          </label>
        </fieldset>

        {message && (
          <p role={message.ok ? 'status' : 'alert'} className={`rounded-lg px-4 py-3 text-sm border ${message.ok ? 'bg-emerald-950 border-emerald-800 text-emerald-200' : 'bg-red-950 border-red-800 text-red-200'}`}>
            {message.text}
          </p>
        )}

        <button type="submit" disabled={saving} className="w-full py-2.5 min-h-11 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50">
          {saving ? 'Saving…' : 'Save settings'}
        </button>
      </form>

      <section className="rounded-xl bg-gray-900 border border-gray-800 p-5 space-y-3">
        <h2 className="text-sm font-medium text-white">Your data</h2>
        <p className="text-xs text-gray-400">Download everything TaxKontrol stores about you as a JSON file (Art. 15/20 DSGVO).</p>
        <a href="/api/v1/account/export" className="inline-flex items-center px-4 min-h-11 rounded-lg bg-gray-800 border border-gray-700 text-sm text-gray-200 hover:text-white">
          Download my data
        </a>
      </section>

      <section className="rounded-xl bg-red-950/40 border border-red-900 p-5 space-y-3">
        <h2 className="text-sm font-medium text-red-200">Delete account</h2>
        <p className="text-xs text-red-200/80">
          Deletes your account, all transactions, documents and uploaded files permanently. This cannot be undone. Download your data first —
          you may have to keep business receipts for the tax office (usually 8–10 years).
        </p>
        <form onSubmit={handleDelete} className="space-y-3">
          <div>
            <label htmlFor="d-pw" className="block text-xs text-red-200 mb-1">Your password</label>
            <input id="d-pw" type="password" autoComplete="current-password" className={input} value={deletePw} onChange={e => setDeletePw(e.target.value)} required />
          </div>
          <div>
            <label htmlFor="d-confirm" className="block text-xs text-red-200 mb-1">Type DELETE to confirm</label>
            <input id="d-confirm" className={input} value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)} required />
          </div>
          {deleteError && <p role="alert" className="text-sm text-red-300">{deleteError}</p>}
          <button type="submit" disabled={deleting || deleteConfirm.trim().toUpperCase() !== 'DELETE' || !deletePw} className="w-full py-2.5 min-h-11 bg-red-700 hover:bg-red-600 text-white text-sm font-medium rounded-lg disabled:opacity-50">
            {deleting ? 'Deleting…' : 'Delete my account permanently'}
          </button>
        </form>
      </section>
    </div>
  )
}
