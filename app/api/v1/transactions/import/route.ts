import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/log'
import { parseEuroInput } from '@/lib/finance/parseEuro'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { TransactionValidationError } from '@/lib/finance/transactionAmounts'
import { toCents } from '@/lib/finance/money'
import { createTransaction, parseTransactionInput, type TransactionInput } from '@/lib/transactions/service'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { jsonError, readJsonObject, unauthorized } from '@/lib/http'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { toBerlinIsoDate } from '@/lib/time/berlin'
import { lockFor } from '@/lib/locks'

const MAX_ITEMS = 500

function fingerprint(t: { type: string; grossCents: number; isoDate: string; text: string | null }) {
  return `${t.type}|${t.grossCents}|${t.isoDate}|${(t.text ?? '').toLocaleLowerCase('de-DE').replace(/\s+/g, ' ').trim()}`
}

/**
 * Imports reviewed bank-statement lines.
 *
 * Safety rules:
 * - A line is NEVER assumed to be business money. Unless the user explicitly
 *   classified it, it is stored as UNSURE (excluded from profit and taxes) and
 *   flagged for review.
 * - Under standard VAT taxation a bank line carries no VAT information, so
 *   lines without an explicit VAT rate are flagged for review as well.
 * - Lines that already exist (same type, amount, day and text) are skipped.
 * - All-or-nothing: if any line is invalid, nothing is imported.
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`import:${user.id}`, 20, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  const body = await readJsonObject(req)
  const items = Array.isArray(body?.items) ? (body.items as unknown[]) : null
  if (!items || items.length === 0) return jsonError(400, 'No lines to import.')
  if (items.length > MAX_ITEMS) return jsonError(400, `At most ${MAX_ITEMS} lines per import.`)

  const parsed: Array<{ input: TransactionInput; review: boolean; fp: string }> = []
  const errors: Array<{ index: number; field: string; message: string }> = []
  // Each line is checked with the VAT status valid on its date.
  const timeline = await loadTaxStatusTimeline(user.id)

  items.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') {
      errors.push({ index, field: 'item', message: 'Invalid line.' })
      return
    }
    const item = raw as Record<string, unknown>
    // A payment to / refund from the Finanzamt is not a business expense or income: it stays
    // "not sure" until the user marks it as the tax payment of a period on the Tax page.
    const mentionsFinanzamt = /finanzamt/i.test(`${typeof item.merchant === 'string' ? item.merchant : ''} ${typeof item.description === 'string' ? item.description : ''}`)
    const explicitUsage = typeof item.usage === 'string' && item.usage !== 'UNSURE' && !mentionsFinanzamt
    // Strings go through the strict euro parser ("1.234,56" = 1234.56; ambiguous input is rejected).
    const parsedAmount = typeof item.amount === 'number' ? item.amount : parseEuroInput(item.amount)
    const amount = parsedAmount === null || !Number.isFinite(parsedAmount) ? NaN : Math.abs(parsedAmount)
    const vatGiven = item.vatRate !== undefined && item.vatRate !== null && item.vatRate !== ''
    try {
      const input = parseTransactionInput({
        type: item.type,
        grossAmount: amount,
        vatRate: vatGiven ? item.vatRate : 0,
        usage: explicitUsage ? item.usage : 'UNSURE',
        businessPct: item.businessPct ?? 100,
        transactionDate: item.date ?? item.transactionDate,
        description: item.description,
        merchant: item.merchant,
        paymentMethod: 'BANK',
      })
      const vatUnknown = timeline.taxTypeAt(input.transactionDate) !== 'KLEINUNTERNEHMER' && !vatGiven && input.usage !== 'PRIVATE'
      parsed.push({
        input,
        review: !explicitUsage || vatUnknown,
        fp: fingerprint({ type: input.type, grossCents: toCents(input.grossAmount), isoDate: toBerlinIsoDate(input.transactionDate), text: input.description ?? input.merchant }),
      })
    } catch (err) {
      if (err instanceof TransactionValidationError) errors.push({ index, field: err.field, message: err.message })
      else throw err
    }
  })

  if (errors.length > 0) return jsonError(400, 'Some lines are invalid. Nothing was imported.', { errors })

  const dates = parsed.map(p => p.input.transactionDate.getTime())
  const minDate = new Date(Math.min(...dates) - 24 * 3600 * 1000)
  const maxDate = new Date(Math.max(...dates) + 24 * 3600 * 1000)

  try {
    const result = await db.$transaction(
      async tx => {
        await lockFor(tx, `import:${user.id}`)
        const existing = await tx.transaction.findMany({
          where: { userId: user.id, transactionDate: { gte: minDate, lte: maxDate } },
          select: { type: true, grossAmount: true, transactionDate: true, description: true, merchant: true },
        })
        // How many bookings with each fingerprint already exist. Each existing booking cancels
        // exactly one imported line, so overlapping statements are safe while identical lines
        // inside one statement (e.g. two 4,50 € coffees) are still imported.
        const existingCount = new Map<string, number>()
        for (const e of existing) {
          const fp = fingerprint({ type: e.type, grossCents: toCents(e.grossAmount), isoDate: toBerlinIsoDate(e.transactionDate), text: e.description ?? e.merchant })
          existingCount.set(fp, (existingCount.get(fp) ?? 0) + 1)
        }
        let created = 0
        let duplicates = 0
        let flagged = 0
        for (const p of parsed) {
          const remaining = existingCount.get(p.fp) ?? 0
          if (remaining > 0) {
            existingCount.set(p.fp, remaining - 1)
            duplicates++
            continue
          }
          await createTransaction(user.id, p.input, { source: 'IMPORT', forceReview: p.review }, tx)
          created++
          if (p.review) flagged++
        }
        return { created, duplicates, flagged }
      },
      { timeout: 30_000 }
    )
    return NextResponse.json(result, { status: 201 })
  } catch (err) {
    logError('Import error', err)
    return jsonError(500, 'Import failed. Nothing was imported.')
  }
}
