import { defineConfig, devices } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT ?? 3217)
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://taxkontrol:taxkontrol_test@localhost:55440/taxkontrol_test'

/**
 * End-to-end tests against the production build (`npm run build` first).
 * Runs on the isolated local test database. Object storage and AI are
 * deliberately disabled, so no real customer data or external service is touched.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './tests/e2e/globalSetup.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'de-DE',
    timezoneId: 'Europe/Berlin',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    // WebKit (Safari engine): iPhone and iPad. Opt-in via E2E_WEBKIT=1 (CI installs Chromium only).
    ...(process.env.E2E_WEBKIT === '1'
      ? [
          { name: 'iphone', use: { ...devices['iPhone 14'] } },
          { name: 'tablet', use: { ...devices['iPad Mini'] } },
        ]
      : []),
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: TEST_DATABASE_URL,
      NEXTAUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
      AUTH_SECRET: 'e2e-only-secret-not-used-anywhere-else-0123456789',
      NEXTAUTH_URL: `http://localhost:${PORT}`,
      AUTH_URL: `http://localhost:${PORT}`,
      AUTH_TRUST_HOST: 'true',
      ANTHROPIC_API_KEY: '',
      CLOUDFLARE_R2_ACCOUNT_ID: 'e2e-disabled',
      CLOUDFLARE_R2_ACCESS_KEY: 'e2e-disabled',
      CLOUDFLARE_R2_SECRET_KEY: 'e2e-disabled',
      CLOUDFLARE_R2_BUCKET: 'e2e-disabled',
      DEV_BYPASS_LOGIN: 'false',
      TELEGRAM_BOT_TOKEN: '',
    },
  },
})
