'use client'

import { useState, useRef } from 'react'
import type { GuidanceAnalysisResponse } from '@/lib/guidance/guidanceTypes'

type UploadState = 'idle' | 'uploading' | 'done' | 'error'

type FullAnalysisResponse = GuidanceAnalysisResponse & {
  detectedLetterType?: string
  caseId?: string
  extractedDeadline?: string
  previousOpenCases?: Array<{ title: string; status: string; openedAt: string }>
}

const URGENCY_LABELS: Record<string, string> = {
  IMMEDIATE: 'Respond immediately',
  WITHIN_WEEK: 'Respond within a week',
  WITHIN_MONTH: 'Respond within a month',
  INFORMATIONAL: 'For your information',
}

const URGENCY_COLORS: Record<string, string> = {
  IMMEDIATE: 'bg-red-900 text-red-300 border-red-700',
  WITHIN_WEEK: 'bg-orange-900 text-orange-300 border-orange-700',
  WITHIN_MONTH: 'bg-amber-900 text-amber-300 border-amber-700',
  INFORMATIONAL: 'bg-gray-800 text-gray-300 border-gray-700',
}

const CONFIDENCE_COLORS: Record<string, string> = {
  HIGH: 'bg-emerald-600',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-red-600',
}

const PRIORITY_LABELS: Record<string, string> = {
  HIGH: 'Priority',
  MEDIUM: 'Recommended',
  LOW: 'Optional',
}

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: 'text-red-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-gray-500',
}

export default function LetterUploader() {
  const [uploadState, setUploadState] = useState<UploadState>('idle')
  const [result, setResult] = useState<FullAnalysisResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploadState('uploading')
    setResult(null)
    setErrorMsg('')

    const form = new FormData()
    form.append('file', file)
    if (note.trim()) form.append('note', note.trim())

    try {
      const res = await fetch('/api/v1/guidance/analyze-letter', {
        method: 'POST',
        body: form,
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(err.error ?? 'Analysis failed')
      }

      const data: FullAnalysisResponse = await res.json()
      setResult(data)
      setUploadState('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Something went wrong. Please try again.')
      setUploadState('error')
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      {uploadState !== 'done' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Optional note (describe what you think the letter is about)
            </label>
            <textarea
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              placeholder="e.g. Looks like a document request for 2024..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-gray-500"
            />
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={e => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              uploadState === 'uploading'
                ? 'border-blue-700 bg-blue-950'
                : uploadState === 'error'
                ? 'border-red-700 bg-red-950'
                : 'border-gray-700 hover:border-gray-600 bg-gray-900'
            }`}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
              }}
            />

            {uploadState === 'uploading' ? (
              <div className="space-y-1">
                <p className="text-sm text-blue-300">Reading and analyzing your letter...</p>
                <p className="text-xs text-gray-500">This usually takes 10–20 seconds</p>
              </div>
            ) : uploadState === 'error' ? (
              <div className="space-y-2 text-left">
                <p className="text-sm text-red-400 font-medium">Analysis could not be completed</p>
                <p className="text-xs text-gray-400">{errorMsg}</p>
                <p className="text-xs text-gray-500">
                  You can try uploading again. If the problem continues, enter a description of
                  the letter in the note field above and upload any supported image or PDF.
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-gray-400">Drop your Finanzamt letter here, or tap to choose a file</p>
                <p className="text-xs text-gray-600">JPG, PNG, PDF — max 10 MB</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Reset */}
      {uploadState === 'done' && (
        <button
          onClick={() => { setUploadState('idle'); setResult(null); setNote('') }}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Analyze a different letter
        </button>
      )}

      {/* Analysis result */}
      {result && <LetterAnalysisResult result={result} />}
    </div>
  )
}

function LetterAnalysisResult({ result }: { result: FullAnalysisResponse }) {
  return (
    <div className="space-y-5">
      {/* Case saved confirmation */}
      {result.caseId && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
          <p className="text-xs text-gray-300">
            Case saved and tracked. It will appear in your open cases list above.
          </p>
        </div>
      )}

      {/* Deadline alert */}
      {result.extractedDeadline && (
        <div className="bg-amber-950 border border-amber-700 rounded-lg p-3">
          <p className="text-xs font-semibold text-amber-300 mb-0.5">Deadline detected</p>
          <p className="text-xs text-amber-200">
            A deadline was found in this letter: <strong>{result.extractedDeadline}</strong>.
            Make sure to take action before this date.
          </p>
        </div>
      )}

      {/* Previous case memory */}
      {result.previousOpenCases && result.previousOpenCases.length > 0 && (
        <div className="bg-blue-950 border border-blue-800 rounded-lg p-3">
          <p className="text-xs font-semibold text-blue-300 mb-1">Continuity note</p>
          <p className="text-xs text-blue-200 leading-relaxed">
            You have {result.previousOpenCases.length} open case(s) from previous letters:{' '}
            {result.previousOpenCases.map(c => c.title).join(' · ')}.
            Review whether this new letter is related to any of them.
          </p>
        </div>
      )}

      {/* Urgency badge + summary */}
      <div className="space-y-3">
        <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${URGENCY_COLORS[result.urgency] ?? URGENCY_COLORS.INFORMATIONAL}`}>
          {URGENCY_LABELS[result.urgency] ?? result.urgency}
        </div>
        <p className="text-sm text-white leading-relaxed">{result.interpretedMeaning}</p>
      </div>

      {/* Escalation warning */}
      {result.escalationRecommended && result.escalationReason && (
        <div className="bg-red-950 border border-red-800 rounded-lg p-4">
          <p className="text-xs font-semibold text-red-300 mb-1">Professional review recommended</p>
          <p className="text-xs text-red-200 leading-relaxed">{result.escalationReason}</p>
        </div>
      )}

      {/* Confidence */}
      <div className="bg-gray-800 rounded-lg p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400 font-medium">Record confidence</span>
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${CONFIDENCE_COLORS[result.confidence.level]}`} />
            <span className="text-xs text-gray-300">{result.confidence.level} ({result.confidence.score}/100)</span>
          </div>
        </div>
        {result.confidence.reasons.length > 0 && (
          <ul className="space-y-1">
            {result.confidence.reasons.map((r, i) => (
              <li key={i} className="text-xs text-gray-500 flex items-start gap-1.5">
                <span className="text-gray-600 mt-0.5">•</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Requested documents (from letter) */}
      {result.missingData.filter(d => d.type !== 'NO_FIXED_COSTS').length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs font-semibold text-white mb-2">Missing from your records</p>
          <ul className="space-y-1.5">
            {result.missingData.filter(d => d.type !== 'NO_FIXED_COSTS').map((item, i) => (
              <li key={i} className={`text-xs flex items-start gap-2 ${
                item.severity === 'blocking' ? 'text-red-300' : 'text-amber-300'
              }`}>
                <span className="mt-0.5">{item.severity === 'blocking' ? '✗' : '!'}</span>
                <span>{item.description}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested actions */}
      {result.suggestedActions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
          <p className="text-xs font-semibold text-white mb-3">Suggested next steps</p>
          <ul className="space-y-3">
            {result.suggestedActions.map((action, i) => (
              <li key={i} className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${PRIORITY_COLORS[action.priority]}`}>
                    {PRIORITY_LABELS[action.priority]}
                  </span>
                  <span className="text-xs text-white">{action.title}</span>
                </div>
                <p className="text-xs text-gray-400 leading-relaxed pl-0">{action.explanation}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Educational notice */}
      <div className="bg-gray-800 rounded-lg p-4">
        <p className="text-xs font-semibold text-gray-400 mb-1">Good to know</p>
        <p className="text-xs text-gray-400 leading-relaxed">{result.educationalNotice}</p>
      </div>

      {/* Preparation score */}
      <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-400 font-medium">Preparation score</span>
          <span className="text-xs text-gray-300">
            {result.preparationStatus.score}/100 — {result.preparationStatus.status}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              result.preparationStatus.score >= 80 ? 'bg-emerald-600'
              : result.preparationStatus.score >= 50 ? 'bg-amber-500'
              : 'bg-red-600'
            }`}
            style={{ width: `${result.preparationStatus.score}%` }}
          />
        </div>
        {result.preparationStatus.estimatedPreparationSavingsHours > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            Estimated time you could save a Steuerberater:{' '}
            {result.preparationStatus.estimatedPreparationSavingsHours} hour(s) by completing your records.
          </p>
        )}
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-gray-600 leading-relaxed">{result.disclaimer}</p>
    </div>
  )
}
