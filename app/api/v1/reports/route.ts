import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { buildMonthlyReport, parseReportMonth, presentReport } from '@/lib/finance/report'
import { unauthorized } from '@/lib/http'

export async function GET(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const period = parseReportMonth(new URL(req.url).searchParams.get('month'))
  const report = await buildMonthlyReport(user.id, period)
  return NextResponse.json(presentReport(report))
}
