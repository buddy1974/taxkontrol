import type { RiskSignal } from '@/lib/decision/decisionTypes'

const SEVERITY_STYLE: Record<RiskSignal['severity'], string> = {
  HIGH: 'bg-red-900 text-red-300 border-red-800',
  MEDIUM: 'bg-amber-900 text-amber-300 border-amber-800',
  LOW: 'bg-gray-800 text-gray-400 border-gray-700',
}

const SEVERITY_DOT: Record<RiskSignal['severity'], string> = {
  HIGH: 'bg-red-400',
  MEDIUM: 'bg-amber-400',
  LOW: 'bg-gray-500',
}

interface Props {
  signals: RiskSignal[]
}

export default function RiskSignals({ signals }: Props) {
  if (signals.length === 0) {
    return (
      <p className="text-sm text-gray-500">No risk signals detected based on your current records.</p>
    )
  }

  return (
    <div className="space-y-2">
      {signals.map((s, i) => (
        <div key={i} className={`rounded-lg border p-3 ${SEVERITY_STYLE[s.severity]}`}>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${SEVERITY_DOT[s.severity]}`} />
            <span className="text-sm font-medium">{s.label}</span>
          </div>
          <p className="text-xs opacity-80 leading-relaxed pl-4">{s.description}</p>
        </div>
      ))}
    </div>
  )
}
