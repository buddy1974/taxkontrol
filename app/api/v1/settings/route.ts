import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      businessName: true,
      taxType: true,
      taxId: true,
      vatId: true,
    },
  })

  return NextResponse.json(user)
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name, businessName, taxType, taxId, vatId } = await req.json()

  const updated = await db.user.update({
    where: { id: session.user.id },
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
