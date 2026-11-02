import { db } from '@/lib/db'
import { berlinDate, berlinMonthRange, formatBerlinMonth, toBerlinIsoDate } from '@/lib/time/berlin'
import { summarizeTransactions } from './summary'
import { computeTransactionAmounts, type TaxType } from './transactionAmounts'
import { fromCents, formatEuro } from './money'
import { TaxStatusTimeline } from './taxStatus'
import { vatPayableForRange } from './position'
import { toInvoiceRows } from './loadPosition'

/** Parses "YYYY-MM"; falls back to the current Berlin month. */
export function parseReportMonth(value: string | null, now = new Date()): { year: number; month: number } {
  const m = value ? /^(\d{4})-(\d{2})$/.exec(value) : null
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month }
  }
  const d = berlinDate(now)
  return { year: d.year, month: d.month }
}

export async function buildMonthlyReport(userId: string, period: { year: number; month: number }) {
  const range = berlinMonthRange(period.year, period.month)
  const [user, rows] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { taxType: true, businessName: true, name: true } }),
    db.transaction.findMany({
      where: { userId, transactionDate: { gte: range.start, lt: range.end } },
      include: { category: true },
      orderBy: { transactionDate: 'asc' },
    }),
  ])
  // The status valid in that month, not today's (a later switch must not rewrite old reports).
  const history = await db.taxStatusPeriod.findMany({ where: { userId }, orderBy: { validFrom: 'asc' } })
  const timeline = new TaxStatusTimeline(
    history.map(h => ({ ...h, taxType: h.taxType as TaxType })),
    { taxType: (user?.taxType ?? 'KLEINUNTERNEHMER') as TaxType, vatMethod: 'SOLL', vatFilingPeriod: 'QUARTERLY', dauerfristverlaengerung: false }
  )
  const taxType = timeline.taxTypeAt(range.start)
  // Same VAT logic as the Tax page (NF-10): under Soll the invoices issued this month count, a
  // linked invoice payment is not taxed again; payments keep the invoice date's status.
  const receivables = await db.receivable.findMany({
    where: { userId },
    include: { transactions: { select: { grossAmount: true, transactionDate: true, type: true } } },
  })
  const invoices = toInvoiceRows(receivables)
  const invoiceDateById = new Map(invoices.map(i => [i.id, i.invoiceDate]))
  const financeRows = rows.map(r => ({ ...r, statusDate: r.receivableId ? (invoiceDateById.get(r.receivableId) ?? null) : null }))
  const cash = summarizeTransactions(financeRows, timeline)
  const vat = vatPayableForRange({ rows: financeRows, invoices, timeline, start: range.start, end: range.end })
  const totals = { ...cash, vatPayableCents: vat.vatPayableCents }
  const sollInvoiceIds = new Set(invoices.filter(i => { const st = timeline.statusAt(i.invoiceDate); return st.taxType !== 'KLEINUNTERNEHMER' && st.vatMethod === 'SOLL' }).map(i => i.id))

  const lines = rows.map(r => {
    const a = computeTransactionAmounts(
      { type: r.type, grossAmount: r.grossAmount, vatRate: r.vatRate, usage: r.usage, businessPct: r.businessPct, taxType: timeline.taxTypeAt(r.transactionDate) },
      false
    )
    const isTax = r.taxPaymentType !== null
    return {
      id: r.id,
      date: toBerlinIsoDate(r.transactionDate),
      type: r.type,
      usage: a.usage,
      taxPaymentType: r.taxPaymentType,
      text: r.description ?? r.merchant ?? (r.type === 'INCOME' ? 'Income' : 'Expense'),
      category: r.category?.name ?? 'Uncategorised',
      grossCents: a.grossCents,
      // Payments to / refunds from the Finanzamt are neither business income/expense nor private.
      businessCents: isTax ? 0 : a.businessCents,
      // A payment of a Soll invoice carries no VAT of its own: it was due with the invoice
      // (a prepayment before the invoice day keeps its VAT, §13 Abs. 1 Nr. 1a S. 4 UStG).
      vatCents: isTax || (r.receivableId && sollInvoiceIds.has(r.receivableId) && toBerlinIsoDate(r.transactionDate) >= toBerlinIsoDate(invoiceDateById.get(r.receivableId)!)) ? 0 : r.type === 'INCOME' ? a.outputVatCents : a.deductibleVatCents,
      privateCents: isTax ? 0 : a.privateCents,
      unclearCents: isTax ? 0 : a.unclearCents,
    }
  })

  const categories = new Map<string, { name: string; type: string; totalCents: number }>()
  for (const l of lines) {
    if (l.businessCents === 0) continue
    const key = `${l.type}-${l.category}`
    const c = categories.get(key) ?? { name: l.category, type: l.type, totalCents: 0 }
    c.totalCents += l.businessCents
    categories.set(key, c)
  }

  return {
    taxType,
    businessName: user?.businessName ?? user?.name ?? 'Business',
    period,
    monthLabel: formatBerlinMonth(range.start),
    totals,
    lines,
    categories: [...categories.values()].sort((a, b) => b.totalCents - a.totalCents),
  }
}

export type MonthlyReport = Awaited<ReturnType<typeof buildMonthlyReport>>

export function presentReport(r: MonthlyReport) {
  const t = r.totals
  const isKlein = r.taxType === 'KLEINUNTERNEHMER'
  return {
    taxType: r.taxType,
    month: r.monthLabel,
    period: r.period,
    isEstimate: true,
    totalIncome: fromCents(t.businessIncomeNetCents),
    totalExpenses: fromCents(t.deductibleExpenseCents),
    netProfit: fromCents(t.profitCents),
    vatCollected: isKlein ? 0 : fromCents(t.outputVatCents),
    vatPaid: isKlein ? 0 : fromCents(t.inputVatCents),
    vatOwed: isKlein ? 0 : fromCents(t.vatPayableCents),
    privateWithdrawals: fromCents(t.privateOutflowCents),
    vatPaidToFinanzamt: fromCents(t.vatPaidToFinanzamtCents),
    incomeTaxPaid: fromCents(t.incomeTaxPaidCents),
    nonBusinessInflow: fromCents(t.nonBusinessInflowCents),
    unclear: fromCents(t.unclearInflowCents + t.unclearOutflowCents),
    needsReviewCount: t.needsReviewCount,
    categories: r.categories.map(c => ({ name: c.name, type: c.type, total: fromCents(c.totalCents) })),
  }
}

/** Plain-text export of the month (for the Steuerberater). */
export function reportAsText(r: MonthlyReport, generatedAt = new Date()): string {
  const t = r.totals
  const isKlein = r.taxType === 'KLEINUNTERNEHMER'
  const row = (date: string, text: string, cents: number) => `  ${date}  ${text.slice(0, 40).padEnd(40)}  ${formatEuro(cents).padStart(14)}`
  const income = r.lines.filter(l => l.type === 'INCOME' && l.usage === 'BUSINESS' && !l.taxPaymentType)
  const taxLines = r.lines.filter(l => l.taxPaymentType)
  const expenses = r.lines.filter(l => l.type === 'EXPENSE' && l.businessCents > 0)
  const unclear = r.lines.filter(l => l.unclearCents > 0)

  const out: string[] = [
    'TaxKontrol — Monatsübersicht (Vorbereitung, keine Steuererklärung)',
    r.businessName,
    `Zeitraum: ${r.monthLabel}`,
    `Erstellt: ${generatedAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}`,
    `Umsatzsteuer-Status: ${isKlein ? 'Kleinunternehmer (§ 19 UStG) — Beträge brutto, kein Vorsteuerabzug' : 'Regelbesteuerung — Beträge netto'}`,
    '',
    'BETRIEBSEINNAHMEN',
    ...income.map(l => row(l.date, l.text, l.businessCents)),
    `  ${'Summe Einnahmen'.padEnd(52)}  ${formatEuro(t.businessIncomeNetCents).padStart(14)}`,
    '',
    'BETRIEBSAUSGABEN (nur betrieblicher Anteil)',
    ...expenses.map(l => row(l.date, l.text, l.businessCents)),
    `  ${'Summe Ausgaben'.padEnd(52)}  ${formatEuro(t.deductibleExpenseCents).padStart(14)}`,
    '',
    `ÜBERSCHUSS (geschätzt): ${formatEuro(t.profitCents)}`,
    '',
  ]
  if (!isKlein) {
    out.push(
      'UMSATZSTEUER',
      `  Umsatzsteuer auf Einnahmen:  ${formatEuro(t.outputVatCents)}`,
      `  Abziehbare Vorsteuer:        ${formatEuro(t.inputVatCents)}`,
      `  Zahllast (geschätzt):        ${formatEuro(t.vatPayableCents)}`,
      ''
    )
  }
  if (taxLines.length > 0) {
    out.push(
      'ZAHLUNGEN AN DAS / ERSTATTUNGEN VOM FINANZAMT (nicht in den Summen oben)',
      ...taxLines.map(l => row(l.date, l.text, l.type === 'EXPENSE' ? l.grossCents : -l.grossCents)),
      ''
    )
  }
  out.push(
    'NICHT BETRIEBLICH',
    `  Private Anteile / Privatentnahmen: ${formatEuro(t.privateOutflowCents)}`,
    `  Private Einlagen, Darlehen u. ä.:  ${formatEuro(t.nonBusinessInflowCents)}`,
    ''
  )
  if (unclear.length > 0) {
    out.push('NOCH ZU KLÄREN (nicht in den Summen enthalten)', ...unclear.map(l => row(l.date, l.text, l.unclearCents)), '')
  }
  out.push(
    'HINWEIS',
    'Diese Übersicht ist eine Schätzung auf Basis Ihrer Eingaben. Sie ersetzt keine',
    'Steuerberatung und wird nicht an das Finanzamt übermittelt. Bitte vor der Abgabe',
    'von Erklärungen mit Ihrer Steuerberatung prüfen.'
  )
  return out.join('\n')
}
