/**
 * R-032 — calendar dates vs. the current instant.
 *
 * Calendar dates are stored at 12:00 UTC of their day (parseCalendarDate). Comparing them with
 * the current instant made every record dated "today" a future record until 13:00 (CET) /
 * 14:00 (CEST): it was left out of the dashboard, the tax position and safe-to-spend, and a
 * payment dated today (the default) was refused as "in the future". These tests pin the clock
 * to a Berlin morning so they fail on the old code at any time of day.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, json } from './helpers'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as payables from '@/app/api/v1/payables/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as dashboard from '@/app/api/v1/dashboard/route'
import * as dailyClose from '@/app/api/v1/daily-close/route'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { toBerlinIsoDate } from '@/lib/time/berlin'

type Dash = { month: { outflowGross: number; businessIncomeGross: number } }
type Reserve = { type: string; status: string; periodStart: string; paid: number }

const MOMENTS = [
  // 00:30 in Berlin on 2 Nov; UTC is still 1 Nov.
  { name: 'just after midnight (UTC still the day before)', instant: '2026-11-01T23:30:00Z' },
  // 08:30 in Berlin — an ordinary working morning.
  { name: 'in the morning', instant: '2026-11-02T07:30:00Z' },
  // 09:00 in Berlin in summer time (UTC+2).
  { name: 'on a summer morning', instant: '2026-07-15T07:00:00Z' },
]

for (const moment of MOMENTS) {
  describe(`records dated today count today — ${moment.name}`, () => {
    let todayIso: string
    beforeEach(async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date(moment.instant) })
      todayIso = toBerlinIsoDate(new Date())
      await resetDatabase()
    })
    afterEach(() => {
      vi.useRealTimers()
    })

    it('a booking dated today is in this month and not "dated in the future"', async () => {
      const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
      setCurrentUser(user)
      const res = await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 119, vatRate: 19, transactionDate: todayIso, merchant: 'Kunde' }))
      expect(res.status).toBe(201)
      const position = await loadFinancialPosition(user.id)
      expect(position.month.businessIncomeGrossCents).toBe(11900)
      expect(position.limitations.some(l => /dated in the future/.test(l.message))).toBe(false)
    })

    it('a Finanzamt payment without a date (= today) is accepted and counted', async () => {
      const user = await createUser({ taxType: 'REGELBESTEUERUNG' })
      setCurrentUser(user)
      const vat = (await json<{ reserves: Reserve[] }>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.status === 'CURRENT')!
      const res = await taxReserve.POST(jsonRequest('/x', 'POST', { action: 'recordPayment', type: 'VAT', periodStart: vat.periodStart, amount: 50 }))
      expect(res.status).toBe(201)
      const after = (await json<{ reserves: Reserve[] }>(await taxReserve.GET())).reserves.find(r => r.type === 'VAT' && r.periodStart === vat.periodStart)!
      expect(after.paid).toBe(50)
    })

    it('invoice and bill payments of today show in this month at once', async () => {
      const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
      setCurrentUser(user)
      const inv = await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde', totalAmount: 500 })))
      expect((await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: inv.id, addPayment: 500 }))).status).toBe(200)
      const bill = await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Druckerei', totalAmount: 200 })))
      // An explicit payment date of today is not "in the future".
      expect((await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: 200, paymentDate: todayIso }))).status).toBe(200)
      const d = await json<Dash>(await dashboard.GET())
      expect(d.month.businessIncomeGross).toBe(500)
      expect(d.month.outflowGross).toBe(200)
      expect(await db.transaction.count({ where: { userId: user.id } })).toBe(2)
    })

    it('tomorrow is still refused as a payment date or daily close', async () => {
      const user = await createUser({ taxType: 'KLEINUNTERNEHMER' })
      setCurrentUser(user)
      const tomorrow = toBerlinIsoDate(new Date(Date.now() + 24 * 3600_000))
      const bill = await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Druckerei', totalAmount: 200 })))
      expect((await payables.PATCH(jsonRequest('/x', 'PATCH', { id: bill.id, addPayment: 200, paymentDate: tomorrow }))).status).toBe(400)
      expect((await dailyClose.POST(jsonRequest('/x', 'POST', { date: tomorrow }))).status).toBe(400)
      expect((await dailyClose.POST(jsonRequest('/x', 'POST', { date: todayIso }))).status).not.toBe(400)
    })
  })
}
