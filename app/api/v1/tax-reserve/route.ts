import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const reserves = await db.taxReserve.findMany({
    where: { userId: session.user.id },
    orderBy: { periodStart: 'desc' },
  })

  return NextResponse.json(
    reserves.map((r: any) => ({
      ...r,
      shouldHave: Number(r.shouldHave),
      actuallyReserved: Number(r.actuallyReserved),
      missing: Number(r.missing),
    }))
  )
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id, actuallyReserved } = await req.json()

  if (!id || actuallyReserved === undefined) {
    return NextResponse.json({ error: 'id and actuallyReserved required' }, { status: 400 })
  }

  const reserve = await db.taxReserve.findFirst({
    where: { id, userId: session.user.id },
  })

  if (!reserve) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const updated = await db.taxReserve.update({
    where: { id },
    data: {
      actuallyReserved,
      missing: Math.max(0, Number(reserve.shouldHave) - actuallyReserved),
    },
  })

  return NextResponse.json({
    ...updated,
    shouldHave: Number(updated.shouldHave),
    actuallyReserved: Number(updated.actuallyReserved),
    missing: Number(updated.missing),
  })
}
