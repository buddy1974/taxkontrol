import { NextRequest, NextResponse } from 'next/server'
import { logError } from '@/lib/log'
import { rateLimit, getIp, rateLimitResponse } from '@/lib/rateLimit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Delivers the request to the operator's Telegram chat. Returns false when
 * delivery is not configured or failed — the caller must then tell the visitor,
 * never pretend the message was received.
 * Sent as plain text (no parse_mode) so visitor input cannot inject formatting.
 */
async function sendTelegram(text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) {
    console.error('[contact] TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not configured — request not delivered')
    return false
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) console.error(`[contact] Telegram HTTP ${res.status}`)
    return res.ok
  } catch (err) {
    logError('[contact] Telegram delivery failed', err)
    return false
  }
}

export async function POST(req: NextRequest) {
  // 3 submissions per IP per hour
  const ip = getIp(req)
  const rl = await rateLimit(`contact:${ip}`, 3, 60 * 60 * 1000)
  if (!rl.allowed) return rateLimitResponse(rl.retryAfter)

  try {
    const body = await req.json()
    const { name, email, phone, message, helpNeeded, system, source, website } = body as Record<string, unknown>

    // Honeypot: real visitors never fill the hidden "website" field.
    if (typeof website === 'string' && website.trim() !== '') {
      return NextResponse.json({ success: true }, { status: 200 })
    }

    // Validation
    const cleanName = typeof name === 'string' ? name.trim() : ''
    if (cleanName.length < 2) {
      return NextResponse.json(
        { error: 'Bitte geben Sie Ihren Namen ein.' },
        { status: 400 }
      )
    }

    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : ''
    if (!EMAIL_RE.test(cleanEmail)) {
      return NextResponse.json(
        { error: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.' },
        { status: 400 }
      )
    }

    const cleanMessage = typeof message === 'string' ? message.trim() : ''
    if (cleanMessage.length < 20) {
      return NextResponse.json(
        { error: 'Bitte beschreiben Sie Ihre Situation (mindestens 20 Zeichen).' },
        { status: 400 }
      )
    }
    if (cleanMessage.length > 2000) {
      return NextResponse.json(
        { error: 'Nachricht zu lang (max. 2000 Zeichen).' },
        { status: 400 }
      )
    }

    const cleanPhone = typeof phone === 'string' ? phone.trim().slice(0, 30) : null
    const cleanHelpNeeded = typeof helpNeeded === 'string' ? helpNeeded.trim().slice(0, 100) : null
    const cleanSystem = typeof system === 'string' ? system.slice(0, 64) : null
    const cleanSource = typeof source === 'string' ? source.slice(0, 64) : 'contact'

    const isTaxKontrol = cleanSystem === 'taxkontrol'
    const title = isTaxKontrol
      ? 'New TaxKontrol Consultation Request'
      : 'New Contact Request'

    const timestamp = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })

    const telegramText = isTaxKontrol
      ? [
          `*${title}*`,
          '',
          `*Name:*\n${cleanName.slice(0, 120)}`,
          '',
          `*Email:*\n${cleanEmail.slice(0, 200)}`,
          '',
          `*Phone:*\n${cleanPhone ?? '—'}`,
          '',
          `*Current situation:*\n${cleanMessage}`,
          '',
          `*Help needed:*\n${cleanHelpNeeded ?? '—'}`,
          '',
          `*Source:*\n${cleanSource}`,
          '',
          `*Time:*\n${timestamp}`,
        ].join('\n')
      : [
          `*${title}*`,
          '',
          `*Name:* ${cleanName.slice(0, 120)}`,
          `*Email:* ${cleanEmail.slice(0, 200)}`,
          `*Source:* ${cleanSource}`,
          '',
          '*Message:*',
          cleanMessage,
        ].join('\n')

    const delivered = await sendTelegram(telegramText.replace(/\*/g, ''))
    // No personal data in logs.
    console.info(`[contact] source=${cleanSource} system=${cleanSystem ?? 'none'} delivered=${delivered}`)
    if (!delivered) {
      return NextResponse.json(
        { error: 'Ihre Nachricht konnte gerade nicht zugestellt werden. Bitte schreiben Sie uns direkt an info@maxpromo.digital.' },
        { status: 503 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    logError('Contact form error', err)
    return NextResponse.json(
      { error: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.' },
      { status: 500 }
    )
  }
}
