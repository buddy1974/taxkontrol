import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { isDevBypassEnabled } from '@/lib/devAuth'

export default auth((req) => {
  // Dev bypass: skip all auth checks in local development only.
  // isDevBypassEnabled() hard-disables this on Vercel/production.
  if (isDevBypassEnabled()) {
    return NextResponse.next()
  }

  const isLoggedIn = !!req.auth
  const isAuthPage = req.nextUrl.pathname.startsWith('/login') ||
    req.nextUrl.pathname.startsWith('/register')
  const isApiAuth = req.nextUrl.pathname.startsWith('/api/auth')
  const isApiRegister = req.nextUrl.pathname.startsWith('/api/v1/auth')

  if (isApiAuth || isApiRegister) {
    return NextResponse.next()
  }

  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL('/login', req.nextUrl))
  }

  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', req.nextUrl))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
