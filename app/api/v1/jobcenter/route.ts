import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { berlinDate, berlinMidnight, parseCalendarDate } from '@/lib/time/berlin'
import { summarizeTransactions } from '@/lib/finance/summary'
import { estimateGrundsicherungIncome, monthsInPeriod } from '@/lib/finance/grundsicherung'
import { centsToDecimalString, type TaxType } from '@/lib/finance/transactionAmounts'
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

  const body = await readJsonObject(req)
  const type = oneOf(body?.type, ['EKS', 'IKS'] as const)
  const start = parseCalendarDate(body?.periodStart)
  const end = parseCalendarDate(body?.periodEnd)
  if (!type) return jsonError(400, 'Choose provisional (EKS) or final (abschließende EKS).')
  if (!start || !end) return jsonError(400, 'Please enter a valid start and end date.')
  if (end < start) return jsonError(400, 'The end date must be after the start date.')

  const s = berlinDate(start)
  const e = berlinDate(end)
  const months = monthsInPeriod(s, e)
  if (months > 12) return jsonError(400, 'A period can be at most 12 months (usually 6).')

  // Whole calendar months in Berlin time.
  const rangeStart = berlinMidnight(s.year, s.month, 1)
  const rangeEnd = berlinMidnight(e.year, e.month + 1, 1)

  const [profile, rows] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { taxType: true } }),
    db.transaction.findMany({
      where: { userId: user.id, transactionDate: { gte: rangeStart, lt: rangeEnd } },
      select: { type: true, grossAmount: true, vatRate: true, usage: true, businessPct: true, transactionDate: true, needsReview: true },
    }),
  ])
  const totals = summarizeTransactions(rows, (profile?.taxType ?? 'KLEINUNTERNEHMER') as TaxType)
  const hasMinorChild = body?.hasMinorChild === true
  const result = estimateGrundsicherungIncome({
    year: s.year,
    months,
    receiptsCents: totals.businessReceiptsCents,
    expensesCents: totals.businessExpensesPaidCents,
    hasMinorChild,
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
        needsReviewCount: totals.needsReviewCount,
      },
    },
    { status: 201 }
  )
}
