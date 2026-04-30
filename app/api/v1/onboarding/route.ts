import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { taxType } = await req.json()

  await db.user.update({
    where: { id: session.user.id },
    data: { taxType: taxType ?? 'REGELBESTEUERUNG' },
  })

  const existing = await db.taxProfile.findUnique({
    where: { userId: session.user.id },
  })

  if (!existing) {
    await db.taxProfile.create({
      data: {
        userId: session.user.id,
        incomeTaxRate: 30,
        vatReserveRate: taxType === 'KLEINUNTERNEHMER' ? 0 : 19,
        incomeTaxReserveRate: 30,
        solidaritySurcharge: true,
      },
    })
  }

  return NextResponse.json({ success: true })
}
