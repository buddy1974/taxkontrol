/**
 * Classifies a DATABASE_URL so that destructive or dev-only tooling (demo seed,
 * dev login bypass, integration tests) can refuse to run against anything that
 * is not clearly a local, disposable database.
 */

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'])

export function databaseHost(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/** True only for postgres URLs whose host is the local machine. */
export function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    if (!/^postgres(ql)?:$/.test(parsed.protocol)) return false
    return LOCAL_HOSTS.has(parsed.hostname.toLowerCase())
  } catch {
    return false
  }
}
