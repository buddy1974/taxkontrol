import { NextRequest, NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      email: true,
      businessName: true,
      taxType: true,
      taxId: true,
      vatId: true,
    },
  })

  return NextResponse.json(profile)
}

export async function PATCH(req: NextRequest) {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, businessName, taxType, taxId, vatId } = await req.json()

  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...(name !== undefined && { name }),
      ...(businessName !== undefined && { businessName }),
      ...(taxType !== undefined && { taxType }),
      ...(taxId !== undefined && { taxId: taxId || null }),
      ...(vatId !== undefined && { vatId: vatId || null }),
    },
    select: {
      name: true,
      email: true,
      businessName: true,
      taxType: true,
      taxId: true,
      vatId: true,
    },
  })

  return NextResponse.json(updated)
}
