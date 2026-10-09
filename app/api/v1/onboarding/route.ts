import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { jsonError, oneOf, readJsonObject, unauthorized } from '@/lib/http'

const TAX_TYPES = ['KLEINUNTERNEHMER', 'REGELBESTEUERUNG', 'PAUSCHALIERUNG'] as const

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const body = await readJsonObject(req)
  const taxType = oneOf(body?.taxType, TAX_TYPES)
  if (!taxType) return jsonError(400, 'Please choose your VAT status.')

  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: { taxType, ...(typeof body?.isJobcenter === 'boolean' && { isJobcenter: body.isJobcenter }) },
    })
    // The tax profile only stores settings; estimates come from the versioned rules.
    await tx.taxProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, vatReserveRate: taxType === 'KLEINUNTERNEHMER' ? 0 : 19 },
    })
  })

  return NextResponse.json({ success: true })
}
