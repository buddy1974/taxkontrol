import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, params, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as transactions from '@/app/api/v1/transactions/route'
import * as transaction from '@/app/api/v1/transactions/[id]/route'
import * as importRoute from '@/app/api/v1/transactions/import/route'

const post = (body: unknown) => transactions.POST(jsonRequest('/api/v1/transactions', 'POST', body))

describe('POST /api/v1/transactions', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'REGELBESTEUERUNG' }))
  })

  it.each([
    [{ type: 'INCOME', grossAmount: 0, transactionDate: today() }, 'grossAmount'],
    [{ type: 'INCOME', grossAmount: -5, transactionDate: today() }, 'grossAmount'],
    [{ type: 'GIFT', grossAmount: 5, transactionDate: today() }, 'type'],
    [{ type: 'EXPENSE', grossAmount: 5, transactionDate: 'yesterday' }, 'transactionDate'],
    [{ type: 'EXPENSE', grossAmount: 5, vatRate: 16, transactionDate: today() }, 'vatRate'],
    [{ type: 'EXPENSE', grossAmount: 5, usage: 'MIXED', businessPct: 150, transactionDate: today() }, 'businessPct'],
    [{ type: 'EXPENSE', grossAmount: 5, usage: 'SOMETIMES', transactionDate: today() }, 'usage'],
    [{ type: 'EXPENSE', grossAmount: 5, categoryId: 'cat-does-not-exist', transactionDate: today() }, 'categoryId'],
  ])('rejects invalid input %o', async (body, field) => {
    const res = await post(body)
    expect(res.status).toBe(400)
    expect((await json<{ field: string }>(res)).field).toBe(field)
  })

  it('rejects malformed JSON', async () => {
    expect((await transactions.POST(jsonRequest('/api/v1/transactions', 'POST', '{nope'))).status).toBe(400)
  })

  it('a private expense is never deductible, whatever businessPct the client sends', async () => {
    const res = await post({ type: 'EXPENSE', grossAmount: 119, vatRate: 19, usage: 'PRIVATE', businessPct: 100, transactionDate: today() })
    const tx = await json<{ businessAmount: number; businessPct: number; privateAmount: number }>(res)
    expect(tx.businessPct).toBe(0)
    expect(tx.businessAmount).toBe(0)
    expect(tx.privateAmount).toBe(119)
  })

  it('stores exact cents for a mixed expense', async () => {
    const res = await post({ type: 'EXPENSE', grossAmount: '59.50', vatRate: 19, usage: 'MIXED', businessPct: 70, transactionDate: today() })
    const tx = await json<{ netAmount: number; businessAmount: number; privateAmount: number }>(res)
    expect(tx).toMatchObject({ netAmount: 50, businessAmount: 35, privateAmount: 17.85 })
  })

  it('Kleinunternehmer: income with VAT is refused, expenses are gross', async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'KLEINUNTERNEHMER' }))
    expect((await post({ type: 'INCOME', grossAmount: 119, vatRate: 19, transactionDate: today() })).status).toBe(400)
    const tx = await json<{ businessAmount: number; vatAmount: number }>(await post({ type: 'EXPENSE', grossAmount: 119, vatRate: 19, transactionDate: today() }))
    expect(tx).toMatchObject({ businessAmount: 119, vatAmount: 0 })
  })

  it('records create, update and delete in the audit history', async () => {
    const created = await json<{ id: string }>(await post({ type: 'EXPENSE', grossAmount: 100, vatRate: 19, transactionDate: today(), merchant: 'Shop' }))
    const patched = await transaction.PATCH(jsonRequest('/x', 'PATCH', { usage: 'MIXED', businessPct: 50 }), params({ id: created.id }))
    expect(patched.status).toBe(200)
    expect((await json<{ businessAmount: number }>(patched)).businessAmount).toBe(42.02)

    const detail = await json<{ history: Array<{ action: string; before: Record<string, unknown>; after: Record<string, unknown> }> }>(
      await transaction.GET(jsonRequest('/x', 'GET'), params({ id: created.id }))
    )
    expect(detail.history.map(h => h.action)).toEqual(['UPDATE', 'CREATE'])
    expect(detail.history[0].before).toMatchObject({ usage: 'BUSINESS', businessPct: 100 })
    expect(detail.history[0].after).toMatchObject({ usage: 'MIXED', businessPct: 50 })

    expect((await transaction.DELETE(jsonRequest('/x', 'DELETE'), params({ id: created.id }))).status).toBe(200)
    const events = await db.auditEvent.findMany({ where: { entityId: created.id }, orderBy: { createdAt: 'asc' } })
    expect(events.map(e => e.action)).toEqual(['CREATE', 'UPDATE', 'DELETE'])
  })

  it('clamps list pagination', async () => {
    const res = await transactions.GET(jsonRequest('/api/v1/transactions?limit=999999&offset=-5', 'GET'))
    expect(res.status).toBe(200)
  })
})

describe('POST /api/v1/transactions/import', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(await createUser({ taxType: 'REGELBESTEUERUNG' }))
  })

  const lines = [
    { date: '2026-09-01', description: 'Kunde A Rechnung 12', amount: 1190, type: 'INCOME' },
    { date: '2026-09-02', description: 'Ueberweisung Mama', amount: 500, type: 'INCOME' },
    { date: '2026-09-03', description: 'REWE', amount: 42.3, type: 'EXPENSE' },
  ]

  it('never assumes business: unclassified lines are UNSURE and flagged', async () => {
    const res = await importRoute.POST(jsonRequest('/x', 'POST', { items: lines }))
    expect(res.status).toBe(201)
    expect(await json(res)).toEqual({ created: 3, duplicates: 0, flagged: 3 })
    const rows = await db.transaction.findMany()
    expect(rows.every(r => r.usage === 'UNSURE' && r.needsReview && r.businessAmount.toString() === '0')).toBe(true)
  })

  it('keeps explicit user classification and skips duplicates on re-import', async () => {
    const classified = [{ ...lines[0], usage: 'BUSINESS', vatRate: 19 }, { ...lines[1], usage: 'PRIVATE' }, lines[2]]
    expect(await json(await importRoute.POST(jsonRequest('/x', 'POST', { items: classified })))).toEqual({ created: 3, duplicates: 0, flagged: 1 })
    expect(await json(await importRoute.POST(jsonRequest('/x', 'POST', { items: classified })))).toEqual({ created: 0, duplicates: 3, flagged: 0 })
    const income = await db.transaction.findFirstOrThrow({ where: { description: 'Kunde A Rechnung 12' } })
    expect(income.businessAmount.toString()).toBe('1000')
  })

  it('is all-or-nothing when one line is invalid', async () => {
    const res = await importRoute.POST(jsonRequest('/x', 'POST', { items: [...lines, { date: 'bad', description: 'x', amount: 5, type: 'EXPENSE' }] }))
    expect(res.status).toBe(400)
    expect((await json<{ errors: Array<{ index: number }> }>(res)).errors[0].index).toBe(3)
    expect(await db.transaction.count()).toBe(0)
  })
})
