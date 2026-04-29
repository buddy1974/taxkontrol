import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import bcrypt from 'bcryptjs'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const db = new PrismaClient({ adapter })

async function main() {
  console.log('Seeding database...')

  // Clean existing data
  await db.transaction.deleteMany()
  await db.taxReserve.deleteMany()
  await db.fixedCost.deleteMany()
  await db.receivable.deleteMany()
  await db.payable.deleteMany()
  await db.employee.deleteMany()
  await db.taxProfile.deleteMany()
  await db.user.deleteMany()

  // Create user
  const passwordHash = await bcrypt.hash('taxkontrol2024', 12)
  const user = await db.user.create({
    data: {
      name: 'Lone',
      email: 'lone@taxkontrol.com',
      passwordHash,
      businessName: 'Lone Enterprises',
      taxType: 'REGELBESTEUERUNG',
      isJobcenter: false,
    },
  })

  console.log('Created user:', user.email)

  // Create tax profile
  await db.taxProfile.create({
    data: {
      userId: user.id,
      incomeTaxRate: 30,
      vatReserveRate: 19,
      incomeTaxReserveRate: 30,
      solidaritySurcharge: true,
    },
  })

  // Create categories
  const categories = await Promise.all([
    db.category.upsert({
      where: { id: 'cat-income-general' },
      update: {},
      create: { id: 'cat-income-general', name: 'General income', nameDe: 'Allgemeine Einnahmen', type: 'INCOME', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-income-consulting' },
      update: {},
      create: { id: 'cat-income-consulting', name: 'Consulting', nameDe: 'Beratung', type: 'INCOME', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-expense-rent' },
      update: {},
      create: { id: 'cat-expense-rent', name: 'Office rent', nameDe: 'Büromiete', type: 'EXPENSE', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-expense-phone' },
      update: {},
      create: { id: 'cat-expense-phone', name: 'Phone & internet', nameDe: 'Telefon & Internet', type: 'EXPENSE', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-expense-supplies' },
      update: {},
      create: { id: 'cat-expense-supplies', name: 'Office supplies', nameDe: 'Büromaterial', type: 'EXPENSE', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-expense-software' },
      update: {},
      create: { id: 'cat-expense-software', name: 'Software & tools', nameDe: 'Software', type: 'EXPENSE', isSystem: true },
    }),
    db.category.upsert({
      where: { id: 'cat-expense-transport' },
      update: {},
      create: { id: 'cat-expense-transport', name: 'Transport', nameDe: 'Transport', type: 'EXPENSE', isSystem: true },
    }),
  ])

  console.log('Created categories:', categories.length)

  // Create transactions this month
  const now = new Date()
  const thisMonth = (day: number) => new Date(now.getFullYear(), now.getMonth(), day)

  const transactions = await Promise.all([
    // Income
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'INCOME',
        amount: 2380,
        grossAmount: 2380,
        netAmount: 2000,
        vatAmount: 380,
        vatRate: 19,
        description: 'Web design project - Client A',
        merchant: 'Client A GmbH',
        categoryId: 'cat-income-consulting',
        usage: 'BUSINESS',
        businessPct: 100,
        businessAmount: 2000,
        privateAmount: 0,
        paymentMethod: 'BANK',
        transactionDate: thisMonth(3),
      },
    }),
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'INCOME',
        amount: 1190,
        grossAmount: 1190,
        netAmount: 1000,
        vatAmount: 190,
        vatRate: 19,
        description: 'Monthly retainer - Client B',
        merchant: 'Client B UG',
        categoryId: 'cat-income-consulting',
        usage: 'BUSINESS',
        businessPct: 100,
        businessAmount: 1000,
        privateAmount: 0,
        paymentMethod: 'BANK',
        transactionDate: thisMonth(8),
      },
    }),
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'INCOME',
        amount: 595,
        grossAmount: 595,
        netAmount: 500,
        vatAmount: 95,
        vatRate: 19,
        description: 'Logo design',
        merchant: 'Freelance Client',
        categoryId: 'cat-income-general',
        usage: 'BUSINESS',
        businessPct: 100,
        businessAmount: 500,
        privateAmount: 0,
        paymentMethod: 'BANK',
        transactionDate: thisMonth(12),
      },
    }),
    // Expenses
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'EXPENSE',
        amount: 119,
        grossAmount: 119,
        netAmount: 100,
        vatAmount: 19,
        vatRate: 19,
        description: 'Adobe Creative Cloud',
        merchant: 'Adobe',
        categoryId: 'cat-expense-software',
        usage: 'BUSINESS',
        businessPct: 100,
        businessAmount: 100,
        privateAmount: 0,
        paymentMethod: 'CARD',
        transactionDate: thisMonth(1),
      },
    }),
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'EXPENSE',
        amount: 59.50,
        grossAmount: 59.50,
        netAmount: 50,
        vatAmount: 9.50,
        vatRate: 19,
        description: 'Phone bill',
        merchant: 'Telekom',
        categoryId: 'cat-expense-phone',
        usage: 'MIXED',
        businessPct: 70,
        businessAmount: 35,
        privateAmount: 15,
        paymentMethod: 'BANK',
        transactionDate: thisMonth(5),
      },
    }),
    db.transaction.create({
      data: {
        userId: user.id,
        type: 'EXPENSE',
        amount: 238,
        grossAmount: 238,
        netAmount: 200,
        vatAmount: 38,
        vatRate: 19,
        description: 'Office supplies',
        merchant: 'Staples',
        categoryId: 'cat-expense-supplies',
        usage: 'BUSINESS',
        businessPct: 100,
        businessAmount: 200,
        privateAmount: 0,
        paymentMethod: 'CARD',
        transactionDate: thisMonth(10),
      },
    }),
  ])

  console.log('Created transactions:', transactions.length)

  // Create fixed costs
  await Promise.all([
    db.fixedCost.create({
      data: {
        userId: user.id,
        name: 'Office rent',
        amount: 800,
        usage: 'BUSINESS',
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        isActive: true,
        categoryId: 'cat-expense-rent',
      },
    }),
    db.fixedCost.create({
      data: {
        userId: user.id,
        name: 'Phone & internet',
        amount: 59.50,
        usage: 'MIXED',
        frequency: 'MONTHLY',
        dayOfMonth: 5,
        isActive: true,
        categoryId: 'cat-expense-phone',
      },
    }),
    db.fixedCost.create({
      data: {
        userId: user.id,
        name: 'Adobe Creative Cloud',
        amount: 119,
        usage: 'BUSINESS',
        frequency: 'MONTHLY',
        dayOfMonth: 1,
        isActive: true,
        categoryId: 'cat-expense-software',
      },
    }),
  ])

  console.log('Created fixed costs')

  // Create tax reserve
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  await db.taxReserve.create({
    data: {
      userId: user.id,
      type: 'VAT',
      periodStart: startOfMonth,
      periodEnd: endOfMonth,
      shouldHave: 665,
      actuallyReserved: 400,
      missing: 265,
    },
  })

  await db.taxReserve.create({
    data: {
      userId: user.id,
      type: 'INCOME_TAX',
      periodStart: startOfMonth,
      periodEnd: endOfMonth,
      shouldHave: 450,
      actuallyReserved: 200,
      missing: 250,
    },
  })

  console.log('Created tax reserves')

  // Create receivables
  await Promise.all([
    db.receivable.create({
      data: {
        userId: user.id,
        customerName: 'Client C GmbH',
        description: 'Invoice #2024-015 — Brand identity',
        totalAmount: 1785,
        paidAmount: 0,
        outstandingAmount: 1785,
        dueDate: new Date(now.getFullYear(), now.getMonth(), 20),
        status: 'OPEN',
      },
    }),
    db.receivable.create({
      data: {
        userId: user.id,
        customerName: 'Client D UG',
        description: 'Invoice #2024-014 — Website maintenance',
        totalAmount: 595,
        paidAmount: 300,
        outstandingAmount: 295,
        dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 15),
        status: 'PARTIAL',
      },
    }),
  ])

  console.log('Created receivables')

  // Create payables
  await db.payable.create({
    data: {
      userId: user.id,
      supplierName: 'Freelancer Max',
      description: 'Design subcontract — project support',
      totalAmount: 500,
      paidAmount: 0,
      outstandingAmount: 500,
      dueDate: new Date(now.getFullYear(), now.getMonth(), 25),
      status: 'OPEN',
    },
  })

  console.log('Created payables')

  console.log('Seed complete.')
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
