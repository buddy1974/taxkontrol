'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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
  const router = useRouter()

  const [doc, setDoc] = useState<DocumentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Correction form state
  const [merchant, setMerchant] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [corrected, setCorrected] = useState(false)

  useEffect(() => {
    fetch(`/api/v1/documents/${documentId}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: DocumentDetail) => {
        setDoc(data)
        // Pre-fill form with OCR or existing corrections
        const source = data.correctionData ?? data.ocrData ?? {}
        setMerchant(source.merchant ?? '')
        setAmount(source.amount !== null && source.amount !== undefined ? String(source.amount) : '')
        setDate(source.date ?? '')
        setDescription(source.description ?? '')
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

    const corrections = corrected ? {
      merchant: merchant.trim() || null,
      amount: amount ? parseFloat(amount) : null,
      date: date || null,
      description: description.trim() || null,
      notes: notes.trim() || null,
    } : null

    try {
      const res = await fetch(`/api/v1/documents/${documentId}/review`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, corrections }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      setSuccess(action === 'approve'
        ? 'Document approved. The extracted values are now marked as verified.'
        : 'Document rejected. It will stay in your list for reference.'
      )

      // Refresh document state
      const updated = await fetch(`/api/v1/documents/${documentId}`).then(r => r.json())
      setDoc(updated)
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl">
        <p className="text-gray-500 text-sm">Loading document…</p>
      </div>
    )
  }

  if (error && !doc) {
    return (
      <div className="max-w-2xl">
        <Link href="/documents" className="text-xs text-gray-500 hover:text-gray-300 mb-4 inline-block">← Back</Link>
        <div className="bg-red-950 border border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    )
  }

  if (!doc) return null

  const statusCfg = STATUS_CONFIG[doc.status] ?? { label: doc.status, cls: 'bg-gray-800 text-gray-400' }
  const isAlreadyReviewed = doc.reviewStatus === 'APPROVED' || doc.reviewStatus === 'REJECTED'
  const canReview = doc.status === 'PROCESSED' || doc.status === 'NEEDS_REVIEW'

  return (
    <div className="max-w-2xl space-y-5">
      <Link href="/documents" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300">
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
        <p className="text-xs text-gray-500 mt-1">
          Uploaded {new Date(doc.createdAt).toLocaleDateString('de-DE')}
        </p>
      </div>

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
                <p className="text-gray-500 mb-0.5">{label}</p>
                <p className={`font-medium ${value ? 'text-white' : 'text-gray-600'}`}>
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

      {/* Correction form */}
      {canReview && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Correct extracted values</h2>
            <button
              onClick={() => setCorrected(v => !v)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              {corrected ? 'Cancel corrections' : 'Make corrections'}
            </button>
          </div>

          {corrected && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">Merchant / Supplier</label>
                <input
                  type="text"
                  value={merchant}
                  onChange={e => setMerchant(e.target.value)}
                  maxLength={200}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="e.g. REWE, Deutsche Post"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Amount (€)</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={500}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  placeholder="What was this for?"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
                  placeholder="Optional notes for your records"
                />
              </div>
            </div>
          )}

          {!isAlreadyReviewed && (
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => submit('approve')}
                disabled={submitting}
                className="flex-1 py-2.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
              >
                {submitting ? 'Saving…' : 'Approve extraction'}
              </button>
              <button
                onClick={() => submit('reject')}
                disabled={submitting}
                className="px-4 py-2.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-400 text-sm rounded-lg transition-colors"
              >
                Reject
              </button>
            </div>
          )}

          {isAlreadyReviewed && (
            <p className="text-xs text-gray-500">
              This document has already been reviewed.{' '}
              {doc.reviewStatus === 'APPROVED' && doc.approvedAt && (
                <>Approved on {new Date(doc.approvedAt).toLocaleDateString('de-DE')}.</>
              )}
            </p>
          )}
        </section>
      )}

      {/* Previous corrections */}
      {doc.correctionData && (
        <section className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-3">Your corrections</h2>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {Object.entries(doc.correctionData).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => (
              <div key={k} className="bg-gray-800 rounded-lg p-2">
                <p className="text-gray-500 capitalize">{k}</p>
                <p className="text-white font-medium">{String(v)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <p className="text-xs text-gray-600 leading-relaxed pb-4">
        Reviewing and approving a document records your confirmation that the extracted values are correct. This does not automatically create a transaction — you can do that from the Transactions page.
      </p>
    </div>
  )
}
