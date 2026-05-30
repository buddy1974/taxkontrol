import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import type { TransactionType } from '@prisma/client'

interface Props {
  params: Promise<{ id: string }>
}

// Valid review actions
type ReviewAction = 'approve' | 'reject'

interface ReviewBody {
  action: ReviewAction
  corrections?: {
    merchant?: string | null
    amount?: number | null
    date?: string | null
    description?: string | null
    notes?: string | null
  }
  linkedTransactionId?: string | null
}

interface OcrData {
  merchant?: string | null
  amount?: number | null
  vatRate?: number | null
  date?: string | null
  description?: string | null
  type?: string | null
}

export async function PATCH(req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Ownership check (+ fields needed to book a transaction on approval)
    const existing = await db.document.findUnique({
      where: { id },
      select: {
        userId: true,
        status: true,
        ocrData: true,
        reviewStatus: true,
        linkedTransactionId: true,
      },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (existing.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Parse and validate body
    let body: ReviewBody
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { action, corrections, linkedTransactionId } = body

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json(
        { error: 'action must be "approve" or "reject"' },
        { status: 400 }
      )
    }

    // Sanitize corrections — only expected fields
    const safeCorrections = corrections
      ? {
          merchant: typeof corrections.merchant === 'string' ? corrections.merchant.slice(0, 200) : undefined,
          amount: typeof corrections.amount === 'number' && isFinite(corrections.amount) ? corrections.amount : undefined,
          date: typeof corrections.date === 'string' ? corrections.date.slice(0, 10) : undefined,
          description: typeof corrections.description === 'string' ? corrections.description.slice(0, 500) : undefined,
          notes: typeof corrections.notes === 'string' ? corrections.notes.slice(0, 1000) : undefined,
        }
      : undefined

    // --- Reject path: mark rejected, leave status as NEEDS_REVIEW, never book ---
    if (action === 'reject') {
      const updated = await db.document.update({
        where: { id },
        data: {
          reviewStatus: 'REJECTED',
          approvedAt: null,
          correctionData: safeCorrections,
          status: 'NEEDS_REVIEW',
        },
        select: { id: true, reviewStatus: true, status: true },
      })
      return NextResponse.json({
        success: true,
        id: updated.id,
        reviewStatus: updated.reviewStatus,
        status: updated.status,
        transactionCreated: false,
      })
    }

    // --- Approve path: book a transaction from the verified values ---
    const ocr: OcrData = (existing.ocrData as OcrData | null) ?? {}

    // Final values: user corrections take priority over raw OCR.
    const merchant = safeCorrections?.merchant ?? (typeof ocr.merchant === 'string' ? ocr.merchant : null)
    const description = safeCorrections?.description ?? (typeof ocr.description === 'string' ? ocr.description : null)
    const rawAmount = safeCorrections?.amount ?? (typeof ocr.amount === 'number' ? ocr.amount : null)
    const rawDate = safeCorrections?.date ?? (typeof ocr.date === 'string' ? ocr.date : null)
    const vatRate = typeof ocr.vatRate === 'number' && isFinite(ocr.vatRate) ? ocr.vatRate : 0
    const txType: TransactionType = ocr.type === 'INCOME' ? 'INCOME' : 'EXPENSE'

    // Reuse an already-linked transaction (idempotent re-approval) or a caller-supplied link.
    const alreadyLinked = existing.linkedTransactionId ?? (typeof linkedTransactionId === 'string' ? linkedTransactionId : null)

    let bookedTransactionId: string | null = alreadyLinked
    let transactionCreated = false

    const canBook =
      !alreadyLinked &&
      typeof rawAmount === 'number' &&
      isFinite(rawAmount) &&
      rawAmount > 0

    if (canBook) {
      const gross = rawAmount as number
      const net = gross / (1 + vatRate / 100)
      const vat = gross - net
      // Receipts default to fully business-deductible; user can adjust later in /transactions.
      const businessAmount = net
      const parsedDate = rawDate ? new Date(rawDate) : new Date()
      const transactionDate = isNaN(parsedDate.getTime()) ? new Date() : parsedDate

      const tx = await db.transaction.create({
        data: {
          userId: user.id,
          documentId: id,
          type: txType,
          amount: gross,
          grossAmount: gross,
          netAmount: parseFloat(net.toFixed(2)),
          vatAmount: parseFloat(vat.toFixed(2)),
          vatRate,
          description,
          merchant,
          businessAmount: parseFloat(businessAmount.toFixed(2)),
          privateAmount: 0,
          transactionDate,
        },
        select: { id: true },
      })
      bookedTransactionId = tx.id
      transactionCreated = true
    }

    const updated = await db.document.update({
      where: { id },
      data: {
        reviewStatus: 'APPROVED',
        approvedAt: new Date(),
        correctionData: safeCorrections,
        linkedTransactionId: bookedTransactionId,
        status: 'DONE',
      },
      select: { id: true, reviewStatus: true, status: true },
    })

    return NextResponse.json({
      success: true,
      id: updated.id,
      reviewStatus: updated.reviewStatus,
      status: updated.status,
      transactionCreated,
      linkedTransactionId: bookedTransactionId,
    })
  } catch (err) {
    console.error('Document review error:', err)
    return NextResponse.json({ error: 'Review update failed' }, { status: 500 })
  }
}
