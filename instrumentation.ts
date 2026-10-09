/** Runs once when a server instance starts (Next.js instrumentation hook). */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { logEnvironmentReport } = await import('./lib/env')
    logEnvironmentReport()
  }
}
