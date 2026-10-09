import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { loadFinancialPosition } from '@/lib/finance/loadPosition'
import { presentPosition } from '@/lib/finance/present'
import { unauthorized } from '@/lib/http'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const position = await loadFinancialPosition(user.id)
  return NextResponse.json(presentPosition(position))
}
