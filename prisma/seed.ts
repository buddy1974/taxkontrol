/**
 * TaxKontrol seed.
 *
 *   npm run seed:system   Upserts the global system categories. Non-destructive;
 *                         safe for any database, but a non-local target still
 *                         requires SEED_CONFIRM_REMOTE=<database host>.
 *   npm run seed:demo     Creates a demo account with sample data. LOCAL DATABASES
 *                         ONLY. Deletes nothing except that demo account's own data.
 *
 * There is intentionally no mode that deletes other users' data.
 */
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'crypto'
import { isLocalDatabaseUrl, databaseHost } from '../lib/dbTarget'
import { SYSTEM_CATEGORIES } from './systemCategories'
import { berlinDate, berlinMidnight } from '../lib/time/berlin'

const DEMO_EMAIL = 'demo@taxkontrol.local'

function fail(message: string): never {
  console.error(`\n[seed] REFUSED: ${message}\n`)
  process.exit(1)
}

async function seedSystem(db: PrismaClient) {
  for (const c of SYSTEM_CATEGORIES) {
    await db.category.upsert({
      where: { id: c.id },
      update: {},
      create: { ...c, isSystem: true },
    })
  }
  console.log(`[seed] system categories ensured: ${SYSTEM_CATEGORIES.length}`)
}

async function seedDemo(db: PrismaClient) {
  const password = process.env.SEED_DEMO_PASSWORD || randomBytes(12).toString('base64url')
  const passwordHash = await bcrypt.hash(password, 12)

  // Remove only the previous demo account's own data.
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } })
  if (existing) {
    const { deleteUserData } = await import('../lib/account/deleteUserData')
    await deleteUserData(db, existing.id)
  }

  const user = await db.user.create({
    data: {
      name: 'Demo Unternehmerin',
      email: DEMO_EMAIL,
      passwordHash,
      businessName: 'Demo Design Studio',
      taxType: 'REGELBESTEUERUNG',
      isJobcenter: false,
      taxProfile: { create: { solidaritySurcharge: true } },
    },
  })

  const today = berlinDate()
  const day = (d: number) => new Date(berlinMidnight(today.year, today.month, d).getTime() + 12 * 3600_000)

  type Tx = {
    type: 'INCOME' | 'EXPENSE'
    gross: number
    vatRate: number
    usage: 'BUSINESS' | 'PRIVATE' | 'MIXED'
    businessPct: number
    description: string
    merchant: string
    categoryId: string
    paymentMethod: 'BANK' | 'CARD' | 'CASH'
    day: number
  }
  const { computeTransactionAmounts } = await import('../lib/finance/transactionAmounts')
  const txs: Tx[] = [
    { type: 'INCOME', gross: 2380, vatRate: 19, usage: 'BUSINESS', businessPct: 100, description: 'Webdesign Projekt – Kunde A', merchant: 'Kunde A GmbH', categoryId: 'cat-income-consulting', paymentMethod: 'BANK', day: 3 },
    { type: 'INCOME', gross: 1190, vatRate: 19, usage: 'BUSINESS', businessPct: 100, description: 'Monatliche Betreuung – Kunde B', merchant: 'Kunde B UG', categoryId: 'cat-income-consulting', paymentMethod: 'BANK', day: 8 },
    { type: 'EXPENSE', gross: 119, vatRate: 19, usage: 'BUSINESS', businessPct: 100, description: 'Adobe Creative Cloud', merchant: 'Adobe', categoryId: 'cat-expense-software', paymentMethod: 'CARD', day: 1 },
    { type: 'EXPENSE', gross: 59.5, vatRate: 19, usage: 'MIXED', businessPct: 70, description: 'Handyrechnung', merchant: 'Telekom', categoryId: 'cat-expense-phone', paymentMethod: 'BANK', day: 5 },
  ]
  for (const t of txs) {
    const amounts = computeTransactionAmounts({
      type: t.type,
      grossAmount: t.gross,
      vatRate: t.vatRate,
      usage: t.usage,
      businessPct: t.businessPct,
      taxType: 'REGELBESTEUERUNG',
    })
    await db.transaction.create({
      data: {
        userId: user.id,
        type: t.type,
        description: t.description,
        merchant: t.merchant,
        categoryId: t.categoryId,
        paymentMethod: t.paymentMethod,
        transactionDate: day(Math.min(t.day, today.day)),
        ...amounts.db,
      },
    })
  }

  await db.fixedCost.createMany({
    data: [
      { userId: user.id, name: 'Büromiete', amount: 800, usage: 'BUSINESS', frequency: 'MONTHLY', dayOfMonth: 1, categoryId: 'cat-expense-rent' },
      { userId: user.id, name: 'Adobe Creative Cloud', amount: 119, usage: 'BUSINESS', frequency: 'MONTHLY', dayOfMonth: 1, categoryId: 'cat-expense-software' },
    ],
  })

  await db.receivable.create({
    data: {
      userId: user.id,
      customerName: 'Kunde C GmbH',
      description: 'Rechnung 2026-015',
      totalAmount: 1785,
      paidAmount: 0,
      outstandingAmount: 1785,
      dueDate: day(Math.min(28, today.day + 10)),
      status: 'OPEN',
    },
  })

  console.log(`[seed] demo account created: ${DEMO_EMAIL}`)
  if (!process.env.SEED_DEMO_PASSWORD) {
    console.log(`[seed] generated demo password (local use only): ${password}`)
  }
}

async function main() {
  const mode = process.argv[2] ?? 'system'
  const url = process.env.DATABASE_URL
  if (!url) fail('DATABASE_URL is not set.')
  const host = databaseHost(url) ?? 'unknown'
  const local = isLocalDatabaseUrl(url)

  if (mode === 'demo' && !local) {
    fail(`demo seed only runs against a local database (target host: ${host}).`)
  }
  if (mode === 'system' && !local && process.env.SEED_CONFIRM_REMOTE !== host) {
    fail(`target is a non-local database (${host}). Re-run with SEED_CONFIRM_REMOTE=${host} if this is intended.`)
  }
  if (mode !== 'system' && mode !== 'demo') fail(`unknown mode "${mode}" (use "system" or "demo").`)

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })
  try {
    console.log(`[seed] mode=${mode} target=${host}`)
    await seedSystem(db)
    if (mode === 'demo') await seedDemo(db)
  } finally {
    await db.$disconnect()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
