import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { createUser, jsonRequest, resetDatabase, setCurrentUser, today, json } from './helpers'
import * as account from '@/app/api/v1/account/route'
import * as exportRoute from '@/app/api/v1/account/export/route'
import * as transactions from '@/app/api/v1/transactions/route'
import * as register from '@/app/api/v1/auth/register/route'
import * as contact from '@/app/api/v1/contact/route'

describe('account deletion and export', () => {
  let a: Awaited<ReturnType<typeof createUser>>
  let b: Awaited<ReturnType<typeof createUser>>

  beforeEach(async () => {
    await resetDatabase()
    a = await createUser({ password: 'correct horse battery' })
    b = await createUser()
    for (const u of [a, b]) {
      setCurrentUser(u)
      await transactions.POST(jsonRequest('/x', 'POST', { type: 'INCOME', grossAmount: 100, transactionDate: today() }))
      await db.document.create({ data: { userId: u.id, type: 'RECEIPT', fileName: 'r.pdf', r2Key: `${u.id}/r.pdf`, mimeType: 'application/pdf' } })
      await db.employee.create({ data: { userId: u.id, name: 'Emp', salaryAmount: 556, payments: { create: { amount: 556, period: new Date() } } } })
    }
    setCurrentUser(a)
  })

  it('export contains own data and never the password hash', async () => {
    const res = await exportRoute.GET()
    const text = await res.text()
    expect(text).not.toContain('passwordHash')
    const data = JSON.parse(text) as { transactions: unknown[]; profile: { email: string } }
    expect(data.profile.email).toBe(a.email)
    expect(data.transactions).toHaveLength(1)
  })

  it('requires the password and an explicit confirmation', async () => {
    expect((await account.DELETE(jsonRequest('/x', 'DELETE', { password: 'correct horse battery' }))).status).toBe(400)
    expect((await account.DELETE(jsonRequest('/x', 'DELETE', { password: 'wrong', confirm: 'DELETE' }))).status).toBe(403)
    expect(await db.user.count()).toBe(2)
  })

  it('deletes everything of this user and nothing of anyone else', async () => {
    const res = await account.DELETE(jsonRequest('/x', 'DELETE', { password: 'correct horse battery', confirm: 'LÖSCHEN' }))
    expect(res.status).toBe(200)
    expect(await db.user.findUnique({ where: { id: a.id } })).toBeNull()
    expect(await db.transaction.count({ where: { userId: a.id } })).toBe(0)
    expect(await db.document.count({ where: { userId: a.id } })).toBe(0)
    expect(await db.auditEvent.count({ where: { userId: a.id } })).toBe(0)
    // user B untouched
    expect(await db.transaction.count({ where: { userId: b.id } })).toBe(1)
    expect(await db.employeePayment.count()).toBe(1)
  })
})

describe('registration and contact form', () => {
  beforeEach(async () => {
    await resetDatabase()
    setCurrentUser(null)
  })

  it('validates registration input and does not leak ids', async () => {
    const reg = (body: unknown) => register.POST(jsonRequest('/api/v1/auth/register', 'POST', body))
    expect((await reg({ name: 'A', email: 'not-an-email', password: 'long enough pw' })).status).toBe(400)
    expect((await reg({ name: 'A', email: 'a@b.de', password: 'short' })).status).toBe(400)
    expect((await reg({ name: 'A', email: 'a@b.de', password: 'x'.repeat(73) })).status).toBe(400)
    const ok = await reg({ name: ' Anna ', email: ' Anna@Example.DE ', password: 'long enough pw' })
    expect(ok.status).toBe(201)
    expect(await json(ok)).toEqual({ success: true })
    const stored = await db.user.findFirstOrThrow()
    expect(stored.email).toBe('anna@example.de')
    expect(stored.passwordHash).not.toContain('long enough pw')
    expect((await reg({ name: 'B', email: 'anna@example.de', password: 'long enough pw' })).status).toBe(409)
  })

  it('does not pretend success when the contact message cannot be delivered', async () => {
    delete process.env.TELEGRAM_BOT_TOKEN
    const res = await contact.POST(jsonRequest('/api/v1/contact', 'POST', { name: 'Max', email: 'max@example.de', message: 'Ich brauche Hilfe mit meinem Finanzamt-Brief bitte.' }))
    expect(res.status).toBe(503)
  })
})
