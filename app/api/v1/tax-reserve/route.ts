import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { computeMonthlyTaxReserve } from '@/lib/engines/taxReserve'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = user.id
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)

  const userProfile = await db.user.findUnique({ where: { id: userId }, select: { taxType: true } })
  const taxType = userProfile?.taxType ?? 'REGELBESTEUERUNG'

  // Recompute shouldHave from live transactions
  const { vatShouldHave, incomeTaxShouldHave } = await computeMonthlyTaxReserve(
    userId,
    startOfMonth,
    startOfNextMonth
  )

  // Load existing reserve rows
  const reserves = await db.taxReserve.findMany({
    where: { userId },
    orderBy: { periodStart: 'desc' },
  })

  const vatReserve = reserves.find((r: any) => r.type === 'VAT')
  const incomeTaxReserve = reserves.find((r: any) => r.type === 'INCOME_TAX')

  // Update shouldHave + missing, preserve actuallyReserved
  const updates = []
  if (vatReserve) {
    updates.push(
      db.taxReserve.update({
        where: { id: vatReserve.id },
        data: {
          shouldHave: vatShouldHave,
          missing: Math.max(0, vatShouldHave - Number(vatReserve.actuallyReserved)),
        },
      })
    )
  }
  if (incomeTaxReserve) {
    updates.push(
      db.taxReserve.update({
        where: { id: incomeTaxReserve.id },
        data: {
          shouldHave: incomeTaxShouldHave,
          missing: Math.max(0, incomeTaxShouldHave - Number(incomeTaxReserve.actuallyReserved)),
        },
      })
    )
  }
  if (updates.length > 0) await Promise.all(updates)

  // Return fresh rows
  const updated = await db.taxReserve.findMany({
    where: { userId },
    orderBy: { periodStart: 'desc' },
  })

  return NextResponse.json({
    taxType,
    reserves: updated.map((r: any) => ({
      ...r,
      shouldHave: Number(r.shouldHave),
      actuallyReserved: Number(r.actuallyReserved),
      missing: Number(r.missing),
    })),
  })
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, actuallyReserved } = await req.json()

  if (!id || actuallyReserved === undefined) {
    return NextResponse.json({ error: 'id and actuallyReserved required' }, { status: 400 })
  }

  const reserve = await db.taxReserve.findFirst({
    where: { id, userId: user.id },
  })

  if (!reserve) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await db.taxReserve.update({
    where: { id },
    data: {
      actuallyReserved,
      missing: Math.max(0, Number(reserve.shouldHave) - actuallyReserved),
    },
  })

  return NextResponse.json({
    ...updated,
    shouldHave: Number(updated.shouldHave),
    actuallyReserved: Number(updated.actuallyReserved),
    missing: Number(updated.missing),
  })
}
