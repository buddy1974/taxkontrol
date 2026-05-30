'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  caseId: string
  currentStatus: string
}

export default function CaseResolutionButton({ caseId, currentStatus }: Props) {
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (currentStatus === 'RESOLVED') {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span className="w-2 h-2 rounded-full bg-gray-600" />
        This case has been resolved.
      </div>
    )
  }

  async function handleResolve() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/v1/guidance/cases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          caseId,
          status: 'RESOLVED',
          reason: note.trim() || 'Case marked as resolved by user.',
        }),
      })

      if (!res.ok) throw new Error('Update failed')

      setDone(true)
      setTimeout(() => router.push('/guidance'), 1500)
    } catch {
      setError('Could not mark as resolved. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="bg-emerald-950 border border-emerald-800 rounded-lg p-4">
        <p className="text-xs text-emerald-300 font-medium">Case marked as resolved.</p>
        <p className="text-xs text-emerald-400 mt-1">Returning to guidance overview...</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 rounded-lg px-4 py-2 hover:border-gray-600 transition-colors"
        >
          Mark as resolved
        </button>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 space-y-3">
          <p className="text-xs text-gray-400">
            Marking this case as resolved will archive it from the open cases list.
          </p>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Resolution note (optional)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Submitted documents to Finanzamt on 15 May..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={handleResolve}
              disabled={loading}
              className="text-xs bg-emerald-900 hover:bg-emerald-800 text-emerald-300 rounded-lg px-4 py-2 font-medium disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : 'Confirm resolution'}
            </button>
            <button
              onClick={() => { setExpanded(false); setNote('') }}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
