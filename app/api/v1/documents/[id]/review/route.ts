import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/log'
import { db } from '@/lib/db'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { limitWrites } from '@/lib/rateLimit'
import { TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { createTransaction, getTaxType, parseTransactionInput } from '@/lib/transactions/service'
import { recordAudit } from '@/lib/audit'
import { jsonError, notFound, readJsonObject, unauthorized } from '@/lib/http'
import { toBerlinIsoDate } from '@/lib/time/berlin'
import { parseEuroInput } from '@/lib/finance/parseEuro'

interface Props {
  params: Promise<{ id: string }>
}

interface OcrData {
  merchant?: unknown
  amount?: unknown
  vatRate?: unknown
  date?: unknown
  description?: unknown
  type?: unknown
}

class AlreadyApprovedError extends Error {}

const NOT_APPROVED = { OR: [{ reviewStatus: null }, { reviewStatus: { not: 'APPROVED' } }] }

function sanitizeCorrections(raw: unknown) {
  if (!raw || typeof raw !== 'object') return {}
  const c = raw as Record<string, unknown>
  const s = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : undefined)
  const n = (v: unknown) => parseEuroInput(v) ?? undefined
  return {
    merchant: s(c.merchant, 200),
    description: s(c.description, 500),
    notes: s(c.notes, 1000),
    date: s(c.date, 10),
    amount: n(c.amount),
    vatRate: n(c.vatRate),
    businessPct: n(c.businessPct),
    type: c.type === 'INCOME' || c.type === 'EXPENSE' ? c.type : undefined,
    usage: typeof c.usage === 'string' ? c.usage : undefined,
  }
}

/**
 * Review an AI-read receipt. Nothing is booked until the user approves it.
 * - approve: books ONE transaction from the user-verified values (or links an
 *   existing transaction of the same user) and locks the document.
 * - reject: marks the document rejected; nothing is booked.
 * The original AI output (ocrData) is kept; each review is written to the audit log.
 */
export async function PATCH(req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const existing = await db.document.findFirst({
    where: { id, userId: user.id },
    select: { id: true, type: true, ocrData: true, reviewStatus: true, linkedTransactionId: true, correctionData: true },
  })
  if (!existing) return notFound()
  if (existing.reviewStatus === 'APPROVED') {
    return jsonError(409, 'This document has already been approved. Edit the booked transaction instead.')
  }

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body')
  const action = body.action
  if (action !== 'approve' && action !== 'reject') return jsonError(400, 'action must be "approve" or "reject"')

  const corrections = sanitizeCorrections(body.corrections)
  const ocr = (existing.ocrData as OcrData | null) ?? {}
  // When the user submits the review form, their values are final: a cleared or
  // unreadable field must never be silently replaced by the AI reading.
  const userSubmitted = !!body.corrections && typeof body.corrections === 'object'
  if (userSubmitted) {
    const raw = body.corrections as Record<string, unknown>
    if (raw.amount !== undefined && raw.amount !== null && raw.amount !== '' && corrections.amount === undefined) {
      return jsonError(400, 'The amount could not be read. Please write it like 1234,56.', { field: 'amount' })
    }
  }

  if (action === 'reject') {
    const updated = await db.$transaction(async tx => {
      const res = await tx.document.updateMany({
        where: { id, userId: user.id, ...NOT_APPROVED },
        data: { reviewStatus: 'REJECTED', approvedAt: null, correctionData: corrections, status: 'NEEDS_REVIEW' },
      })
      if (res.count === 0) throw new AlreadyApprovedError()
      await recordAudit({ userId: user.id, entityType: 'DOCUMENT', entityId: id, action: 'REJECT', after: corrections }, tx)
      return tx.document.findUniqueOrThrow({ where: { id }, select: { id: true, reviewStatus: true, status: true } })
    }).catch(err => (err instanceof AlreadyApprovedError ? null : Promise.reject(err)))
    if (!updated) return jsonError(409, 'This document has already been approved.')
    return NextResponse.json({ success: true, ...updated, transactionCreated: false })
  }

  // ── approve ──
  if (existing.type !== 'RECEIPT' && existing.type !== 'INVOICE') {
    return jsonError(400, 'Only receipts and invoices can be booked. Letters from the Finanzamt are handled under Guidance.')
  }
  const linkId = typeof body.linkedTransactionId === 'string' ? body.linkedTransactionId : null
  if (linkId) {
    const owned = await db.transaction.findFirst({ where: { id: linkId, userId: user.id }, select: { id: true } })
    if (!owned) return jsonError(404, 'The transaction to link was not found.')
  }

  // Money in or out decides profit and taxes: it must be chosen by the person, never taken from
  // the AI reading (a manipulated receipt could otherwise be booked as income).
  const chosenType = corrections.type ?? body.type
  if (chosenType !== 'INCOME' && chosenType !== 'EXPENSE') {
    return jsonError(400, 'Please choose whether this is money in or money out.', { field: 'type' })
  }
  const ocrAmount = typeof ocr.amount === 'number' ? ocr.amount : undefined
  const ocrVat = typeof ocr.vatRate === 'number' ? ocr.vatRate : undefined
  const fromAi = !userSubmitted
  const resolvedVat: number | undefined = corrections.vatRate ?? (fromAi ? ocrVat : undefined)
  const finalValues = {
    type: chosenType,
    grossAmount: corrections.amount ?? (fromAi ? ocrAmount : undefined),
    vatRate: resolvedVat ?? 0,
    usage: corrections.usage ?? 'BUSINESS',
    businessPct: corrections.businessPct ?? 100,
    transactionDate: corrections.date || (fromAi && typeof ocr.date === 'string' ? ocr.date : undefined) || toBerlinIsoDate(new Date()),
    merchant: corrections.merchant !== undefined ? corrections.merchant || null : fromAi && typeof ocr.merchant === 'string' ? ocr.merchant : null,
    description: corrections.description !== undefined ? corrections.description || null : fromAi && typeof ocr.description === 'string' ? ocr.description : null,
    paymentMethod: 'BANK',
  }

  try {
    const result = await db.$transaction(async tx => {
      // Claim the document first: a concurrent second approval blocks on this row
      // and then matches zero rows, so it can never book a duplicate.
      const claim = await tx.document.updateMany({
        where: { id, userId: user.id, ...NOT_APPROVED },
        data: { reviewStatus: 'APPROVED', approvedAt: new Date(), status: 'DONE', correctionData: corrections },
      })
      if (claim.count === 0) throw new AlreadyApprovedError()

      let transactionId = existing.linkedTransactionId ?? linkId
      let created = false
      if (!transactionId) {
        if (finalValues.grossAmount === undefined) {
          throw new TransactionValidationError('amount', 'Please enter the receipt amount before approving.')
        }
        const input = parseTransactionInput(finalValues as Record<string, unknown>)
        // Without a known VAT rate a VAT-registered user's booking is flagged, never silently 0 %.
        const vatUnknown = resolvedVat === undefined && (await getTaxType(user.id, tx)) !== 'KLEINUNTERNEHMER'
        const t = await createTransaction(user.id, input, { source: 'USER', documentId: id, isAiClassified: true, forceReview: vatUnknown }, tx)
        transactionId = t.id
        created = true
      }
      await tx.document.update({ where: { id }, data: { linkedTransactionId: transactionId } })
      await recordAudit(
        {
          userId: user.id,
          entityType: 'DOCUMENT',
          entityId: id,
          action: 'APPROVE',
          before: { ai: ocr as Record<string, unknown> },
          after: { values: finalValues, corrections, transactionId },
        },
        tx
      )
      return { transactionId, created }
    })
    return NextResponse.json({
      success: true,
      id,
      reviewStatus: 'APPROVED',
      status: 'DONE',
      transactionCreated: result.created,
      linkedTransactionId: result.transactionId,
    })
  } catch (err) {
    if (err instanceof AlreadyApprovedError) return jsonError(409, 'This document has already been approved.')
    if (err instanceof TransactionValidationError) return jsonError(400, err.message, { field: err.field })
    logError('Document review error', err)
    return jsonError(500, 'Review update failed')
  }
}
