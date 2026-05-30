import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'
import { getMostRecentOpenCase } from '@/lib/guidance/caseManager'
import { recomputeAndTrackConfidence } from '@/lib/guidance/confidenceHistory'
import type {
  BusinessType,
  BureaucracyConfidence,
  GuidanceComplexity,
  OrganizationLevel,
  PaymentStyle,
} from '@/lib/guidance/guidanceTypes'

const VALID_BUSINESS_TYPES: BusinessType[] = [
  'FREELANCER', 'RESTAURANT', 'CONSTRUCTION', 'DRIVER', 'RETAIL', 'CREATIVE', 'CONSULTANT', 'OTHER',
]
const VALID_PAYMENT_STYLES: PaymentStyle[] = ['CASH_HEAVY', 'TRANSFER_HEAVY', 'MIXED']
const VALID_COMPLEXITIES: GuidanceComplexity[] = ['SIMPLE', 'STANDARD', 'ADVANCED']
const VALID_CONFIDENCES: BureaucracyConfidence[] = ['LOW', 'MEDIUM', 'HIGH']
const VALID_ORG_LEVELS: OrganizationLevel[] = ['OVERWHELMED', 'IMPROVING', 'ORGANIZED']

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await db.userPersonaProfile.findUnique({
    where: { userId: user.id },
  })

  return NextResponse.json(profile ?? null)
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json() as Record<string, unknown>

    // Validate enums
    const businessType = body.businessType as BusinessType | undefined
    const paymentStyle = body.paymentStyle as PaymentStyle | undefined
    const guidanceComplexity = body.guidanceComplexity as GuidanceComplexity | undefined
    const bureaucracyConfidence = body.bureaucracyConfidence as BureaucracyConfidence | undefined
    const organizationLevel = body.organizationLevel as OrganizationLevel | undefined

    if (businessType && !VALID_BUSINESS_TYPES.includes(businessType)) {
      return NextResponse.json({ error: 'Invalid businessType' }, { status: 400 })
    }
    if (paymentStyle && !VALID_PAYMENT_STYLES.includes(paymentStyle)) {
      return NextResponse.json({ error: 'Invalid paymentStyle' }, { status: 400 })
    }
    if (guidanceComplexity && !VALID_COMPLEXITIES.includes(guidanceComplexity)) {
      return NextResponse.json({ error: 'Invalid guidanceComplexity' }, { status: 400 })
    }
    if (bureaucracyConfidence && !VALID_CONFIDENCES.includes(bureaucracyConfidence)) {
      return NextResponse.json({ error: 'Invalid bureaucracyConfidence' }, { status: 400 })
    }
    if (organizationLevel && !VALID_ORG_LEVELS.includes(organizationLevel)) {
      return NextResponse.json({ error: 'Invalid organizationLevel' }, { status: 400 })
    }

    const data = {
      ...(businessType && { businessType }),
      ...(paymentStyle && { paymentStyle }),
      ...(guidanceComplexity && { guidanceComplexity }),
      ...(bureaucracyConfidence && { bureaucracyConfidence }),
      ...(organizationLevel && { organizationLevel }),
      ...(typeof body.employeeCount === 'number' && { employeeCount: body.employeeCount }),
      ...(typeof body.operatingDaysPerWeek === 'number' && {
        operatingDaysPerWeek: Math.min(7, Math.max(1, body.operatingDaysPerWeek)),
      }),
      ...(typeof body.averageMonthlyRevenue === 'number' && {
        averageMonthlyRevenue: body.averageMonthlyRevenue,
      }),
      ...(typeof body.seasonalBusiness === 'boolean' && { seasonalBusiness: body.seasonalBusiness }),
      ...(typeof body.cashPercentage === 'number' && { cashPercentage: body.cashPercentage }),
      ...(typeof body.invoicePercentage === 'number' && { invoicePercentage: body.invoicePercentage }),
      ...(typeof body.transferPercentage === 'number' && { transferPercentage: body.transferPercentage }),
      ...(typeof body.businessDescription === 'string' && { businessDescription: body.businessDescription }),
    }

    const profile = await db.userPersonaProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...data },
      update: data,
    })

    // Recompute confidence on the most recent open case — persona changes can affect scoring
    try {
      const openCase = await getMostRecentOpenCase(user.id)
      if (openCase) {
        await recomputeAndTrackConfidence(user.id, openCase.id)
      }
    } catch {
      // Non-critical
    }

    return NextResponse.json(profile)
  } catch (err) {
    console.error('Persona update error:', err)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
