interface Props {
  totalIncome: number
  totalExpenses: number
  totalFixedCosts: number
  taxOwed: number
}

export default function MoneyFlowSummary({
  totalIncome,
  totalExpenses,
  totalFixedCosts,
  taxOwed,
}: Props) {
  const rows = [
    {
      label: 'Money in',
      sublabel: 'Income this month (Einnahmen)',
      amount: totalIncome,
      color: 'text-emerald-400',
      sign: '+',
    },
    {
      label: 'Money out',
      sublabel: 'Business expenses (Ausgaben)',
      amount: totalExpenses,
      color: 'text-red-400',
      sign: '-',
    },
    {
      label: 'Fixed costs',
      sublabel: 'Recurring monthly costs (Fixkosten)',
      amount: totalFixedCosts,
      color: 'text-orange-400',
      sign: '-',
    },
    {
      label: 'Tax reserve',
      sublabel: 'Set aside for Finanzamt (Steuer)',
      amount: taxOwed,
      color: 'text-yellow-400',
      sign: '-',
    },
  ]

  return (
    <div className="rounded-xl bg-gray-900 border border-gray-800 divide-y divide-gray-800">
      {rows.map(row => (
        <div key={row.label} className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm text-white font-medium">{row.label}</p>
            <p className="text-xs text-gray-500 mt-0.5">{row.sublabel}</p>
          </div>
          <p className={`text-lg font-semibold ${row.color}`}>
            {row.sign}€{row.amount.toFixed(2)}
          </p>
        </div>
      ))}
    </div>
  )
}
