'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'

type OcrData = {
  merchant?: string | null
  amount?: number | null
  vatRate?: number | null
  date?: string | null
  description?: string | null
  type?: string | null
}

type DocumentDetail = {
  id: string
  fileName: string
  mimeType: string
  type: string
  status: string
  reviewStatus: string | null
  approvedAt: string | null
  ocrText: string | null
  ocrData: OcrData | null
  correctionData: OcrData | null
  linkedTransactionId: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING:      { label: 'Processing', cls: 'bg-gray-800 text-gray-400' },
  PROCESSED:    { label: 'Processed — awaiting review', cls: 'bg-blue-900 text-blue-300' },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'bg-amber-900 text-amber-300' },
  DONE:         { label: 'Done', cls: 'bg-emerald-900 text-emerald-300' },
}

export default function DocumentReviewPage() {
  const { documentId } = useParams<{ documentId: string }>()

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Review form state — always visible, prefilled from the AI suggestion
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [vatRate, setVatRate] = useState('19')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [txType, setTxType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE')
  const [usage, setUsage] = useState<'BUSINESS' | 'MIXED' | 'PRIVATE'>('BUSINESS')
  const [businessPct, setBusinessPct] = useState(50)

  useEffect(() => {
    fetch(`/api/v1/documents/${documentId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: DocumentDetail) => {
        setDoc(data)
        const source = { ...(data.ocrData ?? {}), ...(data.correctionData ?? {}) }
        setMerchant(source.merchant ?? '')
        setAmount(source.amount !== null && source.amount !== undefined ? String(source.amount) : '')
        setVatRate(source.vatRate === 0 || source.vatRate === 7 || source.vatRate === 19 ? String(source.vatRate) : '19')
        setDate(source.date ?? '')
        setDescription(source.description ?? '')
        setTxType(source.type === 'INCOME' ? 'INCOME' : 'EXPENSE')
        setLoading(false)
      })
      .catch(() => {
        setError('Could not load document.')
        setLoading(false)
      })
  }, [documentId])

  async function submit(action: 'approve' | 'reject') {
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    const corrections = {
      merchant: merchant.trim() || null,
      amount: amount.trim() === '' ? null : amount.trim(),
      vatRate: Number(vatRate),
      date: date || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
      type: txType,
      usage,
      businessPct: usage === 'MIXED' ? businessPct : 100,
    }

    try {
      const res = await fetch(`/api/v1/documents/${documentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, corrections }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)

      setSuccess(action === 'approve'
        ? 'Approved and booked. You can still correct the booking under Transactions.'
        : 'Rejected. Nothing was booked; the file stays in your list for reference.'
      )
      const updated = await fetch(`/api/v1/documents/${documentId}`).then(r => r.json())
      setDoc(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl">
        <p className="text-gray-400 text-sm">Loading document…</p>
      </div>
    )
  }

  if (error && !doc) {
    return (
      <div className="max-w-2xl">
        <Link href="/documents" className="text-xs text-gray-400 hover:text-gray-300 mb-4 inline-block">← Back</Link>
        <div className="bg-red-950 border border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!doc) return null

  const statusCfg = STATUS_CONFIG[doc.status] ?? { label: doc.status, cls: 'bg-gray-800 text-gray-400' }

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/documents" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300">
        ← Back to Documents
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
          {doc.reviewStatus === 'APPROVED' && (
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-900 text-emerald-300 font-medium">
              Approved by you
            </span>
          )}
          {doc.reviewStatus === 'REJECTED' && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-900 text-red-300 font-medium">
              Rejected
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-white truncate">{doc.fileName}</h1>
        <p className="text-xs text-gray-400 mt-1">
          Uploaded {new Date(doc.createdAt).toLocaleDateString('de-DE')}
        </p>
      </div>

      <GuidanceInfoBox
        title="How to review a document"
        whatIsThis="TaxKontrol used AI to read this document and extract the key values. You are now reviewing those values before they are saved to your records."
        whyItMatters="AI can misread amounts, dates, or supplier names. Reviewing now prevents incorrect data from appearing in your tax reports. Once you approve, the values are treated as verified by you."
        examples={[
          'Check the amount matches the total on the receipt (Bruttobetrag)',
          'Check the date is correct',
          'Check the supplier name is correct',
          'Correct any wrong values using the fields below before approving',
        ]}
        importantNote="If you are unsure about a value, reject the document and upload a clearer photo or PDF."
      />

      {/* AI safety warning */}
      <div className="bg-amber-950 border border-amber-800 rounded-xl p-4">
        <p className="text-xs text-amber-300 font-semibold mb-1">AI can make mistakes</p>
        <p className="text-xs text-amber-400 leading-relaxed">
          The values below were extracted automatically. Please check them carefully before approving. Correct any errors using the form below. Do not rely on extracted data without reviewing it first.
        </p>
      </div>

      {/* Success / error */}
      {success && (
        <div className="bg-emerald-950 border border-emerald-800 rounded-xl p-4">
          <p className="text-sm text-emerald-400">{success}</p>
        </div>
      )}
      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {/* Extracted structured values */}
      {doc.ocrData && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Extracted values</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Merchant / Supplier', value: doc.ocrData.merchant },
              { label: 'Total amount', value: doc.ocrData.amount !== null && doc.ocrData.amount !== undefined ? `€${Number(doc.ocrData.amount).toFixed(2)}` : null },
              { label: 'VAT rate', value: doc.ocrData.vatRate !== null && doc.ocrData.vatRate !== undefined ? `${doc.ocrData.vatRate}%` : null },
              { label: 'Date', value: doc.ocrData.date },
              { label: 'Description', value: doc.ocrData.description },
              { label: 'Type', value: doc.ocrData.type },
            ].map(({ label, value }) => (
              <div key={label} className="bg-gray-800 rounded-lg p-3">
                <p className="text-gray-400 mb-0.5">{label}</p>
                <p className={`font-medium ${value ? 'text-white' : 'text-gray-400'}`}>
                  {value ?? '—'}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Raw OCR text */}
      {doc.ocrText && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Raw extracted text</h2>
          <pre className="text-xs text-gray-400 whitespace-pre-wrap leading-relaxed font-mono max-h-48 overflow-y-auto">
            {doc.ocrText}
          </pre>
        </section>
      )}

      {/* Failed extraction */}
      {!doc.ocrData && !doc.ocrText && doc.status === 'NEEDS_REVIEW' && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-2">Extraction failed</h2>
          <p className="text-xs text-gray-400 leading-relaxed">
            The AI was unable to extract structured data from this document. You can still approve it after manually entering the values below, or reject it if it is not needed.
          </p>
        </section>
      )}

      {/* Review form */}
      {doc.reviewStatus !== 'APPROVED' && (
        <section aria-labelledby="review-title" className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <h2 id="review-title" className="text-sm font-semibold text-white">Check and confirm</h2>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Direction">
            {(['EXPENSE', 'INCOME'] as const).map(t => (
              <button key={t} type="button" aria-pressed={txType === t} onClick={() => setTxType(t)}
                className={`py-2 min-h-11 rounded-lg text-sm border ${txType === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>
                {t === 'EXPENSE' ? 'Money out (receipt)' : 'Money in (my invoice)'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="r-amount" className="text-xs text-gray-300 block mb-1">Total amount (€, incl. VAT)</label>
              <input id="r-amount" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500" placeholder="0,00" />
            </div>
            <div>
              <label htmlFor="r-vat" className="text-xs text-gray-300 block mb-1">VAT rate</label>
              <select id="r-vat" value={vatRate} onChange={e => setVatRate(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500">
                <option value="19">19 %</option>
                <option value="7">7 %</option>
                <option value="0">0 % / none</option>
              </select>
            </div>
            <div>
              <label htmlFor="r-date" className="text-xs text-gray-300 block mb-1">Date</label>
              <input id="r-date" type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div>
            <label htmlFor="r-merchant" className="text-xs text-gray-300 block mb-1">{txType === 'EXPENSE' ? 'Shop / supplier' : 'Customer'}</label>
            <input id="r-merchant" type="text" maxLength={200} value={merchant} onChange={e => setMerchant(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label htmlFor="r-desc" className="text-xs text-gray-300 block mb-1">Description</label>
            <input id="r-desc" type="text" maxLength={500} value={description} onChange={e => setDescription(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          {txType === 'EXPENSE' && (
            <fieldset>
              <legend className="text-xs text-gray-300 mb-1">Business or private?</legend>
              <div className="grid grid-cols-3 gap-2">
                {([['BUSINESS', 'Business'], ['MIXED', 'Mixed'], ['PRIVATE', 'Private']] as const).map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={usage === v} onClick={() => setUsage(v)} className={`py-2 min-h-11 rounded-lg text-sm border ${usage === v ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-300'}`}>{l}</button>
                ))}
              </div>
              {usage === 'MIXED' && (
                <div className="mt-2">
                  <label htmlFor="r-pct" className="text-xs text-gray-300">Business share: {businessPct} %</label>
                  <input id="r-pct" type="range" min={5} max={95} step={5} value={businessPct} onChange={e => setBusinessPct(Number(e.target.value))} className="w-full accent-blue-500" />
                </div>
              )}
            </fieldset>
          )}
          <div>
            <label htmlFor="r-notes" className="text-xs text-gray-300 block mb-1">Notes (optional)</label>
            <textarea id="r-notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000} rows={2} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-base sm:text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => submit('approve')} disabled={submitting || !amount}
              className="flex-1 py-2.5 min-h-11 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-medium rounded-lg">
              {submitting ? 'Saving…' : 'Approve and book'}
            </button>
            {doc.reviewStatus !== 'REJECTED' && (
              <button type="button" onClick={() => submit('reject')} disabled={submitting}
                className="px-4 py-2.5 min-h-11 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-300 text-sm rounded-lg">
                Reject
              </button>
            )}
          </div>
        </section>
      )}

      {doc.reviewStatus === 'APPROVED' && (
        <p className="text-sm text-gray-300 bg-gray-900 border border-gray-800 rounded-xl p-4">
          Approved{doc.approvedAt ? ` on ${new Date(doc.approvedAt).toLocaleDateString('de-DE')}` : ''} and booked.{' '}
          {doc.linkedTransactionId && <Link href="/transactions" className="text-blue-300 underline">Open transactions</Link>}
        </p>
      )}

      {/* Previous corrections */}
      {doc.correctionData && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Your corrections</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(doc.correctionData).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg p-2">
                <p className="text-gray-400 capitalize">{k}</p>
                <p className="text-white font-medium">{String(v)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400 leading-relaxed pb-4">
        Approving books one transaction with the values you confirmed. The original AI reading and your corrections are kept in the history. Nothing is booked before you approve.
      </p>
    </div>
  )
}
