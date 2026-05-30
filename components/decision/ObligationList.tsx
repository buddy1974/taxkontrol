import type { ObligationItem } from '@/lib/decision/decisionTypes'

const TYPE_LABEL: Record<ObligationItem['type'], string> = {
  TAX: 'Tax',
  FIXED_COST: 'Fixed cost',
  PAYABLE: 'Payable',
  SALARY: 'Salary',
}

const TYPE_COLOR: Record<ObligationItem['type'], string> = {
  TAX: 'text-amber-400',
  FIXED_COST: 'text-blue-400',
  PAYABLE: 'text-red-400',
  SALARY: 'text-purple-400',
}

interface Props {
  obligations: ObligationItem[]
}

export default function ObligationList({ obligations }: Props) {
  if (obligations.length === 0) {
    return (
      <p className="text-sm text-gray-500">No upcoming obligations detected based on your records.</p>
    )
  }

  const total = obligations.reduce((sum, o) => sum + o.amount, 0)

  return (
    <div className="space-y-2">
      {obligations.map((o, i) => (
        <div key={i} className="flex items-center justify-between text-sm">
          <div className="flex-1 min-w-0">
            <span className={`text-xs font-medium mr-2 ${TYPE_COLOR[o.type]}`}>
              {TYPE_LABEL[o.type]}
            </span>
            <span className="text-gray-300 truncate">{o.label}</span>
            {o.dueDate && (
              <span className="text-gray-600 text-xs ml-2">due {o.dueDate}</span>
            )}
          </div>
          <span className="text-white font-medium ml-4 shrink-0">€{o.amount.toFixed(2)}</span>
        </div>
      ))}
      <div className="flex justify-between text-sm border-t border-gray-700 pt-2 mt-2">
        <span className="text-gray-400 font-medium">Total obligations</span>
        <span className="text-white font-bold">€{total.toFixed(2)}</span>
      </div>
    </div>
  )
}
