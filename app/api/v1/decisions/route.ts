import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { spendCheck } from '@/lib/finance/position'
import { fromCents, toCents, formatEuro } from '@/lib/finance/money'
import { jsonError, parseAmount, readJsonObject, unauthorized } from '@/lib/http'

/** Quick "can I spend X?" check, based on the shared monthly position. */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const body = await readJsonObject(req)
  const amount = parseAmount(body?.amount)
  if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter an amount greater than 0.')

  const position = await loadFinancialPosition(user.id)
  const check = spendCheck(position, toCents(amount))

  let message: string
  if (position.month.count === 0) {
    message = 'There are no transactions this month yet, so TaxKontrol cannot estimate this. Add your income and expenses first.'
  } else if (check.fits) {
    message = `Probably yes: after this, about ${formatEuro(check.remainingAfterCents)} would be left from this month (estimate, not your bank balance).`
  } else if (check.leftCents <= 0) {
    message = `Not from this month's money: after taxes and open commitments the month is already ${formatEuro(Math.abs(check.leftCents))} short.`
  } else {
    message = `Not fully: only about ${formatEuro(check.leftCents)} is left from this month after taxes and commitments. You would be ${formatEuro(Math.abs(check.remainingAfterCents))} short.`
  }

  return NextResponse.json({
    requested: amount,
    canSpend: position.month.count > 0 && check.fits,
    insufficientData: position.month.count === 0,
    safeToSpend: fromCents(check.leftCents),
    remainingAfter: fromCents(check.remainingAfterCents),
    reserveShortfall: fromCents(check.reserveShortfallCents),
    bufferWarning: check.bufferWarning,
    message,
    isEstimate: true,
  })
}
