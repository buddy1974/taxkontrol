import { eur, eurSigned } from '@/lib/format'

interface Props {
  businessIncomeGross: number
  outflowGross: number
  privateOutflow: number
  monthTax: { vat: number; incomeTax: number; total: number }
  commitmentsTotal: number
  leftFromThisMonth: number
  nonBusinessInflow: number
  unclear: number
  profit: number
  taxType: string
}

export default function MoneyFlowSummary(p: Props) {
  const isKlein = p.taxType === 'KLEINUNTERNEHMER'
  const rows = [
    { label: 'Business money in', sub: isKlein ? 'Einnahmen' : 'Einnahmen incl. VAT', amount: p.businessIncomeGross, sign: '+' as const, color: 'text-emerald-400' },
    {
      label: 'Money out',
      sub: p.privateOutflow > 0 ? `Ausgaben — of which private: ${eur(p.privateOutflow)}` : 'Ausgaben',
      amount: p.outflowGross,
      sign: '-' as const,
      color: 'text-red-400',
    },
    {
      label: 'Taxes from this month (estimate)',
      sub: isKlein ? 'Einkommensteuer' : `VAT ${eur(p.monthTax.vat)} + income tax ${eur(p.monthTax.incomeTax)}`,
      amount: p.monthTax.total,
      sign: '-' as const,
      color: 'text-yellow-400',
    },
    { label: 'Still to pay this month', sub: 'Fixkosten, salaries, supplier bills', amount: p.commitmentsTotal, sign: '-' as const, color: 'text-orange-400' },
  ]

  return (
    <section aria-labelledby="flow-title" className="rounded-xl bg-gray-900 border border-gray-800">
      <h2 id="flow-title" className="px-5 pt-4 text-sm font-medium text-white">This month step by step</h2>
      <ul className="divide-y divide-gray-800">
        {rows.map(r => (
          <li key={r.label} className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm text-white">{r.label}</p>
              <p className="text-xs text-gray-500">{r.sub}</p>
            </div>
            <p className={`text-base font-semibold whitespace-nowrap ${r.color}`}>{eurSigned(r.amount, r.sign)}</p>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 px-5 py-3 bg-gray-950/40">
          <p className="text-sm font-semibold text-white">= Left from this month</p>
          <p className={`text-base font-bold whitespace-nowrap ${p.leftFromThisMonth >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {p.leftFromThisMonth < 0 ? `−${eur(-p.leftFromThisMonth)}` : eur(p.leftFromThisMonth)}
          </p>
        </li>
      </ul>
      <div className="px-5 py-3 border-t border-gray-800 text-xs text-gray-400 space-y-1">
        <p>Profit this month (Gewinn, estimate): <span className="text-gray-200">{eur(p.profit)}</span></p>
        {p.nonBusinessInflow > 0 && <p>Not counted — private deposits / loans: {eur(p.nonBusinessInflow)}</p>}
        {p.unclear > 0 && <p className="text-amber-300">Not counted — marked “not sure”: {eur(p.unclear)}. Please classify these.</p>}
      </div>
    </section>
  )
}
