'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

type Document = {
  id: string
  fileName: string
  mimeType: string
  type: string
  status: string
  reviewStatus: string | null
  approvedAt: string | null
  linkedTransactionId: string | null
  createdAt: string
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  PENDING:      { label: 'Processing', cls: 'bg-gray-800 text-gray-400' },
  PROCESSED:    { label: 'Processed', cls: 'bg-blue-900 text-blue-300' },
  NEEDS_REVIEW: { label: 'Needs review', cls: 'bg-amber-900 text-amber-300' },
  DONE:         { label: 'Done', cls: 'bg-emerald-900 text-emerald-300' },
}

const REVIEW_CONFIG: Record<string, { label: string; cls: string }> = {
  APPROVED:     { label: 'Approved', cls: 'bg-emerald-900 text-emerald-300' },
  REJECTED:     { label: 'Rejected', cls: 'bg-red-900 text-red-300' },
  PENDING_REVIEW: { label: 'Pending review', cls: 'bg-amber-900 text-amber-300' },
}

const DOC_TYPE_LABEL: Record<string, string> = {
  RECEIPT: 'Receipt',
  INVOICE: 'Invoice',
  BANK_STATEMENT: 'Bank statement',
  OTHER: 'Other',
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'NEEDS_REVIEW' | 'APPROVED'>('ALL')

  useEffect(() => {
    setLoading(true)
    fetch('/api/v1/documents')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        setDocs(data)
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  const filtered = docs.filter(d => {
    if (filter === 'NEEDS_REVIEW') return d.status === 'NEEDS_REVIEW' || d.status === 'PROCESSED'
    if (filter === 'APPROVED') return d.reviewStatus === 'APPROVED'
    return true
  })

  const needsReviewCount = docs.filter(d => d.status === 'NEEDS_REVIEW' || (d.status === 'PROCESSED' && !d.reviewStatus)).length

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Documents</h1>
          <p className="text-gray-500 text-sm mt-1">Review OCR results before using them</p>
        </div>
        <Link
          href="/input"
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Upload document
        </Link>
      </div>

      {/* AI safety notice */}
      <div className="bg-amber-950 border border-amber-800 rounded-xl p-4 mb-6">
        <p className="text-xs text-amber-300 font-semibold mb-1">Review before using</p>
        <p className="text-xs text-amber-400 leading-relaxed">
          AI can make mistakes when reading receipts and invoices. Please review extracted values before relying on them for your records. Approved documents are marked as verified by you.
        </p>
      </div>

      {/* Summary */}
      {needsReviewCount > 0 && (
        <div className="bg-blue-950 border border-blue-800 rounded-xl p-4 mb-4">
          <p className="text-xs text-blue-300">
            <span className="font-semibold">{needsReviewCount} document(s)</span> are waiting for your review.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-4">
        {(['ALL', 'NEEDS_REVIEW', 'APPROVED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-gray-700 text-white'
                : 'text-gray-500 hover:text-white'
            }`}
          >
            {f === 'ALL' ? 'All' : f === 'NEEDS_REVIEW' ? 'Needs review' : 'Approved'}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-950 border border-red-800 rounded-xl p-4 mb-4">
          <p className="text-sm text-red-400">Could not load documents. Please refresh or sign in again.</p>
        </div>
      )}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">
            {filter === 'ALL' ? 'No documents uploaded yet.' : 'No documents match this filter.'}
          </p>
          {filter === 'ALL' && (
            <Link href="/input" className="text-blue-400 text-sm mt-2 inline-block hover:text-blue-300">
              Upload your first document
            </Link>
          )}
        </div>
      ) : (
        <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
          {filtered.map(doc => {
            const statusCfg = STATUS_CONFIG[doc.status] ?? { label: doc.status, cls: 'bg-gray-800 text-gray-400' }
            const reviewCfg = doc.reviewStatus ? (REVIEW_CONFIG[doc.reviewStatus] ?? null) : null
            const needsAction = (doc.status === 'NEEDS_REVIEW' || doc.status === 'PROCESSED') && !doc.reviewStatus

            return (
              <Link
                key={doc.id}
                href={`/documents/${doc.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-gray-800 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusCfg.cls}`}>
                      {statusCfg.label}
                    </span>
                    {reviewCfg && (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${reviewCfg.cls}`}>
                        {reviewCfg.label}
                      </span>
                    )}
                    {needsAction && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-900 text-amber-300 font-medium">
                        Review needed
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-white truncate">{doc.fileName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {DOC_TYPE_LABEL[doc.type] ?? doc.type} ·{' '}
                    {new Date(doc.createdAt).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <span className="text-gray-600 text-xs ml-4">Review →</span>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
