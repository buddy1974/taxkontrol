/**
 * Tenant isolation for the CRUD and guidance routes not covered by tenantIsolation.test.ts:
 * user B, holding user A's ids, gets 404 and A's rows and books stay unchanged.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, json } from './helpers'
import * as fixedCosts from '@/app/api/v1/fixed-costs/route'
import * as receivables from '@/app/api/v1/receivables/route'
import * as payables from '@/app/api/v1/payables/route'
import * as employees from '@/app/api/v1/employees/route'
import * as cases from '@/app/api/v1/guidance/cases/route'
import * as tasks from '@/app/api/v1/guidance/tasks/route'
import * as transactions from '@/app/api/v1/transactions/route'

describe('tenant isolation: CRUD and guidance routes', () => {
  let a: Awaited<ReturnType<typeof createUser>>
  let b: Awaited<ReturnType<typeof createUser>>
  const ids = { fixedCost: '', receivable: '', payable: '', employee: '', guidanceCase: '', task: '', document: '' }

  beforeEach(async () => {
    await resetDatabase()
    a = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    b = await createUser({ taxType: 'KLEINUNTERNEHMER' })
    setCurrentUser(a)
    ids.fixedCost = (await json<{ id: string }>(await fixedCosts.POST(jsonRequest('/x', 'POST', { name: 'Miete', amount: 500, frequency: 'MONTHLY', dayOfMonth: 1 })))).id
    ids.receivable = (await json<{ id: string }>(await receivables.POST(jsonRequest('/x', 'POST', { customerName: 'Kunde A', totalAmount: 900 })))).id
    ids.payable = (await json<{ id: string }>(await payables.POST(jsonRequest('/x', 'POST', { supplierName: 'Lieferant A', totalAmount: 400 })))).id
    ids.employee = (await json<{ id: string }>(await employees.POST(jsonRequest('/x', 'POST', { name: 'Mia', salaryType: 'MONTHLY', salaryAmount: 1200 })))).id
    ids.guidanceCase = (
      await db.guidanceCase.create({
        data: { userId: a.id, title: 'Brief', caseType: 'FINANZAMT', urgency: 'MEDIUM', confidenceLevel: 'LOW', preparationStatus: 'NOT_STARTED', summary: 'A' },
      })
    ).id
    ids.task = (
      await db.guidanceTask.create({ data: { userId: a.id, taskKey: 'k1', title: 'Antworten', description: 'A', category: 'UPLOAD_DOCUMENT' } })
    ).id
    ids.document = (await db.document.create({ data: { userId: a.id, type: 'RECEIPT', fileName: 'a.pdf', r2Key: `${a.id}/a.pdf`, mimeType: 'application/pdf' } })).id
    setCurrentUser(b)
  })

  async function snapshotA() {
    const [fc, r, p, e, t, c, k, d] = await Promise.all([
      db.fixedCost.findUniqueOrThrow({ where: { id: ids.fixedCost } }),
      db.receivable.findUniqueOrThrow({ where: { id: ids.receivable } }),
      db.payable.findUniqueOrThrow({ where: { id: ids.payable } }),
      db.employee.findUniqueOrThrow({ where: { id: ids.employee }, include: { payments: true } }),
      db.transaction.count({ where: { userId: a.id } }),
      db.guidanceCase.findUniqueOrThrow({ where: { id: ids.guidanceCase } }),
      db.guidanceTask.findUniqueOrThrow({ where: { id: ids.task } }),
      db.document.findUniqueOrThrow({ where: { id: ids.document } }),
    ])
    return JSON.stringify({ fc, r, p, e, t, c, k, d })
  }

  it('cannot change, pay or delete A’s fixed costs, invoices, bills, employees or guidance items', async () => {
    const before = await snapshotA()
    const statuses = [
      (await fixedCosts.PATCH(jsonRequest('/x', 'PATCH', { id: ids.fixedCost, amount: 1 }))).status,
      (await fixedCosts.DELETE(jsonRequest(`/x?id=${ids.fixedCost}`, 'DELETE'))).status,
      (await receivables.PATCH(jsonRequest('/x', 'PATCH', { id: ids.receivable, addPayment: 900 }))).status,
      (await receivables.DELETE(jsonRequest(`/x?id=${ids.receivable}`, 'DELETE'))).status,
      (await payables.PATCH(jsonRequest('/x', 'PATCH', { id: ids.payable, addPayment: 400 }))).status,
      (await payables.DELETE(jsonRequest(`/x?id=${ids.payable}`, 'DELETE'))).status,
      (await employees.PATCH(jsonRequest('/x', 'PATCH', { id: ids.employee, action: 'pay' }))).status,
      (await employees.PATCH(jsonRequest('/x', 'PATCH', { id: ids.employee, action: 'deactivate' }))).status,
      (await cases.PATCH(jsonRequest('/x', 'PATCH', { caseId: ids.guidanceCase, status: 'RESOLVED' }))).status,
      (await tasks.PATCH(jsonRequest('/x', 'PATCH', { taskId: ids.task, status: 'COMPLETED' }))).status,
    ]
    for (const s of statuses) expect(s).toBe(404)
    expect(await snapshotA()).toBe(before)
    expect(await db.transaction.count({ where: { userId: b.id } })).toBe(0)
  })

  it('filter objects instead of ids are refused (no Prisma operator injection)', async () => {
    expect((await cases.PATCH(jsonRequest('/x', 'PATCH', { caseId: { not: '' }, status: 'RESOLVED' }))).status).toBe(400)
    expect((await tasks.PATCH(jsonRequest('/x', 'PATCH', { taskId: { not: '' }, status: 'COMPLETED' }))).status).toBe(400)
  })

  it('cannot book A’s receipt from B’s input form', async () => {
    const before = await snapshotA()
    const res = await transactions.POST(jsonRequest('/x', 'POST', { type: 'EXPENSE', grossAmount: 50, transactionDate: '2026-10-01', documentId: ids.document }))
    expect(res.status).toBe(409)
    expect(await snapshotA()).toBe(before)
    expect(await db.transaction.count({ where: { userId: b.id } })).toBe(0)
  })

  it('lists contain only own rows', async () => {
    for (const list of [await fixedCosts.GET(), await receivables.GET(), await payables.GET(), await employees.GET()]) {
      expect(await json<unknown[]>(list)).toEqual([])
    }
  })
})
