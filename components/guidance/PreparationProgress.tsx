interface Dimension {
  label: string
  value: number
  note?: string
}

interface Props {
  preparationScore: number
  profileCompleteness: number
  transactionCoverage: number
  uploadCount: number
  uncategorizedCount: number
  totalTransactions: number
}

function Bar({ value, color }: { value: number; color: string }) {
  return (
    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${color}`}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  )
}

function score2color(pct: number): string {
  if (pct >= 80) return 'bg-emerald-600'
  if (pct >= 50) return 'bg-blue-600'
  if (pct >= 25) return 'bg-amber-500'
  return 'bg-red-600'
}

export default function PreparationProgress({
  preparationScore,
  profileCompleteness,
  transactionCoverage,
  uploadCount,
  uncategorizedCount,
  totalTransactions,
}: Props) {
  const uploadPct = uploadCount > 0 ? Math.min(100, uploadCount * 10) : 0
  const categorizationPct =
    totalTransactions > 0
      ? Math.round(((totalTransactions - uncategorizedCount) / totalTransactions) * 100)
      : 100

  const dimensions: Dimension[] = [
    {
      label: 'Profile',
      value: profileCompleteness,
      note: profileCompleteness < 85 ? 'Incomplete' : 'Complete',
    },
    {
      label: 'Month coverage',
      value: Math.round(transactionCoverage * 100),
      note: `${Math.round(transactionCoverage * 100)}%`,
    },
    {
      label: 'Documents',
      value: uploadPct,
      note: uploadCount > 0 ? `${uploadCount} uploaded` : 'None uploaded',
    },
    {
      label: 'Categorized',
      value: categorizationPct,
      note: uncategorizedCount > 0 ? `${uncategorizedCount} pending` : 'All done',
    },
  ]

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-white">Preparation readiness</h2>
        <span className={`text-sm font-bold ${
          preparationScore >= 80 ? 'text-emerald-400'
          : preparationScore >= 50 ? 'text-blue-400'
          : preparationScore >= 25 ? 'text-amber-400'
          : 'text-red-400'
        }`}>
          {preparationScore}/100
        </span>
      </div>

      <div className="space-y-3">
        {dimensions.map(d => (
          <div key={d.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-400">{d.label}</span>
              <span className="text-xs text-gray-500">{d.note}</span>
            </div>
            <Bar value={d.value} color={score2color(d.value)} />
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-600 mt-4">
        This shows how prepared your records are — not a score to optimize. Focus on completing real tasks.
      </p>
    </div>
  )
}
