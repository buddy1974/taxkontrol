import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { presentPosition } from '@/lib/finance/present'
import SafeToSpendCard from '@/components/dashboard/SafeToSpendCard'
import TaxReserveBar from '@/components/dashboard/TaxReserveBar'
import WarningBanner from '@/components/dashboard/WarningBanner'
import MoneyFlowSummary from '@/components/dashboard/MoneyFlowSummary'
import GermanTermTooltip from '@/components/shared/GermanTermTooltip'
import GuidanceInfoBox from '@/components/guidance/GuidanceInfoBox'
import { GLOSSARY } from '@/lib/glossary'
import { eur, germanDate } from '@/lib/format'

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export default async function DashboardPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  // The VAT status drives every calculation — ask for it before showing numbers.
  const profile = await db.taxProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!profile) redirect('/onboarding')

  const position = await loadFinancialPosition(user.id)
  const data = presentPosition(position)
  const isKlein = data.taxType === 'KLEINUNTERNEHMER'
  const hasData = data.month.transactionCount > 0

  const glossaryTerms: (keyof typeof GLOSSARY)[] = isKlein
    ? ['Kleinunternehmer', 'Steuerrücklage', 'Einkommensteuer', 'Privatentnahme', 'EÜR']
    : ['Umsatzsteuer', 'Vorsteuer', 'Steuerrücklage', 'Einkommensteuer', 'Privatentnahme', 'EÜR']

  return (
    <div className="max-w-3xl space-y-5">
      <header>
        <h1 className="text-xl md:text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">
          {MONTHS[data.period.month - 1]} {data.period.year} · {isKlein ? 'Kleinunternehmer (no VAT)' : 'Regelbesteuerung (with VAT)'}
        </p>
      </header>

      <WarningBanner warnings={data.warnings} />

      <SafeToSpendCard amount={data.leftFromThisMonth} hasData={hasData} />

      {hasData && (
        <MoneyFlowSummary
          businessIncomeGross={data.month.businessIncomeGross}
          outflowGross={data.month.outflowGross}
          privateOutflow={data.month.privateOutflow}
          monthTax={data.monthTax}
          commitmentsTotal={data.commitmentsTotal}
          leftFromThisMonth={data.leftFromThisMonth}
          nonBusinessInflow={data.month.nonBusinessInflow}
          unclear={data.month.unclearInflow + data.month.unclearOutflow}
          profit={data.month.profit}
          taxType={data.taxType}
        />
      )}

      <TaxReserveBar reserves={data.reserves} taxType={data.taxType} />

      {data.commitments.length > 0 && (
        <section aria-labelledby="commitments-title" className="rounded-xl bg-gray-900 border border-gray-800 p-5">
          <h2 id="commitments-title" className="text-sm font-medium text-white mb-3">Still to pay this month</h2>
          <ul className="space-y-2">
            {data.commitments.map(c => (
              <li key={`${c.kind}-${c.id}`} className="flex justify-between gap-3 text-sm">
                <span className="text-gray-300 min-w-0">
                  {c.label}
                  {c.note && <span className="block text-xs text-gray-400">{c.note}{c.dueDate ? ` · ${germanDate(c.dueDate)}` : ''}</span>}
                </span>
                <span className="text-orange-300 font-medium whitespace-nowrap">{eur(c.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.receivables.open > 0 || data.payables.open > 0) && (
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.receivables.open > 0 && (<Link href="/customers" className="rounded-xl bg-gray-900 border border-gray-800 p-4 block hover:border-gray-700">
            <p className="text-xs text-gray-400">Customers owe you (Offene Forderungen)</p>
            <p className="text-lg font-semibold text-emerald-400 mt-1">{eur(data.receivables.open)}</p>
            <p className="text-xs text-gray-400">Not counted until paid{data.receivables.overdueCount > 0 ? ` · ${data.receivables.overdueCount} overdue` : ''}</p>
          </Link>)}
          {data.payables.open > 0 && (<Link href="/suppliers" className="rounded-xl bg-gray-900 border border-gray-800 p-4 block hover:border-gray-700">
            <p className="text-xs text-gray-400">You owe suppliers (Verbindlichkeiten)</p>
            <p className="text-lg font-semibold text-red-400 mt-1">{eur(data.payables.open)}</p>
            <p className="text-xs text-gray-400">{data.payables.overdueCount > 0 ? `${data.payables.overdueCount} overdue` : 'None overdue'}</p>
          </Link>)}
        </section>
      )}

      <nav aria-label="Quick actions" className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <p className="text-sm font-medium text-white mb-3">Quick actions</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { href: '/input?type=INCOME', label: '+ Money in', color: 'bg-emerald-900 hover:bg-emerald-800 text-emerald-200' },
            { href: '/input?type=EXPENSE', label: '− Money out', color: 'bg-red-900 hover:bg-red-800 text-red-200' },
            { href: '/documents', label: 'Upload receipt', color: 'bg-gray-800 hover:bg-gray-700 text-gray-200' },
            { href: '/import', label: 'Import bank statement', color: 'bg-gray-800 hover:bg-gray-700 text-gray-200' },
          ].map(a => (
            <Link key={a.label} href={a.href} className={`rounded-lg px-3 py-3 min-h-11 text-sm font-medium text-center ${a.color}`}>
              {a.label}
            </Link>
          ))}
        </div>
      </nav>

      <details className="rounded-xl bg-gray-900 border border-gray-800 p-5">
        <summary className="text-sm font-medium text-white cursor-pointer">How sure are these numbers?</summary>
        <ul className="mt-3 space-y-1 text-xs text-gray-400 list-disc pl-4">
          {data.limitations.map(l => (
            <li key={l.code}>{l.message}</li>
          ))}
          <li>Income tax estimate {data.incomeTax.year}: about {eur(data.incomeTax.estimatedAnnualTax)} for the year on a projected profit of {eur(data.incomeTax.projectedAnnualProfit)} ({data.incomeTax.effectiveRate} %).</li>
          {data.incomeTax.assumptions.map(a => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </details>

      <GuidanceInfoBox
        title="What is this dashboard?"
        whatIsThis="Your business money for this month: what came in, what went out, which part belongs to the tax office, and what is still due."
        whyItMatters="As a self-employed person in Germany you pay your own taxes later. Seeing this every month avoids surprises."
        examples={[
          'Left from this month: what is really yours after taxes and bills',
          'Tax reserve: what to set aside vs. what you actually set aside',
          'Warnings: things to fix before they become problems',
        ]}
        importantNote="TaxKontrol helps you prepare and understand. It does not file taxes. For official submissions work with a Steuerberater or ELSTER."
      />

      <div className="rounded-xl bg-gray-900 border border-gray-800 p-4">
        <p className="text-xs text-gray-400 mb-3 font-medium uppercase tracking-wide">Tax terms explained</p>
        <div className="flex flex-wrap gap-3">
          {glossaryTerms.map(term => (
            <GermanTermTooltip key={term} term={term} explanation={GLOSSARY[term] ?? ''} />
          ))}
        </div>
      </div>
    </div>
  )
}
