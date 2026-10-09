import { test } from '@playwright/test'

/**
 * Visual review helper (not an assertion test): captures full-page screenshots
 * of the main journey with realistic data. Run with:
 *   SCREENSHOTS=1 npx playwright test screens --project=mobile
 * Output: playwright-screens/<project>/*.png (git-ignored)
 */
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to capture review screenshots')

test('capture main screens', async ({ page }, info) => {
  const dir = `playwright-screens/${info.project.name}`
  const email = `screens-${info.project.name}-${Date.now()}@e2e.local`
  const password = 'e2e password 2026'
  await page.setExtraHTTPHeaders({ 'x-real-ip': `10.9.${Math.floor(Math.random() * 250)}.1` })

  await page.goto('/register')
  await page.locator('input[name="name"]').fill('Selin Yılmaz')
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await page.waitForURL(/\/login/)
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL(/\/onboarding/)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.screenshot({ path: `${dir}/01-onboarding-vat.png`, fullPage: true })
  await page.getByRole('button', { name: /Yes — I charge VAT/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /Next|Go to dashboard/ }).click()
  await page.waitForURL(/\/dashboard/)

  const api = page.request
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const add = (data: Record<string, unknown>) => api.post('/api/v1/transactions', { data: { transactionDate: today, ...data } })
  await add({ type: 'INCOME', grossAmount: 2380, vatRate: 19, description: 'Webdesign Kunde A', merchant: 'Kunde A GmbH' })
  await add({ type: 'INCOME', grossAmount: 1500, usage: 'PRIVATE', vatRate: 0, description: 'Darlehen Familie' })
  await add({ type: 'EXPENSE', grossAmount: 119, vatRate: 19, description: 'Adobe Creative Cloud', merchant: 'Adobe' })
  await add({ type: 'EXPENSE', grossAmount: '59.50', vatRate: 19, usage: 'MIXED', businessPct: 70, description: 'Handyvertrag' })
  await add({ type: 'EXPENSE', grossAmount: 64.2, vatRate: 0, usage: 'UNSURE', description: 'REWE' })
  await api.post('/api/v1/fixed-costs', { data: { name: 'Büromiete', amount: 650, frequency: 'MONTHLY', dayOfMonth: 28 } })
  await api.post('/api/v1/payables', { data: { supplierName: 'Druckerei Müller', totalAmount: 240, dueDate: today } })

  for (const [name, path] of [
    ['02-dashboard', '/dashboard'],
    ['03-input', '/input?type=EXPENSE'],
    ['04-transactions-review', '/transactions?review=1'],
    ['05-money', '/money'],
    ['06-tax', '/tax'],
    ['07-reports', '/reports'],
    ['08-jobcenter', '/jobcenter'],
    ['09-import', '/import'],
    ['10-settings', '/settings'],
  ] as const) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true })
  }
  await page.context().clearCookies()
  await page.goto('/impressum')
  await page.screenshot({ path: `${dir}/11-impressum.png`, fullPage: true })
})
