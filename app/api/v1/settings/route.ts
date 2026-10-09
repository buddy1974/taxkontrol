import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { recordAudit, diffFields } from '@/lib/audit'
import { jsonError, oneOf, optionalString, readJsonObject, unauthorized } from '@/lib/http'

const TAX_TYPES = ['KLEINUNTERNEHMER', 'REGELBESTEUERUNG', 'PAUSCHALIERUNG'] as const
const VAT_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const

async function loadSettings(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      businessName: true,
      taxType: true,
      taxId: true,
      vatId: true,
      isJobcenter: true,
      taxProfile: { select: { vatFilingPeriod: true, churchTax: true, churchTaxRate: true } },
    },
  })
  if (!u) return null
  return {
    name: u.name,
    email: u.email,
    businessName: u.businessName,
    taxType: u.taxType,
    taxId: u.taxId,
    vatId: u.vatId,
    isJobcenter: u.isJobcenter,
    vatFilingPeriod: u.taxProfile?.vatFilingPeriod ?? 'QUARTERLY',
    churchTax: u.taxProfile?.churchTax ?? false,
    churchTaxRate: u.taxProfile ? Number(u.taxProfile.churchTaxRate) : 9,
  }
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const settings = await loadSettings(user.id)
  if (!settings) return unauthorized()
  return NextResponse.json(settings)
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  const before = await loadSettings(user.id)
  if (!before) return unauthorized()

  const taxType = body.taxType === undefined ? undefined : oneOf(body.taxType, TAX_TYPES)
  if (body.taxType !== undefined && !taxType) return jsonError(400, 'Unknown tax status.', { field: 'taxType' })
  const vatFilingPeriod = body.vatFilingPeriod === undefined ? undefined : oneOf(body.vatFilingPeriod, VAT_PERIODS)
  if (body.vatFilingPeriod !== undefined && !vatFilingPeriod) return jsonError(400, 'Unknown VAT filing period.', { field: 'vatFilingPeriod' })
  const churchTaxRate = body.churchTaxRate === undefined ? undefined : Number(body.churchTaxRate)
  if (churchTaxRate !== undefined && churchTaxRate !== 8 && churchTaxRate !== 9) {
    return jsonError(400, 'Church tax is 8 % (Bayern, Baden-Württemberg) or 9 % (all other states).', { field: 'churchTaxRate' })
  }
  const name = optionalString(body.name, 120)
  if (body.name !== undefined && !name) return jsonError(400, 'Please enter your name.', { field: 'name' })

  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(name ? { name } : {}),
        ...(body.businessName !== undefined && { businessName: optionalString(body.businessName, 160) ?? null }),
        ...(taxType && { taxType }),
        ...(body.taxId !== undefined && { taxId: optionalString(body.taxId, 40) ?? null }),
        ...(body.vatId !== undefined && { vatId: optionalString(body.vatId, 20) ?? null }),
        ...(typeof body.isJobcenter === 'boolean' && { isJobcenter: body.isJobcenter }),
      },
    })
    const profileData = {
      ...(vatFilingPeriod && { vatFilingPeriod }),
      ...(typeof body.churchTax === 'boolean' && { churchTax: body.churchTax }),
      ...(churchTaxRate !== undefined && { churchTaxRate }),
    }
    if (Object.keys(profileData).length > 0) {
      await tx.taxProfile.upsert({ where: { userId: user.id }, update: profileData, create: { userId: user.id, ...profileData } })
    }
  })

  const after = await loadSettings(user.id)
  const diff = after ? diffFields(before, after) : null
  if (diff) {
    await recordAudit({ userId: user.id, entityType: 'ACCOUNT', entityId: user.id, action: 'UPDATE', before: diff.before, after: diff.after })
  }
  return NextResponse.json(after)
}
