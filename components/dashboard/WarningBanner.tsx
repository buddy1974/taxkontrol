interface Warning {
  id: string
  type: string
  severity: 'low' | 'medium' | 'high'
  message: string
}

interface Props {
  warnings: Warning[]
}

export default function WarningBanner({ warnings }: Props) {
  if (warnings.length === 0) return null

  const colorMap = {
    high: 'bg-red-950 border-red-800 text-red-300',
    medium: 'bg-amber-950 border-amber-800 text-amber-300',
    low: 'bg-blue-950 border-blue-800 text-blue-300',
  }

  return (
    <div className="space-y-2">
      {warnings.map(w => (
        <div
          key={w.id}
          className={`rounded-lg px-4 py-3 border text-sm ${colorMap[w.severity]}`}
        >
          <span className="font-medium mr-1">
            {w.severity === 'high' ? '⚠ ' : 'ℹ '}
          </span>
          {w.message}
        </div>
      ))}
    </div>
  )
}
