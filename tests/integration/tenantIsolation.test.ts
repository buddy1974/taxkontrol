import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, params, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as transactions from '@/app/api/v1/transactions/route'
import * as transaction from '@/app/api/v1/transactions/[id]/route'
import * as review from '@/app/api/v1/documents/[id]/review/route'
import * as document from '@/app/api/v1/documents/[id]/route'
import * as taxReserve from '@/app/api/v1/tax-reserve/route'
import * as dashboard from '@/app/api/v1/dashboard/route'
import * as jobcenter from '@/app/api/v1/jobcenter/route'
import * as exportRoute from '@/app/api/v1/account/export/route'

describe('tenant isolation (user B must never see or change user A’s data)', () => {
  let a: Awaited<ReturnType<typeof createUser>>
  let b: Awaited<ReturnType<typeof createUser>>
  let aTxId: string
  let aDocId: string

  beforeEach(async () => {
    await resetDatabase()
    a = await createUser()
    b = await createUser()
    setCurrentUser(a)
    const res = await transactions.POST(
      jsonRequest('/api/v1/transactions', 'POST', { type: 'INCOME', grossAmount: 1190, vatRate: 19, usage: 'BUSINESS', transactionDate: today(), description: 'A secret invoice' })
    )
    expect(res.status).toBe(201)
    aTxId = (await json<{ id: string }>(res)).id
    aDocId = (await db.document.create({ data: { userId: a.id, type: 'RECEIPT', fileName: 'a.pdf', r2Key: `${a.id}/a.pdf`, mimeType: 'application/pdf', ocrData: { amount: 50 } } })).id
    setCurrentUser(b)
  })

  it('rejects anonymous requests', async () => {
    setCurrentUser(null)
    expect((await transactions.GET(jsonRequest('/api/v1/transactions', 'GET'))).status).toBe(401)
    expect((await dashboard.GET()).status).toBe(401)
  })

  it('lists only own transactions', async () => {
    const list = await json<unknown[]>(await transactions.GET(jsonRequest('/api/v1/transactions', 'GET')))
    expect(list).toHaveLength(0)
  })

  it('cannot read, edit or delete another user’s transaction', async () => {
    expect((await transaction.GET(jsonRequest(`/x`, 'GET'), params({ id: aTxId }))).status).toBe(404)
    expect((await transaction.PATCH(jsonRequest(`/x`, 'PATCH', { grossAmount: 1 }), params({ id: aTxId }))).status).toBe(404)
    expect((await transaction.DELETE(jsonRequest(`/x`, 'DELETE'), params({ id: aTxId }))).status).toBe(404)
    const stored = await db.transaction.findUniqueOrThrow({ where: { id: aTxId } })
    expect(stored.grossAmount.toString()).toBe('1190')
  })

  it('cannot read or review another user’s document', async () => {
    expect((await document.GET(jsonRequest('/x', 'GET'), params({ id: aDocId }))).status).toBe(404)
    expect((await review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve' }), params({ id: aDocId }))).status).toBe(404)
  })

  it('cannot link another user’s transaction to its own receipt', async () => {
    const bDoc = await db.document.create({ data: { userId: b.id, type: 'RECEIPT', fileName: 'b.pdf', r2Key: `${b.id}/b.pdf`, mimeType: 'application/pdf' } })
    const res = await review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve', linkedTransactionId: aTxId }), params({ id: bDoc.id }))
    expect(res.status).toBe(404)
    expect((await db.document.findUniqueOrThrow({ where: { id: bDoc.id } })).reviewStatus).not.toBe('APPROVED')
  })

  it('cannot update another user’s tax reserve', async () => {
    setCurrentUser(a)
    const aReserves = await json<{ reserves: Array<{ id: string }> }>(await taxReserve.GET())
    setCurrentUser(b)
    const res = await taxReserve.PATCH(jsonRequest('/x', 'PATCH', { id: aReserves.reserves[0].id, actuallyReserved: 999 }))
    expect(res.status).toBe(404)
  })

  it('dashboard, Jobcenter and export only use own data', async () => {
    const d = await json<{ month: { transactionCount: number } }>(await dashboard.GET())
    expect(d.month.transactionCount).toBe(0)
    const jc = await jobcenter.POST(jsonRequest('/x', 'POST', { type: 'EKS', periodStart: today(), periodEnd: today() }))
    expect((await json<{ totalIncome: number }>(jc)).totalIncome).toBe(0)
    const exp = await json<{ transactions: unknown[]; documents: unknown[] }>(await exportRoute.GET())
    expect(exp.transactions).toHaveLength(0)
    expect(exp.documents).toHaveLength(0)
  })
})
