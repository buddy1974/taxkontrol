import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { jsonError, oneOf, readJsonObject, unauthorized } from '@/lib/http'
import { applyTaxStatusChange, hasNoRecords } from '@/lib/taxStatusStore'
import { berlinDate } from '@/lib/time/berlin'

const TAX_TYPES = ['KLEINUNTERNEHMER', 'REGELBESTEUERUNG', 'PAUSCHALIERUNG'] as const

export async function POST(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const body = await readJsonObject(req)
  const taxType = oneOf(body?.taxType, TAX_TYPES)
  if (!taxType) return jsonError(400, 'Please choose your VAT status.')

  await db.$transaction(async tx => {
    if (typeof body?.isJobcenter === 'boolean') {
      await tx.user.update({ where: { id: user.id }, data: { isJobcenter: body.isJobcenter } })
    }
    // The tax profile only stores settings; estimates come from the versioned rules.
    await tx.taxProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, vatReserveRate: taxType === 'KLEINUNTERNEHMER' ? 0 : 19 },
    })
    // First choice before anything is recorded = the status "since always"; otherwise from today
    // (earlier periods keep the status valid then).
    const now = new Date()
    await applyTaxStatusChange(tx, user.id, { taxType }, (await hasNoRecords(tx, user.id)) ? 'ALWAYS' : { ...berlinDate(now) }, now)
  })

  return NextResponse.json({ success: true })
}
