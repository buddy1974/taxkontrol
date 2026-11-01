import { requireFeature } from '@/lib/entitlements'
import { logError } from '@/lib/log'
import { EntitlementFeature } from '@prisma/client'
import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { buildPreparationPackage } from '@/lib/guidance/buildPreparationPackage'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gate = await requireFeature(user.id, EntitlementFeature.PREPARATION)
  if (gate) return gate

  try {
    const pkg = await buildPreparationPackage(user.id)
    return NextResponse.json(pkg, { status: 200 })
  } catch (err) {
    logError('Preparation package error', err)
    return NextResponse.json({ error: 'Could not build preparation package' }, { status: 500 })
  }
}
