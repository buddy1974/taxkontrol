import { describe, it, expect, beforeEach } from 'vitest'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import * as transactions from '@/app/api/v1/transactions/route'
import { createUser, jsonRequest, params, resetDatabase, setCurrentUser, json } from './helpers'
import * as review from '@/app/api/v1/documents/[id]/review/route'
import * as transaction from '@/app/api/v1/transactions/[id]/route'

async function makeDoc(userId: string, ocrData: Prisma.InputJsonObject | null) {
  return db.document.create({
    data: { userId, type: 'RECEIPT', fileName: 'r.jpg', r2Key: `${userId}/r.jpg`, mimeType: 'image/jpeg', status: 'PROCESSED', reviewStatus: 'PENDING_REVIEW', ...(ocrData ? { ocrData } : {}) },
  })
}

const approve = (id: string, extra: Record<string, unknown> = {}) =>
  review.PATCH(jsonRequest('/x', 'PATCH', { action: 'approve', ...extra }), params({ id }))

describe('receipt review', () => {
  let user: Awaited<ReturnType<typeof createUser>>
  beforeEach(async () => {
    await resetDatabase()
    user = await createUser({ taxType: 'REGELBESTEUERUNG' })
    setCurrentUser(user)
  })

  it('nothing is booked until the user approves', async () => {
    await makeDoc(user.id, { amount: 119, vatRate: 19, date: '2026-09-10', merchant: 'Bauhaus', type: 'EXPENSE' })
    expect(await db.transaction.count()).toBe(0)
  })

  it('books exactly one transaction even when approved twice at the same time', async () => {
    const doc = await makeDoc(user.id, { amount: 119, vatRate: 19, date: '2026-09-10', merchant: 'Bauhaus', type: 'EXPENSE' })
    const results = await Promise.all([approve(doc.id), approve(doc.id), approve(doc.id)])
    const statuses = results.map(r => r.status).sort()
    expect(statuses).toEqual([200, 409, 409])
    expect(await db.transaction.count()).toBe(1)
  })

  it('user corrections win over AI values and are kept in the audit history', async () => {
    const doc = await makeDoc(user.id, { amount: 119, vatRate: 19, date: '2026-09-10', merchant: 'Bauhauss', type: 'EXPENSE' })
    const res = await approve(doc.id, { corrections: { amount: 107, vatRate: 7, merchant: 'Bauhaus', usage: 'MIXED', businessPct: 50 } })
    expect(res.status).toBe(200)
    const { linkedTransactionId } = await json<{ linkedTransactionId: string }>(res)
    const tx = await db.transaction.findUniqueOrThrow({ where: { id: linkedTransactionId } })
    expect(tx.grossAmount.toString()).toBe('107')
    expect(tx.businessAmount.toString()).toBe('50')
    expect(tx.merchant).toBe('Bauhaus')
    expect(tx.isAiClassified).toBe(true)
    const audit = await db.auditEvent.findFirstOrThrow({ where: { entityType: 'DOCUMENT', entityId: doc.id, action: 'APPROVE' } })
    expect(audit.before).toMatchObject({ ai: { merchant: 'Bauhauss', amount: 119 } })
  })

  it('refuses to approve without an amount and leaves the document open', async () => {
    const doc = await makeDoc(user.id, null)
    const res = await approve(doc.id)
    expect(res.status).toBe(400)
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).reviewStatus).toBe('PENDING_REVIEW')
    expect(await db.transaction.count()).toBe(0)
  })

  it('an approved document cannot be rejected or re-approved; deleting its booking reopens it', async () => {
    const doc = await makeDoc(user.id, { amount: 20, vatRate: 19, type: 'EXPENSE' })
    const { linkedTransactionId } = await json<{ linkedTransactionId: string }>(await approve(doc.id))
    expect((await review.PATCH(jsonRequest('/x', 'PATCH', { action: 'reject' }), params({ id: doc.id }))).status).toBe(409)
    await transaction.DELETE(jsonRequest('/x', 'DELETE'), params({ id: linkedTransactionId }))
    const reopened = await db.document.findUniqueOrThrow({ where: { id: doc.id } })
    expect(reopened.reviewStatus).toBe('PENDING_REVIEW')
    expect(reopened.linkedTransactionId).toBeNull()
    expect((await approve(doc.id)).status).toBe(200)
  })

  it('a receipt booked from the input form cannot be approved again', async () => {
    const doc = await makeDoc(user.id, { amount: 119, vatRate: 19, type: 'EXPENSE' })
    const body = { type: 'EXPENSE', grossAmount: 119, vatRate: 19, transactionDate: '2026-09-10', documentId: doc.id }
    expect((await transactions.POST(jsonRequest('/api/v1/transactions', 'POST', body))).status).toBe(201)
    expect((await approve(doc.id)).status).toBe(409)
    expect((await transactions.POST(jsonRequest('/api/v1/transactions', 'POST', body))).status).toBe(409)
    expect(await db.transaction.count()).toBe(1)
    expect((await db.document.findUniqueOrThrow({ where: { id: doc.id } })).linkedTransactionId).not.toBeNull()
  })
})
