/**
 * Regression tests for the findings of the independent RC2 review (2026-10-09).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { createUser, jsonRequest, params, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as payables from '@/app/api/v1/payables/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as employees from '@/app/api/v1/employees/route'
import * as dashboard from '@/app/api/v1/dashboard/route'
import * as importRoute from '@/app/api/v1/transactions/import/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as review from '@/app/api/v1/documents/[id]/review/route'
import * as decisionCenter from '@/app/api/v1/decision-center/evaluate/route'

type Dash = { leftFromThisMonth: number; commitmentsTotal: number; month: { outflowGross: number; businessIncomeGross: number } }

describe('review finding #2: recorded payments are booked, never lost or double counted', () => {
  let user: Awaited<ReturnType<typeof createUser>>
  beforeEach(async () => {
    await resetDatabase()
    user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(user)
  })

  it('a supplier payment becomes an expense; the month does not improve by paying a bill', async () => {
    const bill = await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Druckerei Müller', totalAmount: 1000, dueDate: today() })))
    const before = await json<Dash>(await dashboard.GET())
    expect(before.commitmentsTotal).toBe(1000)

    const paid = await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: '1.000,00' }))
    expect(paid.status).toBe(200)
    expect((await json<{ bookedTransactionId: string }>(paid)).bookedTransactionId).toBeTruthy()

    const after = await json<Dash>(await dashboard.GET())
    expect(after.commitmentsTotal).toBe(0)
    expect(after.month.outflowGross).toBe(1000)
    expect(after.leftFromThisMonth).toBe(before.leftFromThisMonth) // moved from "due" to "paid"
  })

  it('a bill already booked by the user is not counted twice; alreadyBooked skips the booking', async () => {
    const bill = await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Druckerei Müller', totalAmount: 240, dueDate: today() })))
    await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 240, transactionDate: today(), merchant: 'Druckerei Müller' }))
    expect((await json<Dash>(await dashboard.GET())).commitmentsTotal).toBe(0)

    await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: 240, alreadyBooked: true }))
    expect(await db.transaction.count()).toBe(1)
  })

  it('a customer payment becomes business income', async () => {
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde C', totalAmount: 500 })))
    await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 200 }))
    await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 300 }))
    const d = await json<Dash>(await dashboard.GET())
    expect(d.month.businessIncomeGross).toBe(500)
    const r = await db.receivable.findUniqueOrThrow({ where: { id: inv.id } })
    expect(r.status).toBe('PAID')
    expect((await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 1 }))).status).toBe(400)
  })

  it('parallel payments on one invoice are all counted (no lost update)', async () => {
    const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde D', totalAmount: 300 })))
    const res = await Promise.all([1, 2, 3].map(() => receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 100 }))))
    expect(res.every(r => r.status === 200)).toBe(true)
    const r = await db.receivable.findUniqueOrThrow({ where: { id: inv.id } })
    expect(r.paidAmount.toString()).toBe('300')
    expect(await db.transaction.count()).toBe(3)
  })

  it('a salary marked paid is booked once, even on a double click', async () => {
    const emp = await json<{ id: string }>(await employees.POST(jsonRequest('/x', 'POST', { name: 'Anna', salaryAmount: 556 })))
    const res = await Promise.all([1, 2].map(() => employees.PATCH(jsonRequest('/x', 'PATCH', { id: emp.id, action: 'pay' }))))
    expect(res.map(r => r.status).sort()).toEqual([200, 409])
    expect(await db.employeePayment.count()).toBe(1)
    const tx = await db.transaction.findFirstOrThrow()
    expect(tx.grossAmount.toString()).toBe('556')
    const d = await json<Dash>(await dashboard.GET())
    expect(d.commitmentsTotal).toBe(0)
    expect(d.month.outflowGross).toBe(556)
  })
})

describe('review finding #1: corrected receipt values are never replaced by the AI reading', () => {
  let doc: { id: string }
  beforeEach(async () => {
    await resetDatabase()
    const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
    const ocrData: Prisma.InputJsonObject = { amount: 1243.56, vatRate: 19, merchant: 'Wrong Shop', date: '2026-09-01', type: 'EXPENSE' }
    doc = await db.document.create({ data: { userId: user.id, type: 'RECEIPT', fileName: 'r.jpg', r2Key: `${user.id}/r.jpg`, mimeType: 'image/jpeg', ocrData } })
  })

  const approve = (corrections: Record<string, unknown>) =>
    review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve', corrections }), params({ id: doc.id }))

  it('accepts German number format', async () => {
    const res = await approve({ amount: '1.234,56', vatRate: 19, date: '2026-09-01', merchant: 'Right Shop', type: 'EXPENSE', usage: 'BUSINESS' })
    expect(res.status).toBe(200)
    const tx = await db.transaction.findFirstOrThrow()
    expect(tx.grossAmount.toString()).toBe('1234.56')
    expect(tx.merchant).toBe('Right Shop')
  })

  it('rejects an unreadable amount instead of falling back to the AI amount', async () => {
    const res = await approve({ amount: '1.234.56', vatRate: 19, date: '2026-09-01', type: 'EXPENSE' })
    expect(res.status).toBe(400)
    expect(await db.transaction.count()).toBe(0)
  })

  it('a cleared amount is not refilled from the AI reading; a cleared merchant stays empty', async () => {
    expect((await approve({ amount: null, vatRate: 19, date: '2026-09-01', type: 'EXPENSE' })).status).toBe(400)
    expect((await approve({ amount: '50', merchant: '', vatRate: 19, date: '2026-09-01', type: 'EXPENSE' })).status).toBe(200)
    expect((await db.transaction.findFirstOrThrow()).merchant).toBeNull()
  })
})

describe('review findings #3, #8, #9', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'KLEINUNTERNEHMER' }))
  })

  it('identical lines in one statement are all imported; overlap with existing bookings is skipped once each', async () => {
    const coffee = { date: '2026-09-02', description: 'Café Bohne', amount: 4.5, type: 'EXPENSE', usage: 'BUSINESS' }
    expect(await json(await importRoute.POST(jsonRequest('/x', 'POST', { items: [coffee, coffee] })))).toMatchObject({ created: 2, duplicates: 0 })
    // Overlapping statement contains the same two coffees plus a third.
    expect(await json(await importRoute.POST(jsonRequest('/x', 'POST', { items: [coffee, coffee, coffee] })))).toMatchObject({ created: 1, duplicates: 2 })
    expect(await db.transaction.count()).toBe(3)
  })

  it('an unreadable VAT rate is rejected, not booked as 0 %', async () => {
    const res = await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 10, vatRate: '19%', transactionDate: today() }))
    expect(res.status).toBe(400)
  })

  it('the decision centre answers 400 to a null body', async () => {
    expect((await decisionCenter.POST(jsonRequest('/x', 'POST', 'null'))).status).toBe(400)
  })
})
