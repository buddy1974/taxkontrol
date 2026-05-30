'use client'

import { useState } from 'react'

interface Props {
  title: string
  whatIsThis: string
  whyItMatters: string
  examples: string[]
  importantNote?: string
  defaultOpen?: boolean
}

export default function GuidanceInfoBox({
  title,
  whatIsThis,
  whyItMatters,
  examples,
  importantNote,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="rounded-xl border border-blue-900 bg-blue-950/40 overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-blue-950/60 transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-blue-400 text-base font-semibold select-none">ⓘ</span>
          <span className="text-sm text-blue-300 font-medium">{title}</span>
        </div>
        <span className="text-blue-500 text-xs">{open ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-blue-900">
          <div className="pt-3">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">What is this?</p>
            <p className="text-sm text-gray-300 leading-relaxed">{whatIsThis}</p>
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Examples</p>
            <ul className="space-y-1">
              {examples.map((ex, i) => (
                <li key={i} className="text-sm text-gray-400 flex items-start gap-2">
                  <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                  <span>{ex}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-wide mb-1">Why does it matter?</p>
            <p className="text-sm text-gray-300 leading-relaxed">{whyItMatters}</p>
          </div>

          {importantNote && (
            <div className="rounded-lg bg-amber-950/60 border border-amber-800 px-3 py-2">
              <p className="text-xs text-amber-300 leading-relaxed">{importantNote}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
