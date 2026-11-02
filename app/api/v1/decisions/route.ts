import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { limitWrites } from '@/lib/rateLimit'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { spendCheck } from '@/lib/finance/position'
import { fromCents, toCents, formatEuro } from '@/lib/finance/money'
import { jsonError, parseAmount, readJsonObject, unauthorized } from '@/lib/http'
import { uncertaintyText } from '@/lib/finance/uncertainty'

/** Quick "can I spend X?" check, based on the shared monthly position. */
export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const limited = await limitWrites(user.id)
  if (limited) return limited

  const body = await readJsonObject(req)
  const amount = parseAmount(body?.amount)
  if (amount === undefined || amount <= 0) return jsonError(400, 'Please enter an amount greater than 0.')

  const position = await loadFinancialPosition(user.id)
  const check = spendCheck(position, toCents(amount))

  const uncertain = check.uncertainties.length > 0
  let message: string
  if (position.month.count === 0) {
    message = 'There are no transactions this month yet, so TaxKontrol cannot estimate this. Add your income and expenses first.'
  } else if (check.fits && uncertain) {
    message = `Maybe, but not reliably: about ${formatEuro(check.remainingAfterCents)} would be left, yet ${check.uncertainties.map(uncertaintyText).join(' ')} Clear this up first.`
  } else if (check.fits) {
    message = `Probably yes: after this, about ${formatEuro(check.remainingAfterCents)} would be left (estimate, not your bank balance).`
  } else if (check.leftCents <= 0) {
    message = `Not from this month's money: after taxes (including unreserved taxes of earlier periods) and open commitments you are already ${formatEuro(Math.abs(check.leftCents))} short.`
  } else {
    message = `Not fully: only about ${formatEuro(check.leftCents)} is left from this month after taxes and commitments. You would be ${formatEuro(Math.abs(check.remainingAfterCents))} short.`
  }

  return NextResponse.json({
    requested: amount,
    canSpend: position.month.count > 0 && check.fits && !uncertain,
    uncertainties: check.uncertainties.map(code => ({ code, message: uncertaintyText(code) })),
    insufficientData: position.month.count === 0,
    safeToSpend: fromCents(check.leftCents),
    remainingAfter: fromCents(check.remainingAfterCents),
    reserveShortfall: fromCents(check.reserveShortfallCents),
    bufferWarning: check.bufferWarning,
    message,
    isEstimate: true,
  })
}
