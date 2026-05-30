import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taxType } = await req.json()

  await db.user.update({
    where: { id: user.id },
    data: { taxType: taxType ?? 'REGELBESTEUERUNG' },
  })

  const existing = await db.taxProfile.findUnique({
    where: { userId: user.id },
  })

  if (!existing) {
    await db.taxProfile.create({
      data: {
        userId: user.id,
        incomeTaxRate: 30,
        vatReserveRate: taxType === 'KLEINUNTERNEHMER' ? 0 : 19,
        incomeTaxReserveRate: 30,
        solidaritySurcharge: true,
      },
    })
  }

  return NextResponse.json({ success: true })
}
