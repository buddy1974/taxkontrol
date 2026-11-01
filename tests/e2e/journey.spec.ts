import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const PASSWORD = 'e2e password 2026'

function uniqueEmail(prefix: string, project: string) {
  return `${prefix}-${project}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@e2e.local`
}

// Each simulated visitor gets its own client IP so the per-IP registration
// limit (5 per 15 minutes) applies per visitor, as in production.
async function asNewVisitor(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
  await page.setExtraHTTPHeaders({ 'x-real-ip': ip })
}

async function register(page: Page, name: string, email: string) {
  await asNewVisitor(page)
  await page.goto('/register')
  await page.locator('input[name="name"]').fill(name)
  await page.locator('input[name="email"]').fill(email)
  await page.locator('input[name="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /create|register|sign up/i }).click()
  await page.waitForURL(/\/login/)
}

async function login(page: Page, email: string) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(PASSWORD)
  await page.getByRole('button', { name: /sign in|log in/i }).click()
}

/**
 * Saves the input form and waits for the server to confirm THIS save.
 * (A confirmation text alone is not proof: it could belong to an earlier save.)
 */
async function saveTransaction(page: Page) {
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/transactions') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Save transaction' }).click()
  expect((await response).status()).toBe(201)
  await expect(page.getByText(/^Saved\./)).toBeVisible()
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'page must not scroll horizontally').toBeLessThanOrEqual(1)
}

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
  const details = serious.flatMap(v => v.nodes.map(n => `${v.id}: ${n.html.slice(0, 140)} — ${(n.failureSummary ?? '').split('\n').pop()?.trim()}`))
  expect(details).toEqual([])
}

test.describe('public pages', () => {
  test('Impressum and Datenschutz are reachable without login', async ({ page }) => {
    for (const path of ['/impressum', '/datenschutz']) {
      const res = await page.goto(path)
      expect(res?.status()).toBe(200)
      expect(page.url()).toContain(path)
      await expectNoHorizontalScroll(page)
    }
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  })

  test('protected pages redirect to login and API answers 401', async ({ page, request }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/)
    const api = await request.get('/api/v1/transactions')
    expect(api.status()).toBe(401)
  })

  test('health endpoint reports a reachable database', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(200)
    expect((await res.json()).database).toBe('ok')
  })
})

test('first-time entrepreneur: register → onboarding → money in/out → dashboard → correction → reports', async ({ page }, info) => {
  const email = uniqueEmail('anna', info.project.name)
  await register(page, 'Anna Beispiel', email)
  await login(page, email)

  // Onboarding is required before any numbers are shown.
  await page.waitForURL(/\/onboarding/)
  await expectAccessible(page)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled()
  await page.getByRole('button', { name: /Kleinunternehmer/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Go to dashboard' }).click()

  await page.waitForURL(/\/dashboard/)
  await expect(page.getByText('No transactions yet')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  // Money in: customer payment. Kleinunternehmer → no VAT field.
  await page.goto('/input?type=INCOME')
  await expect(page.getByLabel(/VAT rate/)).toHaveCount(0)
  await page.getByLabel(/Total amount/).fill('1200')
  await page.getByLabel('Description').fill('Logo für Bäckerei Krause')
  await expect(page.getByText('Counts as business income')).toBeVisible()
  await saveTransaction(page)

  // Money in: a private loan must not become income.
  await page.getByRole('tab', { name: '+ Money in' }).click()
  await page.getByRole('button', { name: /Private money/ }).click()
  await page.getByLabel(/Total amount/).fill('2000')
  await page.getByLabel('Description').fill('Darlehen von Mama')
  await expect(page.getByText('Private money — not income')).toBeVisible()
  await saveTransaction(page)

  // Money out: mixed phone bill, 50 % business.
  await page.getByRole('tab', { name: '− Money out' }).click()
  await page.getByRole('button', { name: /^Mixed/ }).click()
  await page.getByLabel(/Total amount/).fill('40')
  await page.getByLabel('Description').fill('Handyvertrag')
  await saveTransaction(page)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  // Dashboard: loan shown but not counted; profit = 1200 − 20.
  await page.goto('/dashboard')
  await expect(page.getByText('This month step by step')).toBeVisible()
  await expect(page.getByText(/Not counted — private deposits \/ loans: 2\.000,00/)).toBeVisible()
  await expect(page.getByText(/Profit this month \(Gewinn, estimate\): 1\.180,00/)).toBeVisible()
  await expectNoHorizontalScroll(page)

  // Correct the phone bill to fully private: profit becomes 1200.
  await page.goto('/transactions')
  const row = page.getByRole('listitem').filter({ hasText: 'Handyvertrag' })
  await row.getByRole('button', { name: 'Correct' }).click()
  await row.getByRole('button', { name: 'Private', exact: true }).click()
  await row.getByRole('button', { name: 'Save correction' }).click()
  await expect(row.getByText('Private', { exact: true })).toBeVisible()
  await expectAccessible(page)

  await page.goto('/reports')
  await expect(page.getByText('1.200,00 €').first()).toBeVisible()
  await expect(page.getByText(/VAT \(Umsatzsteuer\)/)).toHaveCount(0)
  await expectNoHorizontalScroll(page)

  await page.goto('/tax')
  await expect(page.getByRole('heading', { name: /Tax reserve/ })).toBeVisible()
  await expect(page.getByText('VAT (Umsatzsteuer)')).toHaveCount(0)
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  // Another user must not see Anna's data.
  await page.context().clearCookies()
  const otherEmail = uniqueEmail('ben', info.project.name)
  await register(page, 'Ben Anders', otherEmail)
  await login(page, otherEmail)
  await page.waitForURL(/\/onboarding/)
  await page.goto('/transactions')
  await expect(page.getByText('No transactions yet.')).toBeVisible()
  await expect(page.getByText('Logo für Bäckerei Krause')).toHaveCount(0)
})

test('VAT-registered: income with VAT → tax page → payment to the Finanzamt is not a business expense', async ({ page }, info) => {
  const email = uniqueEmail('vat', info.project.name)
  await register(page, 'Vera Umsatz', email)
  await login(page, email)
  await page.waitForURL(/\/onboarding/)
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: /Yes — I charge VAT/ }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Go to dashboard' }).click()
  await page.waitForURL(/\/dashboard/)

  await page.goto('/input?type=INCOME')
  await page.getByLabel(/VAT rate/).selectOption('19')
  await page.getByLabel(/Total amount/).fill('1190')
  await page.getByLabel('Description').fill('Webdesign Kunde B')
  await saveTransaction(page)

  await page.goto('/tax')
  const vat = page.getByRole('region', { name: /^VAT \(Umsatzsteuer\)/ }).first()
  await expect(vat.getByText(/Usually due by \d\d\.\d\d\.\d{4}/)).toBeVisible()
  await vat.getByRole('button', { name: 'Record a payment to the Finanzamt' }).click()
  await expect(vat.getByLabel('Amount paid (€)')).toHaveValue('190')
  await expectAccessible(page)
  const saved = page.waitForResponse(r => r.url().endsWith('/api/v1/tax-reserve') && r.request().method() === 'POST')
  await vat.getByRole('button', { name: 'Save payment' }).click()
  expect((await saved).status()).toBe(201)
  await expect(page.getByRole('status').filter({ hasText: /Payment for VAT/ })).toBeVisible()
  await expect(vat.getByText('Paid (recorded)').locator('..').getByText('190,00 €')).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expectAccessible(page)

  // The payment is labelled and does not reduce profit (1,000 € net).
  await page.goto('/transactions')
  await expect(page.getByText('Tax payment · not a business expense')).toBeVisible()
  await page.goto('/dashboard')
  await expect(page.getByText(/Profit this month \(Gewinn, estimate\): 1\.000,00/)).toBeVisible()
  await expectNoHorizontalScroll(page)
})

test('error states: invalid amount and wrong password are explained', async ({ page }, info) => {
  const email = uniqueEmail('err', info.project.name)
  await register(page, 'Err Test', email)
  await page.goto('/login')
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill('wrong password 123')
  await page.getByRole('button', { name: /sign in|log in/i }).click()
  await expect(page.getByText(/Wrong email or password/)).toBeVisible()

  await login(page, email)
  await page.waitForURL(/\/onboarding/)
  await page.goto('/input?type=EXPENSE')
  // A successful save, then a refused one: the old confirmation must disappear.
  await page.getByLabel(/Total amount/).fill('12,50')
  await page.getByLabel('Description').fill('Druckerpapier')
  await saveTransaction(page)
  await page.getByLabel(/Total amount/).fill('-5')
  await page.getByRole('button', { name: 'Save transaction' }).click()
  await expect(page.locator('#form-error')).toContainText(/greater than 0/)
  await expect(page.getByText(/^Saved\./)).toHaveCount(0)
})

test('registration is rate limited per client IP', async ({ request }, info) => {
  test.skip(info.project.name !== 'desktop', 'server-side check, run once')
  const headers = { 'x-real-ip': '10.250.250.250', 'Content-Type': 'application/json' }
  const statuses: number[] = []
  for (let i = 0; i < 6; i++) {
    const res = await request.post('/api/v1/auth/register', {
      headers,
      data: { name: 'Rate Test', email: uniqueEmail(`rl${i}`, 'x'), password: PASSWORD },
    })
    statuses.push(res.status())
  }
  expect(statuses.slice(0, 5).every(s => s === 201)).toBe(true)
  expect(statuses[5]).toBe(429)
})
