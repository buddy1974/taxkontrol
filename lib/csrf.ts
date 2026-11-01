/**
 * Cross-site request check for cookie-authenticated API writes.
 *
 * SameSite=Lax cookies already stop most cross-site writes, but "same site" is
 * wider than "same origin": once the app runs on app.taxkontrol.de, a page on
 * taxkontrol.de (another Vercel project) counts as same-site. Browsers send an
 * Origin header on every cross-origin POST/PATCH/PUT/DELETE, and modern
 * browsers send Sec-Fetch-Site; we reject writes whose origin is not our own.
 * Requests without either header (curl, server-to-server) are not browser
 * CSRF and stay allowed — they still need a valid session.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function isCrossSiteWrite(input: {
  method: string
  origin: string | null
  secFetchSite: string | null
  host: string | null
}): boolean {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) return false
  if (input.origin) {
    if (input.origin === 'null') return true
    let originHost: string
    try {
      originHost = new URL(input.origin).host
    } catch {
      return true
    }
    return !input.host || originHost.toLowerCase() !== input.host.toLowerCase()
  }
  if (input.secFetchSite) return input.secFetchSite !== 'same-origin' && input.secFetchSite !== 'none'
  return false
}
