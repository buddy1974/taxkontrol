import { NextResponse } from 'next/server'
import { requireCurrentUser } from '@/lib/getCurrentUser'
import { getPersonaProfile } from '@/lib/guidance/buildUserContext'
import { detectRecurringExpenses, buildPersonaSuggestions } from '@/lib/guidance/prefillEngine'

export async function GET() {
  const user = await requireCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const [recurringExpenses, persona] = await Promise.all([
      detectRecurringExpenses(user.id),
      getPersonaProfile(user.id),
    ])

    const personaSuggestions = buildPersonaSuggestions(persona)

    return NextResponse.json({
      recurringExpenses,
      personaSuggestions,
    })
  } catch (err) {
    console.error('Suggestions error:', err)
    return NextResponse.json({ recurringExpenses: [], personaSuggestions: [] })
  }
}
