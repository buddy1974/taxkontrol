import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { isDevBypassEnabled } from '@/lib/devAuth'
import { isCrossSiteWrite } from '@/lib/csrf'

/**
 * Routes reachable without a session. Everything else requires login.
 * Legal pages (Impressum, Datenschutz) MUST stay public.
 * API routes still authenticate themselves; this proxy is only the first gate.
 */
// /api/cron authenticates itself with CRON_SECRET (Vercel Cron), not with a user session.
const PUBLIC_PATHS = ['/impressum', '/datenschutz', '/contact', '/api/v1/contact', '/api/health', '/api/cron']
const AUTH_PAGES = ['/login', '/register']
const AUTH_API = ['/api/auth', '/api/v1/auth']

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(p => pathname === p || pathname.startsWith(`${p}/`))
}

export default auth(req => {
  const { pathname } = req.nextUrl

  // Cross-site writes to our JSON API are refused before anything else runs.
  if (pathname.startsWith('/api/v1/')) {
    const blocked = isCrossSiteWrite({
      method: req.method,
      origin: req.headers.get('origin'),
      secFetchSite: req.headers.get('sec-fetch-site'),
      host: req.headers.get('x-forwarded-host') ?? req.headers.get('host'),
    })
    if (blocked) return NextResponse.json({ error: 'Cross-site request refused.' }, { status: 403 })
  }

  if (matches(pathname, PUBLIC_PATHS) || matches(pathname, AUTH_API)) {
    return NextResponse.next()
  }

  // Dev bypass: local development only (hard-disabled on Vercel and for remote databases).
  if (isDevBypassEnabled()) {
    return NextResponse.next()
  }

  const isLoggedIn = !!req.auth
  const isAuthPage = matches(pathname, AUTH_PAGES)

  if (!isLoggedIn && !isAuthPage) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    // `/` for anonymous visitors goes to the consultation page (product decision kept from RC1).
    if (pathname === '/') {
      return NextResponse.redirect(new URL('/contact?system=taxkontrol&request=consultation', req.nextUrl))
    }
    const login = new URL('/login', req.nextUrl)
    if (pathname !== '/') login.searchParams.set('next', pathname)
    return NextResponse.redirect(login)
  }

  if (isLoggedIn && (isAuthPage || pathname === '/')) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
}
