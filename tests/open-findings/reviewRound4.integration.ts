// @ts-nocheck — OPEN FINDINGS R4-3/R4-5/R4-6 (2026-11-02): failing repros parked outside the suite; move back to tests/integration/*.test.ts once fixed.
/**
 * Independent review round 4 (2026-11-02) of 2f68d49..800f440 — DB/route repro tests.
 * Assertions encode the REQUIRED behaviour; a failing test = defect.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, json } from '../integration/helpers'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as settings from '@/app/api/v1/settings/route'
import { loadFinancialPosition, loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { buildMonthlyReport } from '@/lib/finance/report'
import { buildDecisionContext } from '@/lib/decision/buildDecisionContext'
import { detectRiskSignals } from '@/lib/decision/riskSignals'
import { berlinDate, berlinQuarterRange, toBerlinIsoDate } from '@/lib/time/berlin'

type Reserve = { id: string; type: string; status: string; periodStart: string; periodLabel: string; target: number; paid: number; open: number; shortfall: number }
type TaxGet = { reserves: Reserve[] }
const vatOf = async (label: string) => (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.periodLabel === label)

/** What the Settings page sends: ALL four status fields, plus the chosen "from" date. */
const uiBody = (s: { taxType: string; vatMethod: string; vatFilingPeriod: string; dauerfristverlaengerung: boolean }, statusEffectiveFrom: string) => ({
  name: 'Test', businessName: '', taxId: '', vatId: '', isJobcenter: false, istApproved: false, churchTax: false, churchTaxRate: 9,
  ...s,
  statusEffectiveFrom,
})

describe('R4-3 — a back-dated change of ONE status field re-applies every other current field to the past (Settings UI sends all fields)', () => {
  beforeEach(resetDatabase)

  it('turning on Dauerfristverlängerung "from 1 January" does not make H1 Istversteuerung (Ist approved only from 1 July)', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const y = berlinDate(new Date()).year
    // Unpaid Soll invoice in Q1: its VAT is due for Q1 whether paid or not.
    const inv = await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 11900, vatRate: 19, invoiceDate: `${y}-02-10` }))
    expect(inv.status).toBe(201)
    expect((await vatOf(`Q1 ${y}`))?.open).toBe(1900)
    // Ist approved by the Finanzamt from 1 July.
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST', istApproved: true, statusEffectiveFrom: `${y}-07-01` }))).status).toBe(200)
    expect((await vatOf(`Q1 ${y}`))?.open).toBe(1900)
    // The user now only ticks "Dauerfristverlängerung" and chooses "From 1 January of this year".
    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', uiBody({ taxType: 'REGELBESTEUERUNG', vatMethod: 'IST', vatFilingPeriod: 'QUARTERLY', dauerfristverlaengerung: true }, `${y}-01-01`)))
    expect(res.status).toBe(200)
    const tl = await loadTaxStatusTimeline(user.id)
    expect.soft(tl.statusAt(new Date(Date.UTC(y, 2, 1, 12))).vatMethod).toBe('SOLL')
    // …and the Q1 invoice VAT must not disappear.
    expect((await vatOf(`Q1 ${y}`))?.open).toBe(1900)
  })

  it('correcting Dauerfristverlängerung "It was always like this" does not turn Kleinunternehmer years into Regelbesteuerung', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    const y = berlinDate(new Date()).year
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 5000, vatRate: 0, transactionDate: `${y - 1}-06-10` }))
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'REGELBESTEUERUNG', statusEffectiveFrom: `${y}-01-01` }))).status).toBe(200)
    expect((await loadTaxStatusTimeline(user.id)).statusAt(new Date(Date.UTC(y - 1, 5, 1, 12))).taxType).toBe('KLEINUNTERNEHMER')
    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', uiBody({ taxType: 'REGELBESTEUERUNG', vatMethod: 'SOLL', vatFilingPeriod: 'QUARTERLY', dauerfristverlaengerung: true }, 'ALWAYS')))
    expect(res.status).toBe(200)
    const tl = await loadTaxStatusTimeline(user.id)
    expect(tl.statusAt(new Date(Date.UTC(y - 1, 5, 1, 12))).taxType).toBe('KLEINUNTERNEHMER')
  })
})

describe('R4-4 — decision context counts reserve already paid out as still reserved (taxReserved vs. reserveLeft)', () => {
  beforeEach(resetDatabase)
  it('reserved 1,000 €, paid 1,000 € from it, 900 € still owed → the low-reserve signal must fire', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const now = berlinDate(new Date())
    const q = Math.floor((now.month - 1) / 3) + 1
    const pq = (q === 1 ? 4 : q - 1) as 1 | 2 | 3 | 4
    const py = q === 1 ? now.year - 1 : now.year
    const r = berlinQuarterRange(py, pq)
    const label = `Q${pq} ${py}`
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: toBerlinIsoDate(new Date(r.start.getTime() + 10 * 86400000)) }))
    const before = await vatOf(label)
    expect(before?.open).toBe(1900)
    expect((await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id: before!.id, actuallyReserved: 1000 }))).status).toBe(200)
    const pay = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: r.start.toISOString(), amount: 1000, confirmNotDuplicate: true }))
    expect(pay.status).toBe(201)
    const after = await vatOf(label)
    expect(after?.open).toBe(900)
    expect(after?.shortfall).toBe(900) // Tax page: correct
    // The income tax of the year is fully set aside (so only the VAT gap remains).
    const itRes = (await json<TaxGet>(await taxReserve.GET())).reserves.find(x => x.type === 'INCOME_TAX')
    if (itRes && itRes.open > 0) expect((await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id: itRes.id, actuallyReserved: itRes.open }))).status).toBe(200)
    const ctx = await buildDecisionContext(user.id)
    // What is still set aside is 0 €; the decision layer must not believe 1,000 € are reserved.
    expect(ctx.taxReserved).toBeLessThan(ctx.taxOwed)
    expect(detectRiskSignals(ctx, 100).map(s => s.code)).toContain('LOW_TAX_RESERVE')
  })
})

describe('R4-5 — monthly report vs. Tax page for the current month: invoice dated later this month', () => {
  beforeEach(resetDatabase)
  it('report VAT of the current month equals the position’s month VAT', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const now = new Date()
    const t = berlinDate(now)
    const lastDay = new Date(Date.UTC(t.year, t.month, 0)).getUTCDate()
    if (t.day === lastDay) return // no "later this month" possible today
    const mm = String(t.month).padStart(2, '0')
    const inv = await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 11900, vatRate: 19, invoiceDate: `${t.year}-${mm}-${lastDay}` }))
    expect(inv.status).toBe(201)
    const pos = await loadFinancialPosition(user.id, now)
    const report = await buildMonthlyReport(user.id, { year: t.year, month: t.month })
    expect(report.totals.vatPayableCents).toBe(pos.monthTaxCents.vat)
  })
})

describe('R4-6 — receivable DELETE check is outside the payment lock (TOCTOU)', () => {
  beforeEach(resetDatabase)
  it('a linked payment and the invoice deletion never leave an orphaned (unlinked) payment booking', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const y = berlinDate(new Date()).year
    let orphaned = 0
    for (let i = 0; i < 6; i++) {
      const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: `K${i}`, totalAmount: 119, vatRate: 19, invoiceDate: `${y}-01-1${i}` })))
      await Promise.allSettled([
        receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 119, paymentDate: `${y}-02-01` })),
        receivables.DELETE(jsonRequest(`/x?id=${inv.id}`, 'DELETE')),
      ])
      const stillThere = await db.receivable.count({ where: { id: inv.id } })
      const bookings = await db.transaction.count({ where: { userId: user.id, merchant: `K${i}` } })
      if (!stillThere && bookings > 0) orphaned++
    }
    expect(orphaned).toBe(0)
  })
})
