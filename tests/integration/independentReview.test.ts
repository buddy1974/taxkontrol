/**
 * Regression tests (database, real route handlers) for the independent adversarial review
 * of 2026-11-01. Unit-level maths: tests/unit/independentReview.test.ts.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, today, json, params } from './helpers'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as payables from '@/app/api/v1/payables/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as settings from '@/app/api/v1/settings/route'
import * as onboarding from '@/app/api/v1/onboarding/route'
import * as jobcenter from '@/app/api/v1/jobcenter/route'
import * as account from '@/app/api/v1/account/route'
import * as review from '@/app/api/v1/documents/[id]/review/route'
import * as cron from '@/app/api/cron/storage-cleanup/route'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { processPendingDeletions } from '@/lib/account/storageCleanup'
import { r2Storage } from '@/lib/r2'
import { berlinDate, berlinQuarterRange, toBerlinIsoDate } from '@/lib/time/berlin'

type Reserve = { id: string; type: string; status: string; periodStart: string; periodLabel: string; target: number; paid: number; open: number }
type TaxGet = { reserves: Reserve[]; paymentCandidates: Array<{ id: string }> }
const r2 = () => (globalThis as unknown as { __r2State: { fail: boolean; deleted: string[]; objects: string[] } }).__r2State

function keyed(url: string, method: string, body: unknown, key: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost'), {
    method,
    headers: { 'Content-Type': 'application/json', 'x-real-ip': '127.0.0.1', 'Idempotency-Key': key },
    body: JSON.stringify(body),
  })
}

/** A date inside the previous Berlin quarter (always ENDED today). */
function previousQuarterDate() {
  const now = berlinDate(new Date())
  const q = Math.floor((now.month - 1) / 3) + 1
  const pq = q === 1 ? 4 : q - 1
  const py = q === 1 ? now.year - 1 : now.year
  const r = berlinQuarterRange(py, pq as 1 | 2 | 3 | 4)
  return { iso: toBerlinIsoDate(new Date(r.start.getTime() + 10 * 86400000)), label: `Q${pq} ${py}`, start: r.start }
}

describe('IR-03 — tax status history', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('switching to Kleinunternehmer (from today) keeps the VAT of the ended quarter', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    expect((await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 23800, vatRate: 19, transactionDate: pq.iso }))).status).toBe(201)
    const before = (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.periodLabel === pq.label)
    expect(before?.target).toBe(3800)

    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER' }))
    expect(res.status).toBe(200)
    const s = await json<{ taxType: string; taxStatusHistory: Array<{ validFrom: string | null; taxType: string }> }>(res)
    expect(s.taxType).toBe('KLEINUNTERNEHMER')
    expect(s.taxStatusHistory[0]).toMatchObject({ validFrom: toBerlinIsoDate(new Date()), taxType: 'KLEINUNTERNEHMER' })
    expect(s.taxStatusHistory[1]).toMatchObject({ validFrom: null, taxType: 'REGELBESTEUERUNG' })

    const after = await json<TaxGet>(await taxReserve.GET())
    expect(after.reserves.find(r => r.type === 'VAT' && r.periodLabel === pq.label)?.open).toBe(3800)
    // … and the payment for it can still be recorded.
    const pay = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: pq.start.toISOString(), amount: 3800 }))
    expect(pay.status).toBe(201)
    expect((await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.periodLabel === pq.label)).toBeUndefined()
  })

  it('"ALWAYS" corrects a wrong setting for the whole history', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 1000, vatRate: 0, transactionDate: pq.iso }))
    const s = await json<{ taxStatusHistory: unknown[] }>(await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER', statusEffectiveFrom: 'ALWAYS' })))
    expect(s.taxStatusHistory).toHaveLength(1)
    expect((await json<TaxGet>(await taxReserve.GET())).reserves.some(r => r.type === 'VAT')).toBe(false)
  })

  it('a first status choice before anything is recorded is the status "since always"', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    expect((await onboarding.POST(jsonRequest('/x', 'POST', { taxType: 'REGELBESTEUERUNG' }))).status).toBe(200)
    const rows = await db.taxStatusPeriod.findMany({ where: { userId: user.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].validFrom.getTime()).toBe(Date.UTC(1970, 0, 1))
    expect(rows[0].taxType).toBe('REGELBESTEUERUNG')
  })

  it('Istversteuerung needs the confirmed approval; invalid effective dates are refused', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST' }))).status).toBe(400)
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'KLEINUNTERNEHMER', statusEffectiveFrom: '2026-02-31' }))).status).toBe(400)
    const ok = await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST', istApproved: true }))
    expect(ok.status).toBe(200)
    expect((await json<{ vatMethod: string }>(ok)).vatMethod).toBe('IST')
  })
})

describe('IR-02 — Sollversteuerung with customer invoices', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('an unpaid invoice’s VAT is due now; its payment later is not counted again', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const created = await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde GmbH', totalAmount: 11900, vatRate: 19, invoiceDate: today() }))
    expect(created.status).toBe(201)
    const inv = await json<{ id: string; vatRate: number }>(created)
    expect(inv.vatRate).toBe(19)
    const p1 = await loadFinancialPosition(user.id)
    expect(p1.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.targetCents).toBe(190000)

    // Customer pays (same period here): booked, linked, VAT still 1,900 € — not 3,800 €.
    const pay = await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 11900 }))
    expect(pay.status).toBe(200)
    const t = await db.transaction.findFirstOrThrow({ where: { userId: user.id, type: 'INCOME' } })
    expect(t.receivableId).toBe(inv.id)
    expect(t.vatRate.toString()).toBe('19') // rate taken from the invoice
    const p2 = await loadFinancialPosition(user.id)
    expect(p2.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.targetCents).toBe(190000)
  })

  it('with confirmed Istversteuerung only the payment counts', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await settings.PATCH(jsonRequest('/x', 'PATCH', { vatMethod: 'IST', istApproved: true, statusEffectiveFrom: 'ALWAYS' }))
    await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 11900, vatRate: 19, invoiceDate: today() }))
    const p = await loadFinancialPosition(user.id)
    expect(p.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.targetCents).toBe(0)
  })
})

describe('IR-09 / IR-16 — payments are idempotent and dated', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('a double submit of an invoice payment books once', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'K', totalAmount: 1000, vatRate: 19 })))
    const body = { id: inv.id, addPayment: 400 }
    const [a, b] = await Promise.all([
      receivables.PATCH(keyed('/x', 'PATCH', body, 'pay-key-0001')),
      receivables.PATCH(keyed('/x', 'PATCH', body, 'pay-key-0001')),
    ])
    expect([a.status, b.status]).toEqual([200, 200])
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1)
    expect((await db.receivable.findUniqueOrThrow({ where: { id: inv.id } })).paidAmount.toString()).toBe('400')
    // A new key is a new payment.
    expect((await receivables.PATCH(keyed('/x', 'PATCH', body, 'pay-key-0002'))).status).toBe(200)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(2)
  })

  it('a retried Finanzamt payment books once and replays the first answer', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const vat = (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')!
    const body = { action: 'recordPayment', type: 'VAT', periodStart: vat.periodStart, amount: 50 }
    const first = await taxReserve.POST(keyed('/x', 'POST', body, 'tax-key-0001'))
    const again = await taxReserve.POST(keyed('/x', 'POST', body, 'tax-key-0001'))
    expect(first.status).toBe(201)
    expect(again.status).toBe(201)
    expect(again.headers.get('Idempotent-Replayed')).toBe('true')
    expect(await db.transaction.count({ where: { userId: user.id, taxPaymentType: 'VAT' } })).toBe(1)
    // The same key for another action is refused; keys are per user.
    expect((await receivables.PATCH(keyed('/x', 'PATCH', { id: 'x', addPayment: 1 }, 'tax-key-0001'))).status).toBe(409)
  })

  it('a supplier payment uses the given payment date; future dates are refused', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const bill = await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Lieferant', totalAmount: 500 })))
    const pq = previousQuarterDate()
    expect((await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: 100, paymentDate: '2999-01-01' }))).status).toBe(400)
    expect((await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: 100, vatRate: 19, paymentDate: pq.iso }))).status).toBe(200)
    const t = await db.transaction.findFirstOrThrow({ where: { userId: user.id } })
    expect(toBerlinIsoDate(t.transactionDate)).toBe(pq.iso)
  })
})

describe('IR-08 — a bank line paid to the Finanzamt is linked, not booked twice', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('offers the line, refuses a duplicate payment, and links it as the tax payment', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const pq = previousQuarterDate()
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: pq.iso }))
    const line = await json<{ id: string }>(
      await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 190, vatRate: 0, usage: 'BUSINESS', merchant: 'Finanzamt Berlin', transactionDate: today() }))
    )
    const get = await json<TaxGet>(await taxReserve.GET())
    expect(get.paymentCandidates.map(c => c.id)).toContain(line.id)
    const ended = get.reserves.find(r => r.type === 'VAT' && r.periodLabel === pq.label)!

    const dup = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: ended.periodStart, amount: 190 }))
    expect(dup.status).toBe(409)
    expect((await json<{ code: string; transactionId: string }>(dup)).transactionId).toBe(line.id)
    expect(await db.transaction.count({ where: { userId: user.id, taxPaymentType: 'VAT' } })).toBe(0)

    const link = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'linkTransaction', transactionId: line.id, type: 'VAT', periodStart: ended.periodStart }))
    expect(link.status).toBe(200)
    const after = await json<TaxGet>(await taxReserve.GET())
    expect(after.reserves.find(r => r.type === 'VAT' && r.periodLabel === pq.label)).toBeUndefined()
    expect(after.paymentCandidates).toHaveLength(0)
    // No longer a business expense (profit not reduced).
    const p = await loadFinancialPosition(user.id)
    expect(p.month.deductibleExpenseCents).toBe(0)

    // Foreign users cannot link someone else's booking.
    const other = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(other)
    const otherVat = (await json<TaxGet>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT')!
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'linkTransaction', transactionId: line.id, type: 'VAT', periodStart: otherVat.periodStart }))).status).toBe(404)
  })
})

describe('IR-06 / IR-07 — Jobcenter warnings are kept with the record', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('a future period and unclassified income are warned about, also after reload', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 900, usage: 'UNSURE', transactionDate: today() }))
    const y = berlinDate(new Date()).year
    const res = await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: `${y}-01-01`, periodEnd: `${y}-12-31` }))
    expect(res.status).toBe(201)
    const listed = await json<Array<{ warnings: string[] }>>(await jobcenter.GET())
    expect(listed[0].warnings.join(' ')).toMatch(/not ended yet/)
    expect(listed[0].warnings.join(' ')).toMatch(/not classified/)
  })
})

describe('IR-10 — stored files of a deleted account are removed durably', () => {
  beforeEach(async () => {
    await resetDatabase()
    r2().fail = false
    r2().deleted = []
    r2().objects = []
  })

  it('a storage outage queues the files, the cleanup job removes them later (incl. a raced upload)', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    await db.document.create({ data: { userId: user.id, type: 'RECEIPT', fileName: 'r.pdf', r2Key: `${user.id}/r.pdf`, mimeType: 'application/pdf' } })
    r2().objects = [`${user.id}/r.pdf`, `${user.id}/raced-upload.pdf`, 'someone-else/x.pdf']
    r2().fail = true

    const res = await account.DELETE(jsonRequest('/x', 'DELETE', { password: 'correct horse battery', confirm: 'DELETE' }))
    expect(res.status).toBe(200)
    const body = await json<{ filesPendingDeletion: number; message: string }>(res)
    expect(body.filesPendingDeletion).toBeGreaterThan(0)
    expect(body.message).toMatch(/queued/)
    expect(await db.pendingStorageDeletion.count()).toBe(2) // the file + the user prefix

    r2().fail = false
    const result = await processPendingDeletions(db, r2Storage)
    expect(result.failed).toBe(0)
    expect(await db.pendingStorageDeletion.count()).toBe(0)
    expect(r2().objects).toEqual(['someone-else/x.pdf'])
  })

  it('the cleanup endpoint is off without CRON_SECRET and refuses wrong secrets', async () => {
    const prev = process.env.CRON_SECRET
    delete process.env.CRON_SECRET
    expect((await cron.GET(new NextRequest('http://localhost/api/cron/storage-cleanup'))).status).toBe(503)
    process.env.CRON_SECRET = 'test-secret-value'
    expect((await cron.GET(new NextRequest('http://localhost/api/cron/storage-cleanup', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401)
    expect((await cron.GET(new NextRequest('http://localhost/api/cron/storage-cleanup', { headers: { authorization: 'Bearer test-secret-value' } }))).status).toBe(200)
    if (prev === undefined) delete process.env.CRON_SECRET
    else process.env.CRON_SECRET = prev
  })
})

describe('IR-13 — money in/out of a receipt is chosen by the person', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('approving without a type is refused, even if the AI reading says INCOME', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    const doc = await db.document.create({
      data: {
        userId: user.id, type: 'RECEIPT', fileName: 'r.pdf', r2Key: `${user.id}/r.pdf`, mimeType: 'application/pdf',
        status: 'NEEDS_REVIEW', reviewStatus: 'PENDING_REVIEW', ocrData: { amount: 5000, type: 'INCOME', date: today() },
      },
    })
    const res = await review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve' }), params({ id: doc.id }))
    expect(res.status).toBe(400)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(0)
  })
})

describe('Internal review of the remediation (round 2)', () => {
  beforeEach(async () => {
    await resetDatabase()
  })

  it('F1 — changing one field "since always" keeps a later status switch', async () => {
    const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 10, vatRate: 0, usage: 'BUSINESS', transactionDate: today() }))
    const y = berlinDate(new Date()).year
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { taxType: 'REGELBESTEUERUNG', statusEffectiveFrom: `${y}-01-01` }))).status).toBe(200)
    const res = await settings.PATCH(jsonRequest('/x', 'PATCH', { dauerfristverlaengerung: true, statusEffectiveFrom: 'ALWAYS' }))
    expect(res.status).toBe(200)
    const s = await json<{ taxType: string; taxStatusHistory: Array<{ validFrom: string | null; taxType: string; dauerfristverlaengerung: boolean }> }>(res)
    expect(s.taxType).toBe('REGELBESTEUERUNG')
    expect(s.taxStatusHistory).toEqual([
      expect.objectContaining({ validFrom: `${y}-01-01`, taxType: 'REGELBESTEUERUNG', dauerfristverlaengerung: true }),
      expect.objectContaining({ validFrom: null, taxType: 'KLEINUNTERNEHMER', dauerfristverlaengerung: true }),
    ])
  })

  it('F3 — the filing period changes only from 1 January', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 10, vatRate: 0, usage: 'BUSINESS', transactionDate: today() }))
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatFilingPeriod: 'MONTHLY' }))).status).toBe(400)
    const y = berlinDate(new Date()).year + 1
    expect((await settings.PATCH(jsonRequest('/x', 'PATCH', { vatFilingPeriod: 'MONTHLY', statusEffectiveFrom: `${y}-01-01` }))).status).toBe(200)
  })

  it('F4 — under Soll an already booked payment must be linked; then VAT counts once', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'K', totalAmount: 1190, vatRate: 19, invoiceDate: today() })))
    const booked = await json<{ id: string }>(await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: today() })))
    expect((await loadFinancialPosition(user.id)).uncertainties).toContain('POSSIBLE_UNLINKED_INVOICE_PAYMENT')
    expect((await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1190, alreadyBooked: true }))).status).toBe(400)
    const candidates = await json<Array<{ id: string }>>(await receivables.GET(new NextRequest('http://localhost/api/v1/receivables?paymentCandidates=1')))
    expect(candidates.map(c => c.id)).toContain(booked.id)
    expect((await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1190, alreadyBooked: true, linkTransactionId: booked.id }))).status).toBe(200)
    const p = await loadFinancialPosition(user.id)
    expect(p.reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')?.targetCents).toBe(19000)
    expect(p.uncertainties).not.toContain('POSSIBLE_UNLINKED_INVOICE_PAYMENT')
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1)
  })

  it('F6 — a legacy invoice’s date and VAT can be confirmed', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const legacy = await db.receivable.create({ data: { userId: user.id, customerName: 'Alt', totalAmount: '1190', outstandingAmount: '1190' } })
    expect((await loadFinancialPosition(user.id)).uncertainties).toContain('LEGACY_INVOICE_DATES')
    const res = await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: legacy.id, invoiceDate: today(), vatRate: 7 }))
    expect(res.status).toBe(200)
    expect((await loadFinancialPosition(user.id)).uncertainties).not.toContain('LEGACY_INVOICE_DATES')
    expect(await db.auditEvent.count({ where: { userId: user.id, entityType: 'RECEIVABLE' } })).toBe(1)
  })

  it('F7 — "all up to this period are filed and paid" settles every earlier ended period', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const y = berlinDate(new Date()).year
    for (const date of [`${y - 1}-02-10`, `${y - 1}-05-10`, `${y - 1}-08-10`]) {
      await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 1190, vatRate: 19, transactionDate: date }))
    }
    const ended = (await json<TaxGet>(await taxReserve.GET())).reserves.filter(r => r.type === 'VAT' && r.status === 'ENDED' && r.periodLabel.endsWith(String(y - 1)))
    expect(ended.length).toBeGreaterThanOrEqual(3)
    const q3 = ended.find(r => r.periodLabel === `Q3 ${y - 1}`)!
    expect((await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'settleUpTo', type: 'VAT', periodStart: q3.periodStart }))).status).toBe(200)
    const left = (await json<TaxGet>(await taxReserve.GET())).reserves.filter(r => r.type === 'VAT' && r.status === 'ENDED' && r.periodLabel.endsWith(String(y - 1)))
    expect(left.map(r => r.periodLabel)).not.toEqual(expect.arrayContaining([`Q1 ${y - 1}`, `Q2 ${y - 1}`, `Q3 ${y - 1}`]))
  })

  it('L2 — the same key with a different amount is refused, not silently replayed', async () => {
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'K', totalAmount: 1000, vatRate: 19 })))
    expect((await receivables.PATCH(keyed('/x', 'PATCH', { id: inv.id, addPayment: 100 }, 'same-key-001'))).status).toBe(200)
    expect((await receivables.PATCH(keyed('/x', 'PATCH', { id: inv.id, addPayment: 150 }, 'same-key-001'))).status).toBe(422)
    expect(await db.transaction.count({ where: { userId: user.id } })).toBe(1)
  })
})
