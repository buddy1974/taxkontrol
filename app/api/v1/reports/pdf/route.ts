import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userId = session.user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const [user, transactions] = await Promise.all([
    db.user.findUnique({ where: { id: userId } }),
    db.transaction.findMany({
      where: { userId, transactionDate: { gte: startOfMonth, lte: endOfMonth } },
      include: { category: true },
      orderBy: { transactionDate: 'asc' },
    }),
  ])

  const income = transactions.filter((t: any) => t.type === 'INCOME')
  const expenses = transactions.filter((t: any) => t.type === 'EXPENSE')

  const totalIncome = income.reduce((sum: number, t: any) => sum + Number(t.netAmount), 0)
  const totalExpenses = expenses.reduce((sum: number, t: any) => sum + Number(t.businessAmount), 0)
  const netProfit = totalIncome - totalExpenses
  const vatCollected = income.reduce((sum: number, t: any) => sum + Number(t.vatAmount), 0)
  const vatPaid = expenses.reduce((sum: number, t: any) => sum + Number(t.vatAmount) * (Number(t.businessPct) / 100), 0)
  const vatOwed = vatCollected - vatPaid

  const monthName = now.toLocaleString('de-DE', { month: 'long', year: 'numeric' })

  const lines: string[] = [
    `TaxKontrol — EÜR Report`,
    `${user?.businessName ?? user?.name ?? 'Business'}`,
    `Period: ${monthName}`,
    `Generated: ${now.toLocaleDateString('de-DE')}`,
    ``,
    `=== EINNAHMEN-ÜBERSCHUSS-RECHNUNG ===`,
    ``,
    `INCOME (Betriebseinnahmen)`,
    ...income.map((t: any) => `  ${new Date(t.transactionDate).toLocaleDateString('de-DE')}  ${(t.description ?? t.merchant ?? 'Income').padEnd(40)}  €${Number(t.netAmount).toFixed(2)}`),
    `  ${'TOTAL INCOME'.padEnd(50)}  €${totalIncome.toFixed(2)}`,
    ``,
    `EXPENSES (Betriebsausgaben)`,
    ...expenses.map((t: any) => `  ${new Date(t.transactionDate).toLocaleDateString('de-DE')}  ${(t.description ?? t.merchant ?? 'Expense').padEnd(40)}  €${Number(t.businessAmount).toFixed(2)}`),
    `  ${'TOTAL EXPENSES'.padEnd(50)}  €${totalExpenses.toFixed(2)}`,
    ``,
    `NET PROFIT (Gewinn): €${netProfit.toFixed(2)}`,
    ``,
    `=== VAT SUMMARY (Umsatzsteuer) ===`,
    ``,
    `VAT collected (Umsatzsteuer):     €${vatCollected.toFixed(2)}`,
    `VAT paid on purchases (Vorsteuer): €${vatPaid.toFixed(2)}`,
    `VAT owed to Finanzamt:             €${vatOwed.toFixed(2)}`,
    ``,
    `=== DISCLAIMER ===`,
    `This report is an estimate for reference only.`,
    `Always verify with your Steuerberater before submitting to ELSTER.`,
    `TaxKontrol does not submit taxes on your behalf.`,
  ]

  const content = lines.join('\n')

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="taxkontrol-eur-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.txt"`,
    },
  })
}
