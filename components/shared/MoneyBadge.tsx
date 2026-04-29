interface Props {
  amount: number
  positive?: boolean
}

export default function MoneyBadge({ amount, positive }: Props) {
  const color =
    positive === undefined
      ? 'text-white'
      : positive
      ? 'text-emerald-400'
      : 'text-red-400'

  return (
    <span className={`font-semibold tabular-nums ${color}`}>
      €{amount.toFixed(2)}
    </span>
  )
}
