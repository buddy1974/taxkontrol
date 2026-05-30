'use client'

import type { DecisionResult as DecisionResultType } from '@/lib/decision/decisionTypes'
import ObligationList from './ObligationList'
import RiskSignals from './RiskSignals'

const LEVEL_CONFIG = {
  SAFE: {
    bg: 'bg-emerald-950',
    border: 'border-emerald-800',
    badge: 'bg-emerald-900 text-emerald-300',
    label: 'Appears manageable',
    icon: '✓',
    iconColor: 'text-emerald-400',
  },
  CAUTION: {
    bg: 'bg-amber-950',
    border: 'border-amber-800',
    badge: 'bg-amber-900 text-amber-300',
    label: 'Proceed with caution',
    icon: '!',
    iconColor: 'text-amber-400',
  },
  NOT_RECOMMENDED: {
    bg: 'bg-red-950',
    border: 'border-red-900',
    badge: 'bg-red-900 text-red-300',
    label: 'Not recommended',
    icon: '✗',
    iconColor: 'text-red-400',
  },
  INSUFFICIENT_DATA: {
    bg: 'bg-gray-900',
    border: 'border-gray-700',
    badge: 'bg-gray-800 text-gray-400',
    label: 'Not enough data',
    icon: '?',
    iconColor: 'text-gray-400',
  },
}

const CONFIDENCE_LABEL: Record<string, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
}

const CONFIDENCE_COLOR: Record<string, string> = {
  HIGH: 'text-emerald-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-gray-400',
}

interface Props {
  result: DecisionResultType
  onReset: () => void
}

export default function DecisionResult({ result, onReset }: Props) {
  const cfg = LEVEL_CONFIG[result.resultLevel]

  return (
    <div className="space-y-5">
      {/* Header card */}
      <div className={`rounded-xl border p-5 ${cfg.bg} ${cfg.border}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <span className={`text-2xl font-bold ${cfg.iconColor}`}>{cfg.icon}</span>
            <div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${cfg.badge}`}>
                {cfg.label}
              </span>
              <p className={`text-xs mt-1 ${CONFIDENCE_COLOR[result.confidenceLevel]}`}>
                {CONFIDENCE_LABEL[result.confidenceLevel]}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">Estimated available</p>
            <p className="text-lg font-bold text-white">€{result.safeToSpend.toFixed(2)}</p>
          </div>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">{result.summary}</p>
      </div>

      {/* What-if remaining */}
      {result.resultLevel !== 'INSUFFICIENT_DATA' && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 mb-2">If you make this decision</p>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Estimated available now</span>
            <span className="text-white font-medium">€{result.safeToSpend.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-gray-400">After this amount</span>
            <span className={`font-bold ${result.whatIfRemaining > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              €{result.whatIfRemaining.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Reasons */}
      {result.reasons.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Why</p>
          <ul className="space-y-2">
            {result.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-gray-600 mt-0.5 shrink-0">—</span>
                <span className="leading-relaxed">{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Missing data */}
      {result.missingData.length > 0 && (
        <div className="rounded-xl bg-blue-950 border border-blue-900 p-4">
          <p className="text-xs text-blue-400 font-medium uppercase tracking-wide mb-2">Missing from your records</p>
          <ul className="space-y-1.5">
            {result.missingData.map((m, i) => (
              <li key={i} className="text-sm text-blue-300 flex items-start gap-2">
                <span className="text-blue-600 mt-0.5 shrink-0">!</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Risk signals */}
      {result.riskSignals.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Risk signals</p>
          <RiskSignals signals={result.riskSignals} />
        </div>
      )}

      {/* Obligations */}
      {result.obligations.length > 0 && (
        <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-3">Upcoming obligations</p>
          <ObligationList obligations={result.obligations} />
        </div>
      )}

      {/* Next step */}
      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">Next step</p>
        <p className="text-sm text-gray-200 leading-relaxed">{result.nextStep}</p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl bg-amber-950 border border-amber-800 p-3">
        <p className="text-xs text-amber-300 leading-relaxed">{result.disclaimer}</p>
      </div>

      {/* Reset */}
      <button
        onClick={onReset}
        className="w-full py-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 text-sm transition-colors"
      >
        Check another decision
      </button>
    </div>
  )
}
