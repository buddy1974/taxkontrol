import { describe, it, expect } from 'vitest'
import { safeReturnPath } from '@/lib/safeRedirect'
import { isCrossSiteWrite } from '@/lib/csrf'
import { safeErrorSummary } from '@/lib/log'

const ORIGIN = 'https://app.taxkontrol.de'

describe('login return target (open redirect)', () => {
  it('keeps same-origin paths with query and hash', () => {
    expect(safeReturnPath('/dashboard', ORIGIN)).toBe('/dashboard')
    expect(safeReturnPath('/reports?month=2026-10#vat', ORIGIN)).toBe('/reports?month=2026-10#vat')
  })

  it.each([
    '//evil.example',
    '/\\evil.example',
    '/\t/evil.example', // tab is stripped by the URL parser → //evil.example
    '/\n/evil.example',
    '/%09/evil.example', // as it arrives from URLSearchParams.get (already decoded) the tab is real
    'https:evil.example',
    'https://evil.example/dashboard',
    'javascript:alert(1)',
    '',
    null,
  ])('refuses %j', value => {
    const decoded = typeof value === 'string' ? decodeURIComponent(value) : value
    expect(safeReturnPath(decoded, ORIGIN)).toBe('/dashboard')
  })
})

describe('cross-site write check (CSRF)', () => {
  const base = { method: 'POST', origin: null, secFetchSite: null, host: 'app.taxkontrol.de' }

  it('allows same-origin writes and all reads', () => {
    expect(isCrossSiteWrite({ ...base, origin: ORIGIN })).toBe(false)
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'same-origin' })).toBe(false)
    expect(isCrossSiteWrite({ ...base, method: 'GET', origin: 'https://evil.example' })).toBe(false)
  })

  it('refuses writes from a sibling site and from other origins', () => {
    expect(isCrossSiteWrite({ ...base, origin: 'https://taxkontrol.de' })).toBe(true) // same-site, other origin
    expect(isCrossSiteWrite({ ...base, method: 'DELETE', origin: 'https://evil.example' })).toBe(true)
    expect(isCrossSiteWrite({ ...base, origin: 'null' })).toBe(true)
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'same-site' })).toBe(true)
    expect(isCrossSiteWrite({ ...base, secFetchSite: 'cross-site' })).toBe(true)
  })

  it('does not block non-browser clients (no Origin, no Sec-Fetch-Site)', () => {
    expect(isCrossSiteWrite(base)).toBe(false)
  })
})

describe('error logging without personal data', () => {
  it('Prisma errors: class and code only, never the echoed query arguments', () => {
    const err = Object.assign(new Error('Invalid `prisma.user.create()` invocation: { email: "anna@example.de", name: "Anna" }'), {
      name: 'PrismaClientKnownRequestError',
      code: 'P2002',
      meta: { modelName: 'User' },
    })
    const out = safeErrorSummary(err)
    expect(out).toBe('PrismaClientKnownRequestError P2002 User')
    expect(out).not.toContain('anna@example.de')
  })

  it('other errors: first message line only', () => {
    expect(safeErrorSummary(new Error('boom\nsecret second line'))).toMatch(/^Error: boom/)
    expect(safeErrorSummary(new Error('boom\nsecret second line'))).not.toContain('secret')
  })
})
