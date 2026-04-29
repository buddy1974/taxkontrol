interface Props {
  amount: number
}

export default function SafeToSpendCard({ amount }: Props) {
  const isHealthy = amount > 0

  return (
    <div className={`rounded-xl p-6 border ${
      isHealthy
        ? 'bg-emerald-950 border-emerald-800'
        : 'bg-red-950 border-red-800'
    }`}>
      <p className="text-sm text-gray-400 mb-1">Safe to spend</p>
      <p className={`text-4xl font-bold ${
        isHealthy ? 'text-emerald-400' : 'text-red-400'
      }`}>
        €{amount.toFixed(2)}
      </p>
      <p className="text-xs text-gray-500 mt-2">
        After tax reserve, fixed costs and expenses
      </p>
    </div>
  )
}
