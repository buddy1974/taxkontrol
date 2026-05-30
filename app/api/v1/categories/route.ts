import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { db } from '@/lib/db'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const categories = await db.category.findMany({
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(categories)
}
