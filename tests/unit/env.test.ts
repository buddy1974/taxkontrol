import { describe, it, expect } from 'vitest'
import { checkEnvironment } from '@/lib/env'

describe('environment check', () => {
  it('reports missing required variables by name only', () => {
    const r = checkEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)
    expect(r.missingRequired).toEqual(['DATABASE_URL', 'AUTH_SECRET or NEXTAUTH_SECRET'])
  })

  it('accepts either auth secret name and flags short secrets', () => {
    const r = checkEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x', NEXTAUTH_SECRET: 'short' } as NodeJS.ProcessEnv)
    expect(r.missingRequired).toEqual([])
    expect(r.warnings.join(' ')).toMatch(/shorter than 32/)
  })

  it('warns when the dev bypass is configured on a deployment and never echoes values', () => {
    const env = { NODE_ENV: 'production', DATABASE_URL: 'postgres://secret-host', AUTH_SECRET: 'x'.repeat(40), VERCEL_ENV: 'production', DEV_BYPASS_LOGIN: 'true' } as NodeJS.ProcessEnv
    const r = checkEnvironment(env)
    expect(r.warnings.join(' ')).toMatch(/DEV_BYPASS_LOGIN/)
    expect(JSON.stringify(r)).not.toContain('secret-host')
  })
})
