/**
 * Return target after login. Only paths on our own origin are allowed.
 *
 * A prefix check ("starts with / but not //") is not enough: browsers strip
 * tabs and newlines while parsing URLs, so "/\t/evil.example" becomes
 * "//evil.example". We therefore resolve the value exactly like the browser
 * does and compare the resulting origin.
 */
export function safeReturnPath(next: string | null | undefined, origin: string, fallback = '/dashboard'): string {
  if (!next || typeof next !== 'string' || !next.startsWith('/')) return fallback
  let url: URL
  try {
    url = new URL(next, origin)
  } catch {
    return fallback
  }
  if (url.origin !== new URL(origin).origin) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
