import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as transactions from '@/app/api/v1/transactions/route'
import * as dashboard from '@/app/api/v1/dashboard/route'
import * as decisions from '@/app/api/v1/decisions/route'
import * as warnings from '@/app/api/v1/warnings/route'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as jobcenter from '@/app/api/v1/jobcenter/route'
import * as reports from '@/app/api/v1/reports/route'
import * as reportText from '@/app/api/v1/reports/pdf/route'
import * as settings from '@/app/api/v1/settings/route'
import { berlinDate } from '@/lib/time/berlin'

const add = (body: Record<string, unknown>) =>
  transactions.POST(jsonRequest('/api/v1/transactions', 'POST', { transactionDate: today(), ...body }))

type Dash = {
  leftFromThisMonth: number
  month: { businessIncomeGross: number; profit: number; vatPayable: number; nonBusinessInflow: number; unclearInflow: number }
  monthTax: { total: number; vat: number }
  commitmentsTotal: number
  reserves: Array<{ type: string; target: number; reserved: number }>
  warnings: Array<{ type: string }>
  kleinunternehmer: { status: string } | null
}

describe('financial position across routes', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'REGELBESTEUERUNG' }))
  })

  it('standard VAT business: dashboard, spend check and warnings agree', async () => {
    await add({ type: 'INCOME', grossAmount: 2380, vatRate: 19 })
    await add({ type: 'EXPENSE', grossAmount: 119, vatRate: 19, merchant: 'Adobe' })
    await add({ type: 'INCOME', grossAmount: 5000, usage: 'PRIVATE', description: 'Privatdarlehen' })

    const d = await json<Dash>(await dashboard.GET())
    expect(d.month.businessIncomeGross).toBe(2380)
    expect(d.month.nonBusinessInflow).toBe(5000)
    expect(d.month.profit).toBe(1900)
    expect(d.month.vatPayable).toBe(361)
    expect(d.leftFromThisMonth).toBeCloseTo(2380 - 119 - d.monthTax.total, 2)

    const check = await json<{ safeToSpend: number; canSpend: boolean }>(await decisions.POST(jsonRequest('/x', 'POST', { amount: 100 })))
    expect(check.safeToSpend).toBe(d.leftFromThisMonth)
    expect(check.canSpend).toBe(true)

    const w = await json<Array<{ type: string }>>(await warnings.GET())
    expect(w.map(x => x.type)).toEqual(d.warnings.map(x => x.type))
  })

  it('a booked fixed cost is not subtracted a second time', async () => {
    const user = (await db.user.findFirstOrThrow()).id
    await db.fixedCost.create({ data: { userId: user, name: 'Büromiete', amount: 800, frequency: 'MONTHLY', dayOfMonth: 1 } })
    await add({ type: 'INCOME', grossAmount: 3000, vatRate: 0 })
    const before = await json<Dash>(await dashboard.GET())
    expect(before.commitmentsTotal).toBe(800)
    await add({ type: 'EXPENSE', grossAmount: 800, vatRate: 0, description: 'Büromiete' })
    const after = await json<Dash>(await dashboard.GET())
    expect(after.commitmentsTotal).toBe(0)
    // The 800 € moved from "still due" to "paid" — counted once either way. The only
    // difference is the income tax estimate: a paid expense reduces profit (EÜR cash basis).
    expect(after.leftFromThisMonth - before.leftFromThisMonth).toBeCloseTo(before.monthTax.total - after.monthTax.total, 2)
  })

  it('negative month is reported, not hidden', async () => {
    await add({ type: 'INCOME', grossAmount: 300, vatRate: 0 })
    await add({ type: 'EXPENSE', grossAmount: 1200, vatRate: 0 })
    const d = await json<Dash>(await dashboard.GET())
    expect(d.leftFromThisMonth).toBe(-900)
    expect(d.warnings.map(w => w.type)).toContain('NEGATIVE_MONTH')
    const check = await json<{ canSpend: boolean; message: string }>(await decisions.POST(jsonRequest('/x', 'POST', { amount: 10 })))
    expect(check.canSpend).toBe(false)
  })

  it('spend check refuses to answer without data', async () => {
    const check = await json<{ canSpend: boolean; insufficientData: boolean }>(await decisions.POST(jsonRequest('/x', 'POST', { amount: 10 })))
    expect(check).toMatchObject({ canSpend: false, insufficientData: true })
    expect((await decisions.POST(jsonRequest('/x', 'POST', { amount: -1 }))).status).toBe(400)
  })

  it('Kleinunternehmer: no VAT reserve, limit monitor active', async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'KLEINUNTERNEHMER' }))
    await add({ type: 'INCOME', grossAmount: 1000 })
    const d = await json<Dash>(await dashboard.GET())
    expect(d.reserves.map(r => r.type)).toEqual(['INCOME_TAX'])
    expect(d.monthTax.vat).toBe(0)
    expect(d.kleinunternehmer?.status).toBe('OK')
  })
})

describe('tax reserve periods', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'REGELBESTEUERUNG' }))
  })

  it('creates rows for the current periods and never rewrites history', async () => {
    const userId = (await db.user.findFirstOrThrow()).id
    const old = await db.taxReserve.create({
      data: { userId, type: 'VAT', periodStart: new Date('2025-01-01T00:00:00Z'), periodEnd: new Date('2025-03-31T00:00:00Z'), shouldHave: 123, actuallyReserved: 100, missing: 23 },
    })
    await add({ type: 'INCOME', grossAmount: 1190, vatRate: 19 })
    const r = await json<{ reserves: Array<{ id: string; type: string; target: number }>; history: Array<{ id: string }> }>(await taxReserve.GET())
    expect(r.reserves.map(x => x.type)).toEqual(['VAT', 'INCOME_TAX'])
    expect(r.reserves[0].target).toBe(190)
    expect(r.history.map(h => h.id)).toEqual([old.id])
    const untouched = await db.taxReserve.findUniqueOrThrow({ where: { id: old.id } })
    expect(untouched.shouldHave.toString()).toBe('123')

    // Calling GET again must not create duplicates.
    await taxReserve.GET()
    expect(await db.taxReserve.count()).toBe(3)
  })

  it('validates and audits what the user set aside', async () => {
    const r = await json<{ reserves: Array<{ id: string }> }>(await taxReserve.GET())
    const id = r.reserves[0].id
    expect((await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id, actuallyReserved: -50 }))).status).toBe(400)
    expect((await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id, actuallyReserved: 'lots' }))).status).toBe(400)
    const ok = await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id, actuallyReserved: 150.5 }))
    expect((await json<{ reserved: number }>(ok)).reserved).toBe(150.5)
    expect(await db.auditEvent.count({ where: { entityType: 'TAX_RESERVE', entityId: id } })).toBe(1)
  })
})

describe('Jobcenter (Anlage EKS) estimate', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'KLEINUNTERNEHMER' }))
  })

  it('applies the §11b allowances to the monthly average, not the 30 % formula', async () => {
    const { year } = berlinDate()
    // 6 months, 1,200 € receipts and 400 € expenses per month = 800 €/month income
    for (let m = 1; m <= 6; m++) {
      const mm = String(m).padStart(2, '0')
      await add({ type: 'INCOME', grossAmount: 1200, transactionDate: `${year}-${mm}-10` })
      await add({ type: 'EXPENSE', grossAmount: 400, transactionDate: `${year}-${mm}-12` })
    }
    await add({ type: 'INCOME', grossAmount: 3000, usage: 'PRIVATE', transactionDate: `${year}-02-01` }) // not income
    const res = await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: `${year}-01-01`, periodEnd: `${year}-06-30` }))
    expect(res.status).toBe(201)
    const r = await json<{ anrechenbares: number; estimate: { monthlyIncome: number; monthlyCountable: number } }>(res)
    expect(r.estimate.monthlyIncome).toBe(800)
    expect(r.estimate.monthlyCountable).toBe(532)
    expect(r.anrechenbares).toBe(532 * 6)
  })

  it('validates the period', async () => {
    expect((await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: '2026-06-01', periodEnd: '2026-01-01' }))).status).toBe(400)
    expect((await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'XYZ', periodStart: '2026-01-01', periodEnd: '2026-02-01' }))).status).toBe(400)
    expect((await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: '2025-01-01', periodEnd: '2026-06-01' }))).status).toBe(400)
  })
})

describe('reports and settings', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'KLEINUNTERNEHMER' }))
  })

  it('Kleinunternehmer report shows no VAT and lists unclear money separately', async () => {
    await add({ type: 'INCOME', grossAmount: 500 })
    await add({ type: 'EXPENSE', grossAmount: 80, usage: 'UNSURE', description: 'Unklar' })
    const r = await json<{ vatOwed: number; unclear: number; netProfit: number }>(await reports.GET(jsonRequest('/api/v1/reports', 'GET')))
    expect(r).toMatchObject({ vatOwed: 0, unclear: 80, netProfit: 500 })
    const text = await (await reportText.GET(jsonRequest('/api/v1/reports/pdf', 'GET'))).text()
    expect(text).toContain('Kleinunternehmer')
    expect(text).not.toContain('Vorsteuer:')
    expect(text).toContain('NOCH ZU KLÄREN')
  })

  it('settings validate enums and church tax rate, and changes are audited', async () => {
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'NONE' }))).status).toBe(400)
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { churchTaxRate: 7 }))).status).toBe(400)
    const ok = await json<{ taxType: string; vatFilingPeriod: string; churchTax: boolean }>(
      await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'REGELBESTEUERUNG', vatFilingPeriod: 'MONTHLY', churchTax: true, churchTaxRate: 8 }))
    )
    expect(ok).toMatchObject({ taxType: 'REGELBESTEUERUNG', vatFilingPeriod: 'MONTHLY', churchTax: true })
    // One entry for the settings diff, one for the tax-status history change.
    expect(await db.auditEvent.count({ where: { entityType: 'ACCOUNT', action: 'UPDATE' } })).toBe(2)
  })
})
