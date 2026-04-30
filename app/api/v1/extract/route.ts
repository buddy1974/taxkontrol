import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { extractFromText } from '@/lib/ai/extract'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text } = await req.json()
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 })

  const result = await extractFromText(text)
  return NextResponse.json(result)
}
