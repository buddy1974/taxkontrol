import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireCurrentUser } from '@/lib/getCurrentUser'

interface Props {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, { params }: Props) {
  const { id } = await params
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const doc = await db.document.findUnique({
      where: { id },
    })

    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (doc.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    return NextResponse.json({
      id: doc.id,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      type: doc.type,
      status: doc.status,
      reviewStatus: doc.reviewStatus ?? null,
      approvedAt: doc.approvedAt?.toISOString() ?? null,
      ocrText: doc.ocrText ?? null,
      ocrData: doc.ocrData ?? null,
      correctionData: doc.correctionData ?? null,
      linkedTransactionId: doc.linkedTransactionId ?? null,
      createdAt: doc.createdAt.toISOString(),
    })
  } catch (err) {
    console.error('Document fetch error:', err)
    return NextResponse.json({ error: 'Could not fetch document' }, { status: 500 })
  }
}
