/**
 * Independent financial review (2026-11-02) of commit 2f68d49 — DB/route repro tests.
 * Assertions encode the REQUIRED behaviour; a failing test = defect.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, json, params } from './helpers'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as transactionById from '@/app/api/v1/transactions/[id]/route'
import * as settings from '@/app/api/v1/settings/route'
import * as reports from '@/app/api/v1/reports/route'
import * as exportRoute from '@/app/api/v1/account/export/route'
import { berlinDate, berlinMidnight, berlinQuarterRange, toBerlinIsoDate } from '@/lib/time/berlin'

type Reserve = { id: string; type: string; status: string; periodStart: string; periodLabel: string; target: number; paid: number; open: number }
type TaxGet = { reserves: Reserve[] }

function previousQuarterDate() {
  const now = berlinDate(new Date())
  const q = Math.floor((now.month - 1) / 3) + 1
  const pq = q === 1 ? 4 : q - 1
  const py = q === 1 ? now.year - 1 : now.year
  const r = berlinQuarterRange(py, pq as 1 | 2 | 3 | 4)
  return { iso: toBerlinIsoDate(new Date(r.start.getTime() + 10 * 86400000)), label: `Q${pq} ${py}`, start: r.start }
}
const vatOf = async (label: string) => (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.periodLabel === label)

async function sollInvoicePaidAndLinked(pqIso: string) {
  const inv = await json<{ id: string }>(
    await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 11900, vatRate: 19, invoiceDate: pqIso }))
  )
  const pay = await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 11900, paymentDate: toBerlinIsoDate(new Date(Date.now() - 86400000)) }))
  expect(pay.status).toBe(200)
  const body = await json<{ bookedTransactionId: string }>(pay)
  return { invoiceId: inv.id, paymentTxId: body.bookedTransactionId }
}

describe('NF-06 — deleting the linked payment booking erases the invoice’s Soll VAT', () => {
  beforeEach(resetDatabase)
  it('VAT of an issued invoice stays due for the invoice period after the payment booking is deleted', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    const { paymentTxId } = await sollInvoicePaidAndLinked(pq.iso)
    expect((await vatOf(pq.label))?.open).toBe(1900)
    // e.g. the user deletes it because the bank import has the same payment (the debts error text
    // itself tells users to "Delete the wrong payment under Transactions").
    const del = await transactionById.DELETE(jsonRequest('/x', 'DELETE'), params({ id: paymentTxId }))
    expect(del.status).toBe(200)
    // Invoice still exists, still says paid 11,900 € — but no booking carries its VAT any more.
    expect((await vatOf(pq.label))?.open).toBe(1900)
  })
})

describe('NF-07 — deleting a Soll invoice after its period was paid taxes the payment again', () => {
  beforeEach(resetDatabase)
  it('no second 1,900 € of VAT appears in the payment period', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    const { invoiceId } = await sollInvoicePaidAndLinked(pq.iso) // payment booked today (current period)
    const pay = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: pq.start.toISOString(), amount: 1900, date: toBerlinIsoDate(new Date(Date.now() - 86400000)) }))
    expect(pay.status).toBe(201)
    const currentBefore = (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')
    expect(currentBefore?.target ?? 0).toBe(0)
    // Fix: an invoice with linked payments cannot be deleted (it would turn its payment into
    // plain income and tax it a second time).
    const del = await receivables.DELETE(jsonRequest(`/x?id=${invoiceId}`, 'DELETE'))
    expect(del.status).toBe(409)
    expect(await db.receivable.count({ where: { id: invoiceId } })).toBe(1)
    const currentAfter = (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')
    expect(currentAfter?.target ?? 0).toBe(0)
  })
})

describe('NF-08 — a back-dated status correction to the CURRENT value is silently ignored', () => {
  beforeEach(resetDatabase)
  it('Ist approval confirmed today, then back-dated to 1 January → history must say IST from 1 January', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 100, vatRate: 19, transactionDate: toBerlinIsoDate(new Date()) }))
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST', istApproved: true }))).status).toBe(200)
    const y = berlinDate(new Date()).year
    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST', istApproved: true, statusEffectiveFrom: `${y}-01-01` }))
    expect(res.status).toBe(200)
    const rows = await db.taxStatusPeriod.findMany({ where: { userId: user.id }, orderBy: { validFrom: 'asc' } })
    const jan1 = rows.find(r => toBerlinIsoDate(r.validFrom) === `${y}-01-01`)
    expect(jan1?.vatMethod ?? rows.find(r => r.validFrom.getTime() <= Date.UTC(y, 0, 1))?.vatMethod).toBe('IST')
  })
})

describe('NF-09 — a back-dated status change overwrites every LATER status entry', () => {
  beforeEach(resetDatabase)
  it('KU from the 1st of this month, then "Regel from 1 Jan" → the later switch to KU is lost (observed)', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 100, vatRate: 0, transactionDate: toBerlinIsoDate(new Date()) }))
    const t = berlinDate(new Date())
    const mm = String(t.month).padStart(2, '0')
    // History: KU (since always) → … we build: Regel since always, KU from 1st of this month.
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER', statusEffectiveFrom: `${t.year}-${mm}-01` }))).status).toBe(200)
    // Correction of an EARLIER fact: "I was Kleinunternehmer from 1 Jan to …" — the user sends KU from 1 Jan.
    // Here (inverse): set Regel from 1 Feb of the year; expected: entry at 1 Feb, the later KU switch kept.
    // Regel already applies on 1 Feb: the request changes nothing then and is answered with an
    // explanation instead of "saved"; the later switch to KU stays.
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'REGELBESTEUERUNG', statusEffectiveFrom: `${t.year}-02-01` }))).status).toBe(409)
    const rows = await db.taxStatusPeriod.findMany({ where: { userId: user.id }, orderBy: { validFrom: 'asc' } })
    const last = rows[rows.length - 1]
    expect(last.taxType).toBe('KLEINUNTERNEHMER')
  })

  it('back-dating KU before a later switch to Regelbesteuerung keeps that later Regel period (its VAT stays)', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 100, vatRate: 19, transactionDate: toBerlinIsoDate(new Date()) }))
    const y = berlinDate(new Date()).year - 1
    // History: Regel since always → KU from 1 Jul → Regel again from 1 Oct (last year).
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER', statusEffectiveFrom: `${y}-07-01` }))).status).toBe(200)
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'REGELBESTEUERUNG', statusEffectiveFrom: `${y}-10-01` }))).status).toBe(200)
    // Correction: KU already from 1 Mar. Must run only until the next explicit switch (1 Oct).
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER', statusEffectiveFrom: `${y}-03-01` }))).status).toBe(200)
    const rows = await db.taxStatusPeriod.findMany({ where: { userId: user.id }, orderBy: { validFrom: 'asc' } })
    expect(rows.map(r => [toBerlinIsoDate(r.validFrom), r.taxType])).toEqual([
      ['1970-01-01', 'REGELBESTEUERUNG'],
      [`${y}-03-01`, 'KLEINUNTERNEHMER'],
      [`${y}-10-01`, 'REGELBESTEUERUNG'],
    ])
  })
})

describe('NF-10 — monthly report (Steuerberater export) ignores Soll', () => {
  beforeEach(resetDatabase)
  it('the month of a linked invoice payment must not show the invoice VAT as owed', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    await sollInvoicePaidAndLinked(pq.iso)
    const t = berlinDate(new Date())
    const rep = await json<{ vatOwed: number }>(await reports.GET(jsonRequest(`/x?month=${t.year}-${String(t.month).padStart(2, '0')}`, 'GET')))
    // Under Soll the 1,900 € belongs to the invoice month; the Tax page agrees. The report says 1,900 € now.
    expect(rep.vatOwed).toBe(0)
  })
})

describe('NF-11 — calendar dates are stored at 12:00 UTC but compared with the current instant', () => {
  beforeEach(resetDatabase)
  afterEach(() => vi.useRealTimers())
  it('at 08:00 Berlin, a booking dated today is part of today’s position', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const t = berlinDate(new Date())
    const iso = toBerlinIsoDate(new Date())
    expect((await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 5000, vatRate: 0, usage: 'BUSINESS', transactionDate: iso }))).status).toBe(201)
    const eightAm = new Date(berlinMidnight(t.year, t.month, t.day).getTime() + 8 * 3600000)
    const p = await loadFinancialPosition(user.id, eightAm)
    expect(p.month.outflowGrossCents).toBe(500000)
  })
  it('at 08:00 Berlin, a Finanzamt payment dated today (the default) can be recorded', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: pq.iso }))
    const t = berlinDate(new Date())
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(berlinMidnight(t.year, t.month, t.day).getTime() + 8 * 3600000))
    const res = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: pq.start.toISOString(), amount: 1900 }))
    expect(res.status).toBe(201)
  })
})

describe('NF-05 — a filing-rhythm correction must not orphan recorded VAT payments', () => {
  beforeEach(resetDatabase)
  it('is refused while VAT payments are keyed to periods of the old rhythm', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 11900, vatRate: 19, transactionDate: pq.iso }))
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: pq.start.toISOString(), amount: 1900 }))).status).toBe(201)
    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', { vatFilingPeriod: 'MONTHLY', statusEffectiveFrom: 'ALWAYS' }))
    expect(res.status).toBe(409)
    expect((await db.taxStatusPeriod.findMany({ where: { userId: user.id } })).every(r => r.vatFilingPeriod === 'QUARTERLY')).toBe(true)
    // From next 1 January (no payments keyed there yet) the change is fine.
    const next = berlinDate(new Date()).year + 1
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatFilingPeriod: 'MONTHLY', statusEffectiveFrom: `${next}-01-01` }))).status).toBe(200)
  })
})

describe('Security review round 3', () => {
  beforeEach(resetDatabase)

  it('M2 — parallel settings changes are serialised: no 500, every change kept in the history', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 100, vatRate: 19, transactionDate: toBerlinIsoDate(new Date()) }))
    const y = berlinDate(new Date()).year - 1
    const dates = [`${y}-02-01`, `${y}-04-01`, `${y}-06-01`, `${y}-08-01`]
    const results = await Promise.all(dates.map((d, i) =>
      settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: i % 2 === 0 ? 'KLEINUNTERNEHMER' : 'REGELBESTEUERUNG', statusEffectiveFrom: d }))
    ))
    for (const r of results) expect([200, 409]).toContain(r.status)
    const rows = await db.taxStatusPeriod.findMany({ where: { userId: user.id }, orderBy: { validFrom: 'asc' } })
    expect(rows.length).toBeGreaterThanOrEqual(2)
    expect(rows[0].validFrom.getUTCFullYear()).toBe(1970)
  })

  it('L1 — the data export contains the tax status history', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const body = await json<{ taxStatusPeriods?: unknown[] }>(await exportRoute.GET())
    expect(Array.isArray(body.taxStatusPeriods)).toBe(true)
    expect(body.taxStatusPeriods!.length).toBeGreaterThanOrEqual(1)
  })

  it('L2 — two concurrent links of one booking: only one succeeds', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const line = await json<{ id: string }>(await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 500, vatRate: 0, merchant: 'Finanzamt', transactionDate: toBerlinIsoDate(new Date()) })))
    const periods = (await json<TaxGet>(await taxReserve.GET())).reserves.filter(r => r.type === 'VAT')
    const pq = previousQuarterDate()
    const target = periods[0].periodStart
    const other = pq.start.toISOString()
    const res = await Promise.all([target, other].map(ps =>
      taxReserve.POST(jsonRequest('/x', 'POST', { action: 'linkTransaction', transactionId: line.id, type: 'VAT', periodStart: ps }))
    ))
    expect(res.filter(r => r.status === 200)).toHaveLength(1)
    const audits = await db.auditEvent.count({ where: { userId: user.id, entityType: 'TRANSACTION', entityId: line.id, action: 'UPDATE' } })
    expect(audits).toBe(1)
  })

  it('L3 / NF-06 — a booking linked to an invoice cannot change type or amount; deleting it reopens the invoice', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const { invoiceId, paymentTxId } = await sollInvoicePaidAndLinked(toBerlinIsoDate(new Date(Date.now() - 2 * 86400000)))
    const edit = await transactionById.PATCH(jsonRequest('/x', 'PATCH', { type: 'EXPENSE', grossAmount: 5000 }), params({ id: paymentTxId }))
    expect(edit.status).toBe(400)
    // A text change is still allowed.
    expect((await transactionById.PATCH(jsonRequest('/x', 'PATCH', { description: 'Zahlung RE-1' }), params({ id: paymentTxId }))).status).toBe(200)
    expect((await transactionById.DELETE(jsonRequest('/x', 'DELETE'), params({ id: paymentTxId }))).status).toBe(200)
    const inv = await db.receivable.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(Number(inv.paidAmount)).toBe(0)
    expect(Number(inv.outstandingAmount)).toBe(11900)
    expect(inv.status).toBe('OPEN')
  })
})
