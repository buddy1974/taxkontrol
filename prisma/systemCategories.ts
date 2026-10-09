import type { TransactionType } from '@prisma/client'

/**
 * Global system categories. Upserted by id, so running this against any
 * database is non-destructive: existing rows are left untouched.
 */
export const SYSTEM_CATEGORIES: Array<{ id: string; name: string; nameDe: string; type: TransactionType }> = [
  { id: 'cat-income-general', name: 'General income', nameDe: 'Allgemeine Einnahmen', type: 'INCOME' },
  { id: 'cat-income-consulting', name: 'Consulting', nameDe: 'Beratung', type: 'INCOME' },
  { id: 'cat-expense-rent', name: 'Office rent', nameDe: 'Büromiete', type: 'EXPENSE' },
  { id: 'cat-expense-phone', name: 'Phone & internet', nameDe: 'Telefon & Internet', type: 'EXPENSE' },
  { id: 'cat-expense-supplies', name: 'Office supplies', nameDe: 'Büromaterial', type: 'EXPENSE' },
  { id: 'cat-expense-software', name: 'Software & tools', nameDe: 'Software', type: 'EXPENSE' },
  { id: 'cat-expense-transport', name: 'Transport', nameDe: 'Transport', type: 'EXPENSE' },
]
