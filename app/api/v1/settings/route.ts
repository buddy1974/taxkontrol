import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { recordAudit, diffFields } from '@/lib/audit'
import { jsonError, oneOf, optionalString, readJsonObject, unauthorized } from '@/lib/http'
import { loadTaxStatusTimeline } from '@/lib/finance/loadPosition'
import { SINCE_ALWAYS, type TaxStatus } from '@/lib/finance/taxStatus'
import { applyTaxStatusChange, hasNoRecords, type EffectiveFrom } from '@/lib/taxStatusStore'
import { berlinDate, toBerlinIsoDate } from '@/lib/time/berlin'

const TAX_TYPES = ['KLEINUNTERNEHMER', 'REGELBESTEUERUNG', 'PAUSCHALIERUNG'] as const
const VAT_PERIODS = ['MONTHLY', 'QUARTERLY', 'YEARLY'] as const
const VAT_METHODS = ['SOLL', 'IST'] as const

async function loadSettings(userId: string) {
  const [u, timeline] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        businessName: true,
        taxId: true,
        vatId: true,
        isJobcenter: true,
        taxProfile: { select: { churchTax: true, churchTaxRate: true } },
      },
    }),
    loadTaxStatusTimeline(userId),
  ])
  if (!u) return null
  const now = timeline.statusAt(new Date())
  return {
    name: u.name,
    email: u.email,
    businessName: u.businessName,
    taxType: now.taxType,
    vatMethod: now.vatMethod,
    vatFilingPeriod: now.vatFilingPeriod,
    dauerfristverlaengerung: now.dauerfristverlaengerung,
    taxId: u.taxId,
    vatId: u.vatId,
    isJobcenter: u.isJobcenter,
    churchTax: u.taxProfile?.churchTax ?? false,
    churchTaxRate: u.taxProfile ? Number(u.taxProfile.churchTaxRate) : 9,
    /** Status history, newest first ("since always" = null). */
    taxStatusHistory: [...timeline.entries].reverse().map(e => ({
      validFrom: e.validFrom.getTime() === SINCE_ALWAYS.getTime() ? null : toBerlinIsoDate(e.validFrom),
      taxType: e.taxType,
      vatMethod: e.vatMethod,
      vatFilingPeriod: e.vatFilingPeriod,
      dauerfristverlaengerung: e.dauerfristverlaengerung,
    })),
  }
}

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()
  const settings = await loadSettings(user.id)
  if (!settings) return unauthorized()
  return NextResponse.json(settings)
}

/** "ALWAYS" or "YYYY-MM-DD" (Berlin calendar day). */
function parseEffectiveFrom(value: unknown, now: Date): EffectiveFrom | null | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (value === 'ALWAYS') return 'ALWAYS'
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null
  if (year < 2000 || year > berlinDate(now).year + 1) return null
  return { year, month, day }
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return unauthorized()

  const body = await readJsonObject(req)
  if (!body) return jsonError(400, 'Invalid request body.')

  const before = await loadSettings(user.id)
  if (!before) return unauthorized()
  const now = new Date()

  const taxType = body.taxType === undefined ? undefined : oneOf(body.taxType, TAX_TYPES)
  if (body.taxType !== undefined && !taxType) return jsonError(400, 'Unknown tax status.', { field: 'taxType' })
  const vatFilingPeriod = body.vatFilingPeriod === undefined ? undefined : oneOf(body.vatFilingPeriod, VAT_PERIODS)
  if (body.vatFilingPeriod !== undefined && !vatFilingPeriod) return jsonError(400, 'Unknown VAT filing period.', { field: 'vatFilingPeriod' })
  const vatMethod = body.vatMethod === undefined ? undefined : oneOf(body.vatMethod, VAT_METHODS)
  if (body.vatMethod !== undefined && !vatMethod) return jsonError(400, 'VAT method must be SOLL or IST.', { field: 'vatMethod' })
  // Istversteuerung needs the Finanzamt's approval (§20 UStG) — never assumed.
  if (vatMethod === 'IST' && before.vatMethod !== 'IST' && body.istApproved !== true) {
    return jsonError(400, 'Istversteuerung is only allowed when the Finanzamt approved it (§20 UStG). Please confirm the approval.', { field: 'istApproved' })
  }
  if (body.dauerfristverlaengerung !== undefined && typeof body.dauerfristverlaengerung !== 'boolean') {
    return jsonError(400, 'dauerfristverlaengerung must be true or false.', { field: 'dauerfristverlaengerung' })
  }
  const effective = parseEffectiveFrom(body.statusEffectiveFrom, now)
  if (effective === null) return jsonError(400, 'Please enter a valid date from which the new tax status applies.', { field: 'statusEffectiveFrom' })

  const churchTaxRate = body.churchTaxRate === undefined ? undefined : Number(body.churchTaxRate)
  if (churchTaxRate !== undefined && churchTaxRate !== 8 && churchTaxRate !== 9) {
    return jsonError(400, 'Church tax is 8 % (Bayern, Baden-Württemberg) or 9 % (all other states).', { field: 'churchTaxRate' })
  }
  const name = optionalString(body.name, 120)
  if (body.name !== undefined && !name) return jsonError(400, 'Please enter your name.', { field: 'name' })

  const statusChange: Partial<TaxStatus> = {}
  if (taxType && taxType !== before.taxType) statusChange.taxType = taxType
  if (vatMethod && vatMethod !== before.vatMethod) statusChange.vatMethod = vatMethod
  if (vatFilingPeriod && vatFilingPeriod !== before.vatFilingPeriod) statusChange.vatFilingPeriod = vatFilingPeriod
  if (typeof body.dauerfristverlaengerung === 'boolean' && body.dauerfristverlaengerung !== before.dauerfristverlaengerung) {
    statusChange.dauerfristverlaengerung = body.dauerfristverlaengerung
  }

  // The advance-return rhythm is fixed per calendar year (§18 Abs. 2 UStG): a change applies
  // from 1 January (or corrects the setting "since always"), never in the middle of a period.
  if (statusChange.vatFilingPeriod && effective !== 'ALWAYS' && !(effective && effective.month === 1 && effective.day === 1)) {
    if (!(effective === undefined && (await hasNoRecords(db, user.id)))) {
      return jsonError(400, 'The VAT filing period changes per calendar year (§18 Abs. 2 UStG). Choose “from 1 January” or correct the setting for all periods.', { field: 'statusEffectiveFrom' })
    }
  }

  await db.$transaction(async tx => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        ...(name ? { name } : {}),
        ...(body.businessName !== undefined && { businessName: optionalString(body.businessName, 160) ?? null }),
        ...(body.taxId !== undefined && { taxId: optionalString(body.taxId, 40) ?? null }),
        ...(body.vatId !== undefined && { vatId: optionalString(body.vatId, 20) ?? null }),
        ...(typeof body.isJobcenter === 'boolean' && { isJobcenter: body.isJobcenter }),
      },
    })
    const profileData = {
      ...(typeof body.churchTax === 'boolean' && { churchTax: body.churchTax }),
      ...(churchTaxRate !== undefined && { churchTaxRate }),
    }
    if (Object.keys(profileData).length > 0) {
      await tx.taxProfile.upsert({ where: { userId: user.id }, update: profileData, create: { userId: user.id, ...profileData } })
    }
    if (Object.keys(statusChange).length > 0) {
      // A status change applies from today unless the user chose a date. Only before
      // anything is recorded does it count as the initial setup ("since always").
      const from: EffectiveFrom = effective ?? ((await hasNoRecords(tx, user.id)) ? 'ALWAYS' : { ...berlinDate(now) })
      await applyTaxStatusChange(tx, user.id, statusChange, from, now)
    }
  })

  const after = await loadSettings(user.id)
  const diff = after ? diffFields({ ...before, taxStatusHistory: undefined }, { ...after, taxStatusHistory: undefined }) : null
  if (diff) {
    await recordAudit({ userId: user.id, entityType: 'ACCOUNT', entityId: user.id, action: 'UPDATE', before: diff.before, after: diff.after })
  }
  return NextResponse.json(after)
}
