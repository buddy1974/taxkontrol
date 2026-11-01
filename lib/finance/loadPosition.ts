import { db } from '@/lib/db'
import type { Prisma } from '@prisma/client'
import { berlinDate, berlinMonthRange, berlinYearRange, type DateRange } from '@/lib/time/berlin'
import { computeFinancialPosition, type FinancialPosition, type InvoiceRow, type ReserveRow } from './position'
import type { TransactionRow } from './summary'
import type { TaxType } from './transactionAmounts'
import { toCents } from './money'
import { TaxStatusTimeline, type TaxStatus, type VatFilingPeriod } from './taxStatus'
import { listTaxPeriods, trackingStartFor, vatPeriodFor, previousVatPeriodFor } from './periods'

export { vatPeriodFor, previousVatPeriodFor }
export type { VatFilingPeriod }

type Client = Prisma.TransactionClient | typeof db

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
  receivableId: true,
} as const

export interface UserTaxSettings extends TaxStatus {
  churchTaxRate: number | null
}

/**
 * The user's tax status history. Users without history rows (created before the history
 * existed and not migrated, or test fixtures) get their current settings "since always".
 */
export async function loadTaxStatusTimeline(userId: string, client: Client = db): Promise<TaxStatusTimeline> {
  const [rows, user] = await Promise.all([
    client.taxStatusPeriod.findMany({ where: { userId }, orderBy: { validFrom: 'asc' } }),
    client.user.findUnique({ where: { id: userId }, select: { taxType: true, taxProfile: { select: { vatFilingPeriod: true } } } }),
  ])
  return new TaxStatusTimeline(
    rows.map(r => ({
      validFrom: r.validFrom,
      taxType: r.taxType as TaxType,
      vatMethod: r.vatMethod,
      vatFilingPeriod: r.vatFilingPeriod,
      dauerfristverlaengerung: r.dauerfristverlaengerung,
    })),
    {
      taxType: (user?.taxType ?? 'KLEINUNTERNEHMER') as TaxType,
      vatMethod: 'SOLL',
      vatFilingPeriod: (user?.taxProfile?.vatFilingPeriod ?? 'QUARTERLY') as VatFilingPeriod,
      dauerfristverlaengerung: false,
    }
  )
}

/** Current status (valid today) plus church tax. */
export async function loadTaxSettings(userId: string, now: Date = new Date()): Promise<UserTaxSettings & { timeline: TaxStatusTimeline }> {
  const [timeline, profile] = await Promise.all([
    loadTaxStatusTimeline(userId),
    db.taxProfile.findUnique({ where: { userId }, select: { churchTax: true, churchTaxRate: true } }),
  ])
  return {
    ...timeline.statusAt(now),
    churchTaxRate: profile?.churchTax ? Number(profile.churchTaxRate) : null,
    timeline,
  }
}

/**
 * Months of the year covered by records, counting the current month only as far as it has
 * gone (2 March = 2.06 months, not 3): counting it as complete under-projects the year.
 * At least 1, so a single early invoice is not extrapolated from a few days.
 */
export function monthsElapsedForProjection(today: { month: number; day: number; year: number }, firstMonthWithData: number): number {
  const daysInMonth = new Date(Date.UTC(today.year, today.month, 0)).getUTCDate()
  return Math.max(1, today.month - firstMonthWithData + today.day / daysInMonth)
}

/** Loads everything the monthly position needs for one user and computes it. */
export async function loadFinancialPosition(userId: string, now: Date = new Date()): Promise<FinancialPosition & { settings: UserTaxSettings; trackingStart: Date }> {
  const { timeline, ...settings } = await loadTaxSettings(userId, now)
  const today = berlinDate(now)
  const month = berlinMonthRange(today.year, today.month)
  const year = berlinYearRange(today.year)
  const priorYear = berlinYearRange(today.year - 1)
  const trackingStart = trackingStartFor(now)
  const vatPeriod = vatPeriodFor(now, settings.vatFilingPeriod)
  const periods = listTaxPeriods(timeline, now, trackingStart)

  const [rows, fixedCosts, employees, payables, receivables, reserves, olderRows] = await Promise.all([
    db.transaction.findMany({
      where: { userId, transactionDate: { gte: trackingStart, lt: year.end } },
      select: TX_SELECT,
      orderBy: { transactionDate: 'asc' },
    }),
    db.fixedCost.findMany({ where: { userId, isActive: true } }),
    db.employee.findMany({
      where: { userId, isActive: true },
      include: { payments: { where: { period: { gte: month.start, lt: month.end }, isPaid: true }, select: { id: true } } },
    }),
    db.payable.findMany({ where: { userId, status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } } }),
    // All invoices that can fall into a tracked period (paid ones too: under Soll their VAT
    // belongs to the invoice period), with what was paid through linked bookings.
    db.receivable.findMany({
      where: { userId, OR: [{ invoiceDate: { gte: trackingStart } }, { invoiceDate: null, createdAt: { gte: trackingStart } }, { status: { in: ['OPEN', 'PARTIAL', 'OVERDUE'] } }] },
      include: { transactions: { select: { grossAmount: true } } },
    }),
    db.taxReserve.findMany({ where: { userId, periodStart: { gte: trackingStart } } }),
    db.transaction.count({ where: { userId, transactionDate: { lt: trackingStart } } }),
  ])

  const invoiceDateById = new Map(receivables.map(r => [r.id, r.invoiceDate ?? r.createdAt]))
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
    receivableId: r.receivableId,
    statusDate: r.receivableId ? (invoiceDateById.get(r.receivableId) ?? null) : null,
  })
  // Records dated in the future (e.g. an invoice entered ahead) are not money received or
  // paid yet: they are left out of every "so far" figure until their date arrives.
  const futureCount = rows.filter(r => r.transactionDate > now).length
  const inRange = (r: DateRange) => (t: (typeof rows)[number]) => t.transactionDate >= r.start && t.transactionDate < r.end && t.transactionDate <= now
  const yearRows = rows.filter(inRange(year)).map(asRow)
  const priorYearRows = rows.filter(inRange(priorYear)).map(asRow)

  // Project the income tax over the part of the year that actually has records.
  const firstMonthWithData = yearRows.length > 0 ? berlinDate(yearRows[0].transactionDate).month : today.month
  const monthsElapsed = monthsElapsedForProjection(today, firstMonthWithData)

  const invoices: InvoiceRow[] = receivables
    .map(r => {
      const invoiceDate = r.invoiceDate ?? r.createdAt
      const linkedPaid = r.transactions.reduce((s, t) => s + Math.abs(toCents(t.grossAmount)), 0)
      return {
        id: r.id,
        customerName: r.customerName,
        invoiceDate,
        totalAmount: r.totalAmount,
        vatRate: r.vatRate,
        unlinkedPaidCents: Math.max(0, toCents(r.paidAmount) - linkedPaid),
        dateConfirmed: r.invoiceDate !== null,
      }
    })
    .filter(inv => inv.invoiceDate <= now)
  const futureInvoices = receivables.length - invoices.length

  const position = computeFinancialPosition({
    now,
    taxType: settings.taxType,
    churchTaxRate: settings.churchTaxRate,
    timeline,
    month: { start: month.start, end: month.end, year: today.year, month: today.month, day: today.day, monthsElapsed },
    yearStart: year.start,
    yearEnd: year.end,
    priorYearStart: priorYear.start,
    vatPeriod,
    periods: periods.map(p => ({ ...p, rows: rows.filter(inRange(p)).filter(r => r.taxPaymentType === null).map(asRow) })),
    invoices,
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
    receivables: receivables
      .filter(r => ['OPEN', 'PARTIAL', 'OVERDUE'].includes(r.status))
      .map(r => ({ id: r.id, customerName: r.customerName, outstandingAmount: r.outstandingAmount, dueDate: r.dueDate })),
    reserves: reserves.map((r): ReserveRow => ({ type: r.type, periodStart: r.periodStart, actuallyReserved: r.actuallyReserved, settledAt: r.settledAt })),
  })

  if (futureCount + futureInvoices > 0) {
    position.limitations.push({
      code: 'FUTURE_DATED',
      message: `${futureCount + futureInvoices} record(s) are dated in the future. They are counted once their date has come.`,
    })
  }
  if (Math.floor(monthsElapsed) < today.month - 1) {
    position.limitations.push({
      code: 'SHORT_HISTORY',
      message: `Your income tax estimate is projected from ${Math.floor(monthsElapsed) + 1} month(s) of records this year.`,
    })
  }
  if (olderRows > 0) {
    position.limitations.push({
      code: 'OLDER_PERIODS_NOT_TRACKED',
      message: `Tax periods before ${berlinDate(trackingStart).year} are not tracked. If taxes for them are still open, ask your Steuerberater.`,
    })
  }

  return { ...position, settings, trackingStart }
}
