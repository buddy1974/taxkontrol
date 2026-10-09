import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { rateLimit, rateLimitResponse } from '@/lib/rateLimit'
import { validateUpload, UploadError } from '@/lib/upload'
import { extractStructured, fileBlock } from '@/lib/ai/claude'
import { BankStatementSchema } from '@/lib/ai/schemas'
import { jsonError, unauthorized } from '@/lib/http'
import { parseCalendarDate } from '@/lib/time/berlin'

const MAX_BYTES = 15 * 1024 * 1024

/**
 * Reads a PDF bank statement into SUGGESTED lines. Nothing is saved here.
 * The client shows the lines, the user classifies them (business / private /
 * not sure) and then imports via POST /api/v1/transactions/import.
 */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const rl = await rateLimit(`bank-statement:${user.id}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  let upload
  try {
    const formData = await req.formData()
    upload = await validateUpload(formData.get('file'), { maxBytes: MAX_BYTES, accept: ['application/pdf'] })
  } catch (err) {
    if (err instanceof UploadError) return jsonError(err.status, err.message)
    return jsonError(400, 'Could not read the upload.')
  }

  const result = await extractStructured({
    task: 'bank-statement',
    schema: BankStatementSchema,
    maxTokens: 16000,
    content: [
      fileBlock(upload.buffer.toString('base64'), 'application/pdf'),
      {
        type: 'text',
        text: 'List every booking on this German bank statement (Kontoauszug). amount is always positive; direction IN means money received, OUT means money paid. Do not include opening/closing balances. Do not guess whether a booking is business or private.',
      },
    ],
  })

  if (!result) return jsonError(422, 'The bank statement could not be read automatically. Please enter the transactions manually.')

  const transactions = result.transactions
    .filter(t => t.amount > 0 && parseCalendarDate(t.date))
    .map(t => ({
      date: t.date.slice(0, 10),
      description: t.description.slice(0, 500),
      merchant: t.merchant?.slice(0, 200) ?? null,
      amount: Math.round(t.amount * 100) / 100,
      type: t.direction === 'IN' ? ('INCOME' as const) : ('EXPENSE' as const),
    }))

  return NextResponse.json({ transactions, count: transactions.length, skipped: result.transactions.length - transactions.length })
}
