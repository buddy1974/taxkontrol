/**
 * Environment check run once at server start (instrumentation.ts).
 * Reports variable NAMES only — never values.
 */

export interface EnvReport {
  missingRequired: string[]
  missingOptional: Array<{ name: string; effect: string }>
  warnings: string[]
}

const REQUIRED = ['DATABASE_URL'] as const
const SECRET_ALTERNATIVES = ['AUTH_SECRET', 'NEXTAUTH_SECRET'] as const

const OPTIONAL: Array<{ names: string[]; effect: string }> = [
  { names: ['ANTHROPIC_API_KEY'], effect: 'receipt/bank-statement reading disabled — users enter values manually' },
  { names: ['CLOUDFLARE_R2_ACCOUNT_ID', 'CLOUDFLARE_R2_ACCESS_KEY', 'CLOUDFLARE_R2_SECRET_KEY', 'CLOUDFLARE_R2_BUCKET'], effect: 'document uploads fail' },
  { names: ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'], effect: 'rate limits are per server instance only' },
  { names: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'], effect: 'contact form answers 503 (requests are not lost silently)' },
]

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvReport {
  const missingRequired: string[] = REQUIRED.filter(n => !env[n])
  if (!SECRET_ALTERNATIVES.some(n => env[n])) missingRequired.push(SECRET_ALTERNATIVES.join(' or '))

  const missingOptional = OPTIONAL.flatMap(o => {
    const missing = o.names.filter(n => !env[n])
    return missing.length ? [{ name: missing.join(', '), effect: o.effect }] : []
  })

  const warnings: string[] = []
  const isDeployed = Boolean(env.VERCEL_ENV)
  if (isDeployed && env.DEV_BYPASS_LOGIN === 'true') warnings.push('DEV_BYPASS_LOGIN is set on a deployed environment (ignored by code, but remove it).')
  const secret = env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? ''
  if (secret && secret.length < 32) warnings.push('Auth secret is shorter than 32 characters.')
  if (env.VERCEL_ENV === 'preview' && env.DATABASE_URL && env.PRODUCTION_DATABASE_HOST && env.DATABASE_URL.includes(env.PRODUCTION_DATABASE_HOST)) {
    warnings.push('Preview deployment is connected to the production database host.')
  }
  return { missingRequired, missingOptional, warnings }
}

export function logEnvironmentReport(report: EnvReport = checkEnvironment()): void {
  for (const name of report.missingRequired) console.error(`[env] REQUIRED variable missing: ${name}`)
  for (const o of report.missingOptional) console.warn(`[env] ${o.name} not set — ${o.effect}`)
  for (const w of report.warnings) console.warn(`[env] ${w}`)
}
