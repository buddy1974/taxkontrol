import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { buildMonthlyReport, parseReportMonth, reportAsText } from '@/lib/finance/report'
import { recordAudit } from '@/lib/audit'
import { unauthorized } from '@/lib/http'

/** Monthly overview as a plain-text download (route name kept for compatibility). */
export async function GET(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const period = parseReportMonth(new URL(req.url).searchParams.get('month'))
  const report = await buildMonthlyReport(user.id, period)
  const content = reportAsText(report)
  await recordAudit({ userId: user.id, entityType: 'ACCOUNT', entityId: user.id, action: 'EXPORT', after: { report: 'monthly', ...period } })

  const name = `taxkontrol-${period.year}-${String(period.month).padStart(2, '0')}.txt`
  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
    },
  })
}
