import { db } from '@/lib/db'
import {
  berlinDate,
  berlinMonthRange,
  berlinQuarterRange,
  berlinYearRange,
  quarterOf,
  type DateRange,
} from '@/lib/time/berlin'
import { computeFinancialPosition, type FinancialPosition, type ReserveRow } from './position'
import type { TransactionRow } from './summary'
import type { TaxType } from './transactionAmounts'

export type VatFilingPeriod = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

export function vatPeriodFor(now: Date, period: VatFilingPeriod): DateRange & { label: string } {
  const d = berlinDate(now)
  if (period === 'MONTHLY') {
    const r = berlinMonthRange(d.year, d.month)
    return { ...r, label: `${String(d.month).padStart(2, '0')}/${d.year}` }
  }
  if (period === 'YEARLY') return { ...berlinYearRange(d.year), label: String(d.year) }
  const q = quarterOf(d.month)
  return { ...berlinQuarterRange(d.year, q), label: `Q${q} ${d.year}` }
}

const TX_SELECT = {
  id: true,
  type: true,
  grossAmount: true,
  vatRate: true,
  usage: true,
  businessPct: true,
  transactionDate: true,
  merchant: true,
  description: true,
  needsReview: true,
  taxPaymentType: true,
  taxPeriodStart: true,
} as const

/** The VAT filing period just before the one containing `now`. */
export function previousVatPeriodFor(now: Date, period: VatFilingPeriod): DateRange & { label: string } {
  const current = vatPeriodFor(now, period)
  return vatPeriodFor(new Date(current.start.getTime() - 1), period)
}

export interface UserTaxSettings {
  taxType: TaxType
  churchTaxRate: number | null
  vatFilingPeriod: VatFilingPeriod
}

export async function loadTaxSettings(userId: string): Promise<UserTaxSettings> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { taxType: true, taxProfile: { select: { churchTax: true, churchTaxRate: true, vatFilingPeriod: true } } },
  })
  return {
    taxType: (user?.taxType ?? 'KLEINUNTERNEHMER') as TaxType,
    churchTaxRate: user?.taxProfile?.churchTax ? Number(user.taxProfile.churchTaxRate) : null,
    vatFilingPeriod: (user?.taxProfile?.vatFilingPeriod ?? 'QUARTERLY') as VatFilingPeriod,
  }
}

/** Loads everything the monthly position needs for one user and computes it. */
export async function loadFinancialPosition(userId: string, now: Date = new Date()): Promise<FinancialPosition & { settings: UserTaxSettings }> {
  const settings = await loadTaxSettings(userId)
  const today = berlinDate(now)
  const month = berlinMonthRange(today.year, today.month)
  const year = berlinYearRange(today.year)
  const priorYear = berlinYearRange(today.year - 1)
  const vatPeriod = vatPeriodFor(now, settings.vatFilingPeriod)
  const previousVatPeriod = previousVatPeriodFor(now, settings.vatFilingPeriod)

  // One query covers the prior year through the end of the current year.
  const [rows, fixedCosts, employees, payables, receivables, reserves] = await Promise.all([
    db.transaction.findMany({
      where: { userId, transactionDate: { gte: priorYear.start, lt: year.end } },
      select: TX_SELECT,
      orderBy: { transactionDate: 'asc' },
    }),
    db.fixedCost.findMany({ where: { userId, isActive: true } }),
    db.employee.findMany({
      where: { userId, isActive: true },
      include: { payments: { where: { period: { gte: month.start, lt: month.end }, isPaid: true }, select: { id: true } } },
    }),
    db.payable.findMany({ where: { userId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } } }),
    db.receivable.findMany({ where: { userId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } } }),
    db.taxReserve.findMany({ where: { userId, periodStart: { gte: priorYear.start } } }),
  ])

  const asRow = (r: (typeof rows)[number]): TransactionRow => ({
    id: r.id,
    type: r.type,
    grossAmount: r.grossAmount,
    vatRate: r.vatRate,
    usage: r.usage,
    businessPct: r.businessPct,
    transactionDate: r.transactionDate,
    merchant: r.merchant,
    description: r.description,
    needsReview: r.needsReview,
    taxPaymentType: r.taxPaymentType,
    taxPeriodStart: r.taxPeriodStart,
  })
  // Records dated in the future (e.g. an invoice entered ahead) are not money received or
  // paid yet: they are left out of every "so far" figure until their date arrives.
  const futureCount = rows.filter(r => r.transactionDate > now).length
  const inRange = (r: DateRange) => (t: (typeof rows)[number]) => t.transactionDate >= r.start && t.transactionDate < r.end && t.transactionDate <= now
  const yearRows = rows.filter(inRange(year)).map(asRow)
  const priorYearRows = rows.filter(inRange(priorYear)).map(asRow)

  // Project the income tax over the months that actually have records this year.
  const firstMonthWithData = yearRows.length > 0 ? berlinDate(yearRows[0].transactionDate).month : today.month
  const monthsElapsed = Math.max(1, today.month - firstMonthWithData + 1)

  const position = computeFinancialPosition({
    now,
    taxType: settings.taxType,
    churchTaxRate: settings.churchTaxRate,
    month: { start: month.start, end: month.end, year: today.year, month: today.month, day: today.day, monthsElapsed },
    yearStart: year.start,
    yearEnd: year.end,
    priorYearStart: priorYear.start,
    vatPeriod,
    // The previous period is only tracked when it lies inside the loaded range.
    previousVatPeriod: previousVatPeriod.start >= priorYear.start ? previousVatPeriod : null,
    previousVatPeriodRows: rows.filter(inRange(previousVatPeriod)).map(asRow),
    taxPaymentRows: rows.filter(r => r.taxPaymentType !== null && r.transactionDate <= now).map(asRow),
    monthRows: rows.filter(inRange(month)).map(asRow),
    vatPeriodRows: rows.filter(inRange(vatPeriod)).map(asRow),
    yearRows,
    priorYearRows: priorYearRows.length ? priorYearRows : null,
    fixedCosts: fixedCosts.map(f => ({
      id: f.id,
      name: f.name,
      amount: f.amount,
      frequency: f.frequency,
      dayOfMonth: f.dayOfMonth,
      usage: f.usage,
    })),
    employees: employees.map(e => ({
      id: e.id,
      name: e.name,
      salaryType: e.salaryType,
      salaryAmount: e.salaryAmount,
      paidThisMonth: e.payments.length > 0,
    })),
    payables: payables.map(p => ({
      id: p.id,
      supplierName: p.supplierName,
      outstandingAmount: p.outstandingAmount,
      dueDate: p.dueDate,
      totalAmount: p.totalAmount,
      paidAmount: p.paidAmount,
    })),
    receivables: receivables.map(r => ({ id: r.id, customerName: r.customerName, outstandingAmount: r.outstandingAmount, dueDate: r.dueDate })),
    reserves: reserves.map((r): ReserveRow => ({ type: r.type, periodStart: r.periodStart, actuallyReserved: r.actuallyReserved, settledAt: r.settledAt })),
  })

  if (futureCount > 0) {
    position.limitations.push({
      code: 'FUTURE_DATED',
      message: `${futureCount} record(s) are dated in the future. They are counted once their date has come.`,
    })
  }
  if (monthsElapsed < today.month) {
    position.limitations.push({
      code: 'SHORT_HISTORY',
      message: `Your income tax estimate is projected from ${monthsElapsed} month(s) of records this year.`,
    })
  }

  return { ...position, settings }
}
