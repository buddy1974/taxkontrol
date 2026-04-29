interface Props {
  taxOwed: number
  taxReserved: number
  taxMissing: number
}

export default function TaxReserveBar({ taxOwed, taxReserved, taxMissing }: Props) {
  const pct = taxOwed > 0 ? Math.min(100, (taxReserved / taxOwed) * 100) : 100
  const isHealthy = taxMissing === 0

  return (
    <div className="rounded-xl p-6 bg-gray-900 border border-gray-800">
      <div className="flex justify-between items-start mb-3">
        <div>
          <p className="text-sm text-gray-400">Tax reserve</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Steuerrücklage — money saved for tax
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${
          isHealthy
            ? 'bg-emerald-900 text-emerald-400'
            : 'bg-red-900 text-red-400'
        }`}>
          {isHealthy ? 'On track' : `Missing €${taxMissing.toFixed(2)}`}
        </span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2 mb-3">
        <div
          className={`h-2 rounded-full transition-all ${
            isHealthy ? 'bg-emerald-500' : 'bg-red-500'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-xs text-gray-500">
        <span>Saved: €{taxReserved.toFixed(2)}</span>
        <span>Target: €{taxOwed.toFixed(2)}</span>
      </div>
    </div>
  )
}
