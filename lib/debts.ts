import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { centsToDecimalString } from '@/lib/finance/transactionAmounts'
import { fromCents, toCents } from '@/lib/finance/money'
import { isPastDue, parseCalendarDate } from '@/lib/time/berlin'
import { jsonError, notFound, optionalString, parseAmount, readJsonObject, unauthorized } from '@/lib/http'

/**
 * Shared logic for open customer invoices (receivables) and supplier bills
 * (payables). Partial payments are tracked as a cumulative paid amount that
 * can never exceed the total. "Overdue" is derived from the due date when
 * reading — it is never stored, so it cannot go stale.
 */
type Kind = 'receivable' | 'payable'
type Status = 'OPEN' | 'PARTIAL' | 'PAID'

interface Row {
  id: string
  totalAmount: { toString(): string }
  paidAmount: { toString(): string }
  outstandingAmount: { toString(): string }
  dueDate: Date | null
  status: string
  description: string | null
  createdAt: Date
  updatedAt: Date
}

export function debtStatus(totalCents: number, paidCents: number): Status {
  if (paidCents >= totalCents) return 'PAID'
  return paidCents > 0 ? 'PARTIAL' : 'OPEN'
}

function present(r: Row & Record<string, unknown>, now = new Date()) {
  const outstanding = toCents(r.outstandingAmount)
  return {
    ...r,
    totalAmount: fromCents(toCents(r.totalAmount)),
    paidAmount: fromCents(toCents(r.paidAmount)),
    outstandingAmount: fromCents(outstanding),
    isOverdue: outstanding > 0 && isPastDue(r.dueDate, now),
  }
}

const nameField = (kind: Kind) => (kind === 'receivable' ? 'customerName' : 'supplierName')

// Prisma delegates for the two models have the same shape for what we use.
function delegate(kind: Kind) {
  return (kind === 'receivable' ? db.receivable : db.payable) as unknown as {
    findMany(args: unknown): Promise<Array<Row & Record<string, unknown>>>
    findFirst(args: unknown): Promise<(Row & Record<string, unknown>) | null>
    create(args: unknown): Promise<Row & Record<string, unknown>>
    update(args: unknown): Promise<Row & Record<string, unknown>>
    delete(args: unknown): Promise<unknown>
  }
}

export function debtRoutes(kind: Kind) {
  const label = kind === 'receivable' ? 'customer' : 'supplier'

  async function GET() {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const rows = await delegate(kind).findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } })
    return NextResponse.json(rows.map(r => present(r)))
  }

  async function POST(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const body = await readJsonObject(req)
    const name = optionalString(body?.[nameField(kind)], 160)
    const total = parseAmount(body?.totalAmount)
    if (!name) return jsonError(400, `Please enter the ${label} name.`, { field: nameField(kind) })
    if (total === undefined || total <= 0) return jsonError(400, 'Please enter an amount greater than 0.', { field: 'totalAmount' })
    let dueDate: Date | null = null
    if (body?.dueDate) {
      dueDate = parseCalendarDate(body.dueDate)
      if (!dueDate) return jsonError(400, 'Please enter a valid due date.', { field: 'dueDate' })
    }
    const totalCents = toCents(total)
    const row = await delegate(kind).create({
      data: {
        userId: user.id,
        [nameField(kind)]: name,
        description: optionalString(body?.description, 500) ?? null,
        totalAmount: centsToDecimalString(totalCents),
        paidAmount: '0',
        outstandingAmount: centsToDecimalString(totalCents),
        dueDate,
        status: 'OPEN',
      },
    })
    return NextResponse.json(present(row), { status: 201 })
  }

  /** Body: { id, paidAmount } (total paid so far) or { id, addPayment } (one more partial payment). */
  async function PATCH(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const body = await readJsonObject(req)
    const id = typeof body?.id === 'string' ? body.id : null
    if (!id) return jsonError(400, 'id is required.')
    const existing = await delegate(kind).findFirst({ where: { id, userId: user.id } })
    if (!existing) return notFound()

    const totalCents = toCents(existing.totalAmount)
    let paidCents: number
    if (body?.addPayment !== undefined) {
      const add = parseAmount(body.addPayment)
      if (add === undefined || add <= 0) return jsonError(400, 'Please enter a payment greater than 0.', { field: 'addPayment' })
      paidCents = toCents(existing.paidAmount) + toCents(add)
    } else {
      const paid = parseAmount(body?.paidAmount)
      if (paid === undefined) return jsonError(400, 'Please enter the amount paid so far (0 or more).', { field: 'paidAmount' })
      paidCents = toCents(paid)
    }
    if (paidCents > totalCents) {
      return jsonError(400, `Paid amount cannot be more than the total (${fromCents(totalCents).toFixed(2)} €).`, { field: 'paidAmount' })
    }

    const updated = await delegate(kind).update({
      where: { id: existing.id },
      data: {
        paidAmount: centsToDecimalString(paidCents),
        outstandingAmount: centsToDecimalString(totalCents - paidCents),
        status: debtStatus(totalCents, paidCents),
      },
    })
    return NextResponse.json(present(updated))
  }

  async function DELETE(req: NextRequest) {
    const user = await requireCurrentUser()
    if (!user) return unauthorized()
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return jsonError(400, 'id is required.')
    const existing = await delegate(kind).findFirst({ where: { id, userId: user.id } })
    if (!existing) return notFound()
    await delegate(kind).delete({ where: { id: existing.id } })
    return NextResponse.json({ success: true })
  }

  return { GET, POST, PATCH, DELETE }
}
