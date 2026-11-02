import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { limitWrites } from '@/lib/rateLimit'
import { db } from '@/lib/db'
import { berlinDate, berlinMidnight, parseCalendarDate } from '@/lib/time/berlin'
import { summarizeTransactions } from '@/lib/finance/summary'
import { estimateGrundsicherungIncome, monthsInPeriod } from '@/lib/finance/grundsicherung'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import type { Prisma } from '@prisma/client'
import { fromCents, toCents } from '@/lib/finance/money'
import { recordAudit } from '@/lib/audit'
import { jsonError, oneOf, readJsonObject, unauthorized } from '@/lib/http'

function present(r: {
  id: string
  periodStart: Date
  periodEnd: Date
  type: string
  status: string
  totalIncome: { toString(): string }
  totalExpenses: { toString(): string }
  netProfit: { toString(): string }
  freibetrag: { toString(): string }
  anrechenbares: { toString(): string }
  generatedAt: Date
  warnings?: Prisma.JsonValue | null
}) {
  return {
    id: r.id,
    periodStart: r.periodStart.toISOString(),
    periodEnd: r.periodEnd.toISOString(),
    type: r.type,
    status: r.status,
    generatedAt: r.generatedAt.toISOString(),
    totalIncome: fromCents(toCents(r.totalIncome)),
    totalExpenses: fromCents(toCents(r.totalExpenses)),
    netProfit: fromCents(toCents(r.netProfit)),
    freibetrag: fromCents(toCents(r.freibetrag)),
    anrechenbares: fromCents(toCents(r.anrechenbares)),
    warnings: Array.isArray(r.warnings) ? (r.warnings as string[]) : [],
  }
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const records = await db.jobcenterRecord.findMany({ where: { userId: user.id }, orderBy: { periodStart: 'desc' } })
  return NextResponse.json(records.map(present))
}

/**
 * Prepares figures for the Anlage EKS (cash basis, whole calendar months).
 * EKS = provisional statement (expected figures), IKS is kept as the stored
 * value for the FINAL statement after the period ("abschließende EKS").
 * The stored totals are period totals; `freibetrag` and `anrechenbares` are
 * PERIOD totals of the monthly deductions / countable income.
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const body = await readJsonObject(req)
  const type = oneOf(body?.type, ['EKS', 'IKS'] as const)
  const start = parseCalendarDate(body?.periodStart)
  const end = parseCalendarDate(body?.periodEnd)
  if (!type) return jsonError(400, 'Choose provisional (EKS) or final (abschließende EKS).')
  if (!start || !end) return jsonError(400, 'Please enter a valid start and end date.')
  if (end < start) return jsonError(400, 'The end date must be after the start date.')
  if (start.getUTCFullYear() < 2015 || end.getTime() > Date.now() + 2 * 366 * 86400000) {
    return jsonError(400, 'The period looks wrong — please check the years.')
  }

  const s = berlinDate(start)
  const e = berlinDate(end)
  const months = monthsInPeriod(s, e)
  if (months > 12) return jsonError(400, 'A period can be at most 12 months (usually 6).')

  // Whole calendar months in Berlin time.
  const rangeStart = berlinMidnight(s.year, s.month, 1)
  const rangeEnd = berlinMidnight(e.year, e.month + 1, 1)

  const [timeline, rows] = await Promise.all([
    loadTaxStatusTimeline(user.id),
    db.transaction.findMany({
      where: { userId: user.id, transactionDate: { gte: rangeStart, lt: rangeEnd } },
      select: {
        type: true, grossAmount: true, vatRate: true, usage: true, businessPct: true,
        transactionDate: true, needsReview: true, taxPaymentType: true, taxPeriodStart: true,
      },
    }),
  ])
  const totals = summarizeTransactions(rows, timeline)
  const eurText = (cents: number) => fromCents(cents).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  // Kept with the record: an under-declared income to the Jobcenter is the costly mistake.
  const warnings: string[] = []
  const now = new Date()
  if (rangeEnd.getTime() > now.getTime()) {
    warnings.push(
      'This period has not ended yet. The figures contain only what is recorded so far — they are NOT an estimate of the whole period. For a provisional EKS, enter the income and expenses you EXPECT on the official form.'
    )
  }
  if (totals.unclearInflowCents > 0) {
    warnings.push(
      `${eurText(totals.unclearInflowCents)} of incoming money in this period is not classified and is NOT counted as receipts. The Jobcenter needs all business income: classify it and calculate again.`
    )
  }
  if (totals.unclearOutflowCents > 0) {
    warnings.push(`${eurText(totals.unclearOutflowCents)} of payments are not classified and are not counted as business expenses.`)
  }
  if (totals.count === 0) warnings.push('No records in this period — the result is 0 only because nothing is recorded.')
  const hasMinorChild = body?.hasMinorChild === true
  const result = estimateGrundsicherungIncome({
    year: s.year,
    months,
    receiptsCents: totals.businessReceiptsCents,
    expensesCents: totals.businessExpensesPaidCents,
    hasMinorChild,
    incomeTaxPaidCents: Math.max(0, totals.incomeTaxPaidCents),
  })

  const record = await db.$transaction(async tx => {
    const r = await tx.jobcenterRecord.create({
      data: {
        userId: user.id,
        periodStart: rangeStart,
        periodEnd: new Date(rangeEnd.getTime() - 1),
        type,
        totalIncome: centsToDecimalString(result.receiptsCents),
        totalExpenses: centsToDecimalString(result.expensesCents),
        netProfit: centsToDecimalString(result.periodIncomeCents),
        freibetrag: centsToDecimalString(result.monthlyDeductionsCents * result.months),
        anrechenbares: centsToDecimalString(result.periodCountableCents),
        warnings,
        status: 'DRAFT',
      },
    })
    await recordAudit({ userId: user.id, entityType: 'JOBCENTER_RECORD', entityId: r.id, action: 'CREATE', after: { type, months, hasMinorChild } }, tx)
    return r
  })

  return NextResponse.json(
    {
      ...present(record),
      estimate: {
        benefitName: result.benefitName,
        months: result.months,
        monthlyIncome: fromCents(result.monthlyIncomeCents),
        monthlyPauschale: fromCents(result.monthlyPauschaleCents),
        monthlyErwerbstaetigenFreibetrag: fromCents(result.monthlyErwerbstaetigenFreibetragCents),
        monthlyCountable: fromCents(result.monthlyCountableCents),
        bands: result.bands.map(b => ({ ...b, amount: fromCents(b.amountCents) })),
        notes: result.notes,
        basis: result.basis,
        unclearTransactions: totals.unclearInflowCents + totals.unclearOutflowCents > 0,
        futurePeriod: rangeEnd.getTime() > now.getTime(),
        needsReviewCount: totals.needsReviewCount,
      },
    },
    { status: 201 }
  )
}
