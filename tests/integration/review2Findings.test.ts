/**
 * Regression tests for the second independent review (2026-11-01): finance and security.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as classify from '@/app/api/v1/classify/route'
import * as extract from '@/app/api/v1/extract/route'
import * as importRoute from '@/app/api/v1/transactions/import/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as dashboard from '@/app/api/v1/dashboard/route'
import * as jobcenter from '@/app/api/v1/jobcenter/route'
import * as dailyClose from '@/app/api/v1/daily-close/route'
import * as persona from '@/app/api/v1/guidance/persona/route'
import * as review from '@/app/api/v1/documents/[id]/review/route'
import { berlinDate, berlinYearRange } from '@/lib/time/berlin'
import { vatPeriodFor } from '@/lib/finance/loadPosition'

type Reserve = { id: string; type: string; status: string; periodStart: string; periodLabel: string; target: number; paid: number; open: number; shortfall: number }
type TaxGet = { reserves: Reserve[]; history: Array<{ id: string; settledAt: string | null }> }

describe('tax payments to the Finanzamt', () => {
  let user: Awaited<ReturnType<typeof createUser>>
  beforeEach(async () => {
    await resetDatabase()
    user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
  })

  it('recording a payment books a tax transaction that does not change profit, and reduces what is open', async () => {
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: today(), merchant: 'Kunde' }))
    const before = await json<TaxGet>(await taxReserve.GET())
    const vat = before.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')!
    expect(vat.open).toBe(190)
    const profitBefore = (await json<{ month: { profit: number } }>(await dashboard.GET())).month.profit

    const res = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: vat.periodStart, amount: '100,00' }))
    expect(res.status).toBe(201)
    const t = await db.transaction.findFirstOrThrow({ where: { userId: user.id, taxPaymentType: 'VAT' } })
    expect(t.vatRate.toString()).toBe('0')
    expect(t.taxPeriodStart?.toISOString()).toBe(vat.periodStart)

    const after = await json<TaxGet>(await taxReserve.GET())
    expect(after.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.open).toBe(90)
    const dash = await json<{ month: { profit: number; outflowGross: number } }>(await dashboard.GET())
    expect(dash.month.profit).toBe(profitBefore)
    expect(dash.month.outflowGross).toBe(0)
    expect(await db.auditEvent.count({ where: { userId: user.id, entityType: 'TRANSACTION', entityId: t.id } })).toBe(1)
  })

  it('settling the previous year removes it; deleting a payment reopens the amount', async () => {
    const y = berlinDate(new Date()).year
    const last = berlinYearRange(y - 1)
    await db.transaction.create({
      data: {
        userId: user.id, type: 'INCOME', amount: '71400', grossAmount: '71400', netAmount: '60000', vatAmount: '11400', vatRate: '19',
        usage: 'BUSINESS', businessPct: 100, businessAmount: '60000', transactionDate: new Date(last.start.getTime() + 40 * 24 * 3600_000),
      },
    })
    const open = await json<TaxGet>(await taxReserve.GET())
    const prior = open.reserves.find(r => r.type === 'INCOME_TAX' && r.status === 'ENDED')
    expect(prior?.periodLabel).toBe(String(y - 1))
    expect(prior!.open).toBeGreaterThan(10_000)

    const pay = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'INCOME_TAX', periodStart: prior!.periodStart, amount: 1000, settle: false }))
    expect(pay.status).toBe(201)
    const payId = (await json<{ transaction: { id: string } }>(pay)).transaction.id
    expect((await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.status === 'ENDED' && r.type === 'INCOME_TAX')?.paid).toBe(1000)

    await db.transaction.delete({ where: { id: payId } })
    expect((await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.status === 'ENDED' && r.type === 'INCOME_TAX')?.paid).toBe(0)

    const settle = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'settle', type: 'INCOME_TAX', periodStart: prior!.periodStart, settled: true }))
    expect(settle.status).toBe(200)
    const settled = await json<TaxGet>(await taxReserve.GET())
    expect(settled.reserves.find(r => r.status === 'ENDED' && r.type === 'INCOME_TAX')).toBeUndefined()
    expect(settled.history.some(h => h.settledAt)).toBe(true)
  })

  it('refuses untracked periods, invalid amounts and foreign users’ data', async () => {
    const bogus = new Date(Date.UTC(2019, 0, 1)).toISOString()
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: bogus, amount: 10 }))).status).toBe(400)
    const vatStart = vatPeriodFor(new Date(), 'QUARTERLY').start.toISOString()
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: vatStart, amount: -5 }))).status).toBe(400)
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'nope', type: 'VAT', periodStart: vatStart }))).status).toBe(400)

    // Kleinunternehmer have no VAT period to pay.
    const klein = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(klein)
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: vatStart, amount: 10 }))).status).toBe(400)
    expect(await db.transaction.count({ where: { userId: klein.id } })).toBe(0)

    // Settling is per user: B settling does not touch A's rows.
    setCurrentUser(user)
    await taxReserve.GET()
    setCurrentUser(klein)
    const yStart = berlinYearRange(berlinDate(new Date()).year).start.toISOString()
    await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'settle', type: 'INCOME_TAX', periodStart: yStart, settled: true }))
    expect(await db.taxReserve.count({ where: { userId: user.id, settledAt: { not: null } } })).toBe(0)
  })

  it('Jobcenter: income tax payments are not business expenses; VAT payments are', async () => {
    const vatStart = vatPeriodFor(new Date(), 'QUARTERLY').start.toISOString()
    const yStart = berlinYearRange(berlinDate(new Date()).year).start.toISOString()
    await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: vatStart, amount: 300 }))
    await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'INCOME_TAX', periodStart: yStart, amount: 500 }))
    const d = today()
    const res = await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: d, periodEnd: d }))
    expect(res.status).toBe(201)
    const body = await json<{ totalExpenses: number; estimate: { notes: string[] } }>(res)
    expect(body.totalExpenses).toBe(300)
    expect(body.estimate.notes.join(' ')).toContain('§11b Abs. 1 S. 1 Nr. 1')
  })
})

describe('unknown VAT is flagged and estimated cautiously', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'REGELBESTEUERUNG' }))
  })

  it('a customer payment without VAT rate counts with 19 % VAT until checked', async () => {
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 1190 })))
    await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1190 }))
    const d = await json<{ month: { businessIncomeNet: number; vatPayable: number }; limitations: Array<{ code: string }> }>(await dashboard.GET())
    expect(d.month.businessIncomeNet).toBe(1000)
    expect(d.month.vatPayable).toBe(190)
    expect(d.limitations.map(l => l.code)).toContain('ASSUMED_VAT')
  })

  it('bank import: null VAT is unknown (flagged) and German string amounts are parsed strictly', async () => {
    const res = await importRoute.POST(
      jsonRequest('/x', 'POST', {
        items: [
          { type: 'INCOME', amount: '1.234,56', date: today(), description: 'Kunde X', usage: 'BUSINESS', vatRate: null },
          { type: 'EXPENSE', amount: '1.234', date: today(), description: 'Material', usage: 'BUSINESS', vatRate: 19 },
        ],
      })
    )
    expect(res.status).toBe(201)
    const rows = await db.transaction.findMany({ orderBy: { createdAt: 'asc' } })
    expect(rows.map(r => r.grossAmount.toString())).toEqual(['1234.56', '1234'])
    expect(rows[0].needsReview).toBe(true)
  })
})

describe('security hardening', () => {
  let user: Awaited<ReturnType<typeof createUser>>
  beforeEach(async () => {
    await resetDatabase()
    user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
  })

  it('recorded payments cannot be reduced (no double booking through reset + pay again)', async () => {
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 1000 })))
    await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1000 }))
    const reset = await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, paidAmount: 0 }))
    expect(reset.status).toBe(400)
    expect((await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1000 }))).status).toBe(400)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1)
  })

  it('AI routes validate types and sizes before anything is sent', async () => {
    expect((await classify.POST(jsonRequest('/x', 'POST', { description: ['x'.repeat(10), 'y'] }))).status).toBe(400)
    expect((await classify.POST(jsonRequest('/x', 'POST', { description: 'Adobe', type: 'x'.repeat(5000) }))).status).toBe(400)
    expect((await classify.POST(jsonRequest('/x', 'POST', '{not json'))).status).toBe(400)
    expect((await classify.POST(jsonRequest('/x', 'POST', { description: 'Adobe', amount: '12,50' }))).status).toBe(200)
    expect((await extract.POST(jsonRequest('/x', 'POST', '{not json'))).status).toBe(400)
    expect((await extract.POST(jsonRequest('/x', 'POST', { text: { $gt: '' } }))).status).toBe(400)
  })

  it('two parallel daily closes for the same day leave one row', async () => {
    const body = { date: today(), cashStart: 100, cashEnd: 100 }
    const results = await Promise.all([1, 2, 3].map(() => dailyClose.POST(jsonRequest('/x', 'POST', body))))
    expect(results.every(r => r.status === 201)).toBe(true)
    expect(await db.dailyClose.count({ where: { userId: user.id } })).toBe(1)
  })

  it('persona: out-of-range numbers and huge text are a 400, not a database error', async () => {
    expect((await persona.PATCH(jsonRequest('/x', 'PATCH', { employeeCount: 2.5 }))).status).toBe(400)
    expect((await persona.PATCH(jsonRequest('/x', 'PATCH', { cashPercentage: 140 }))).status).toBe(400)
    expect((await persona.PATCH(jsonRequest('/x', 'PATCH', { businessDescription: 'x'.repeat(5000) }))).status).toBe(400)
    expect((await persona.PATCH(jsonRequest('/x', 'PATCH', { employeeCount: 2, businessDescription: 'Grafikdesign' }))).status).toBe(200)
  })

  it('a Finanzamt letter cannot be booked as a transaction', async () => {
    const letter = await db.document.create({
      data: { userId: user.id, type: 'OTHER', fileName: 'brief.pdf', r2Key: `${user.id}/brief.pdf`, mimeType: 'application/pdf', status: 'PROCESSED', reviewStatus: 'PENDING_REVIEW', ocrData: { amount: 1200 } },
    })
    const viaForm = await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 1200, transactionDate: today(), documentId: letter.id }))
    expect(viaForm.status).toBe(409)
    const viaReview = await review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve', corrections: { amount: 1200 } }), { params: Promise.resolve({ id: letter.id }) })
    expect(viaReview.status).toBe(400)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0)
  })
})
