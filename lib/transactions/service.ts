import type { Prisma, PrismaClient, PaymentMethod } from '@prisma/client'
import { db } from '@/lib/db'
import {
  computeTransactionAmounts,
  TransactionValidationError,
  type TaxType,
  type TxType,
  type Usage,
} from '@/lib/finance/transactionAmounts'
import { parseCalendarDate } from '@/lib/time/berlin'
import { recordAudit, diffFields, type AuditSource } from '@/lib/audit'
import { fromCents, toCents } from '@/lib/finance/money'
import { parseEuroInput } from '@/lib/finance/parseEuro'

type Client = PrismaClient | Prisma.TransactionClient

export const USAGES: readonly Usage[] = ['BUSINESS', 'PRIVATE', 'MIXED', 'UNSURE']
export const PAYMENT_METHODS: readonly PaymentMethod[] = ['BANK', 'CASH', 'CARD']

export interface TransactionInput {
  type: TxType
  grossAmount: number | string
  vatRate: number
  usage: Usage
  businessPct: number
  transactionDate: Date
  description: string | null
  merchant: string | null
  categoryId: string | null
  paymentMethod: PaymentMethod
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim().slice(0, max)
  return t === '' ? null : t
}

/**
 * Validates an untrusted request body into a TransactionInput.
 * Throws TransactionValidationError with a user-readable message.
 */
export function parseTransactionInput(body: Record<string, unknown>, partial?: TransactionInput): TransactionInput {
  const pick = <K extends keyof TransactionInput>(key: K): unknown => (body[key] !== undefined ? body[key] : partial?.[key])

  const type = pick('type')
  if (type !== 'INCOME' && type !== 'EXPENSE') throw new TransactionValidationError('type', 'Choose money in (INCOME) or money out (EXPENSE).')

  const usageRaw = pick('usage') ?? 'BUSINESS'
  if (!USAGES.includes(usageRaw as Usage)) throw new TransactionValidationError('usage', 'Choose business, private, mixed or not sure.')

  const pm = pick('paymentMethod') ?? 'BANK'
  if (!PAYMENT_METHODS.includes(pm as PaymentMethod)) throw new TransactionValidationError('paymentMethod', 'Unknown payment method.')

  const rawDate = pick('transactionDate')
  const date = rawDate instanceof Date ? rawDate : parseCalendarDate(rawDate)
  if (!date) throw new TransactionValidationError('transactionDate', 'Please enter a valid date.')
  const year = date.getUTCFullYear()
  if (year < 2000 || date.getTime() > Date.now() + 366 * 24 * 3600 * 1000) {
    throw new TransactionValidationError('transactionDate', 'The date looks wrong — please check the year.')
  }

  const gross = pick('grossAmount')
  const vat = pick('vatRate')
  const pct = pick('businessPct')

  const vatRate = vat === undefined || vat === null || vat === '' ? 0 : Number(vat)
  if (!Number.isFinite(vatRate)) throw new TransactionValidationError('vatRate', 'VAT rate must be 0, 7 or 19 %.')
  const parsedGross = parseEuroInput(gross)
  if (parsedGross === null) throw new TransactionValidationError('grossAmount', 'Please enter the amount as a number, e.g. 1234,56.')

  return {
    type,
    grossAmount: parsedGross,
    vatRate,
    usage: usageRaw as Usage,
    businessPct: pct === undefined || pct === null || pct === '' ? 100 : Number(pct),
    transactionDate: date,
    description: body.description !== undefined ? str(body.description, 500) : partial?.description ?? null,
    merchant: body.merchant !== undefined ? str(body.merchant, 200) : partial?.merchant ?? null,
    categoryId: body.categoryId !== undefined ? str(body.categoryId, 64) : partial?.categoryId ?? null,
    paymentMethod: pm as PaymentMethod,
  }
}

export async function getTaxType(userId: string, client: Client = db): Promise<TaxType> {
  const u = await client.user.findUnique({ where: { id: userId }, select: { taxType: true } })
  return (u?.taxType ?? 'KLEINUNTERNEHMER') as TaxType
}

async function validateCategory(categoryId: string | null, type: TxType, client: Client): Promise<string | null> {
  if (!categoryId) return null
  const cat = await client.category.findUnique({ where: { id: categoryId }, select: { type: true } })
  if (!cat) throw new TransactionValidationError('categoryId', 'Unknown category.')
  if (cat.type !== type) throw new TransactionValidationError('categoryId', 'This category does not match money in / money out.')
  return categoryId
}

export function buildTransactionData(input: TransactionInput, taxType: TaxType) {
  const amounts = computeTransactionAmounts({
    type: input.type,
    grossAmount: input.grossAmount,
    vatRate: input.vatRate,
    usage: input.usage,
    businessPct: input.businessPct,
    taxType,
  })
  return {
    amounts,
    data: {
      type: input.type,
      description: input.description,
      merchant: input.merchant,
      paymentMethod: input.paymentMethod,
      transactionDate: input.transactionDate,
      ...amounts.db,
    },
  }
}

export interface CreateOptions {
  source?: AuditSource
  documentId?: string | null
  isAiClassified?: boolean
  aiConfidence?: number | null
  forceReview?: boolean
}

export async function createTransaction(userId: string, input: TransactionInput, opts: CreateOptions = {}, client: Client = db) {
  const taxType = await getTaxType(userId, client)
  const categoryId = await validateCategory(input.categoryId, input.type, client)
  const { data } = buildTransactionData(input, taxType)
  const tx = await client.transaction.create({
    data: {
      ...data,
      userId,
      categoryId,
      documentId: opts.documentId ?? null,
      isAiClassified: opts.isAiClassified ?? false,
      aiConfidence: opts.aiConfidence ?? null,
      needsReview: data.needsReview || Boolean(opts.forceReview),
    },
  })
  await recordAudit(
    {
      userId,
      entityType: 'TRANSACTION',
      entityId: tx.id,
      action: opts.source === 'IMPORT' ? 'IMPORT' : 'CREATE',
      source: opts.source ?? 'USER',
      after: auditView(tx),
    },
    client
  )
  return tx
}

export async function updateTransaction(userId: string, id: string, body: Record<string, unknown>, client: Client = db) {
  const existing = await client.transaction.findFirst({ where: { id, userId } })
  if (!existing) return null
  const current: TransactionInput = {
    type: existing.type,
    grossAmount: existing.grossAmount.toString(),
    vatRate: Number(existing.vatRate),
    usage: existing.usage,
    businessPct: existing.businessPct,
    transactionDate: existing.transactionDate,
    description: existing.description,
    merchant: existing.merchant,
    categoryId: existing.categoryId,
    paymentMethod: existing.paymentMethod,
  }
  const input = parseTransactionInput(body, current)
  const taxType = await getTaxType(userId, client)
  const categoryId = await validateCategory(input.categoryId, input.type, client)
  const { data } = buildTransactionData(input, taxType)
  // A user correction clears the review flag unless the money is still unclear.
  const updated = await client.transaction.update({
    where: { id: existing.id },
    data: { ...data, categoryId, needsReview: data.needsReview },
  })
  const diff = diffFields(auditView(existing), auditView(updated))
  if (diff) {
    await recordAudit({ userId, entityType: 'TRANSACTION', entityId: id, action: 'UPDATE', before: diff.before, after: diff.after }, client)
  }
  return updated
}

export async function deleteTransaction(userId: string, id: string, client: Client = db) {
  const existing = await client.transaction.findFirst({ where: { id, userId } })
  if (!existing) return false
  await client.transaction.delete({ where: { id: existing.id } })
  // Unlink a receipt that pointed at this booking so it can be approved again.
  await client.document.updateMany({
    where: { userId, linkedTransactionId: id },
    data: { linkedTransactionId: null, reviewStatus: 'PENDING_REVIEW', status: 'NEEDS_REVIEW', approvedAt: null },
  })
  await recordAudit({ userId, entityType: 'TRANSACTION', entityId: id, action: 'DELETE', before: auditView(existing) }, client)
  return true
}

type TxLike = {
  type: string
  grossAmount: { toString(): string }
  netAmount: { toString(): string }
  vatAmount: { toString(): string }
  vatRate: { toString(): string }
  usage: string
  businessPct: number
  businessAmount: { toString(): string }
  privateAmount: { toString(): string }
  transactionDate: Date
  description: string | null
  merchant: string | null
  categoryId: string | null
  paymentMethod: string
  needsReview: boolean
}

export function auditView(t: TxLike): Record<string, unknown> {
  return {
    type: t.type,
    grossAmount: t.grossAmount.toString(),
    vatRate: t.vatRate.toString(),
    usage: t.usage,
    businessPct: t.businessPct,
    businessAmount: t.businessAmount.toString(),
    transactionDate: t.transactionDate.toISOString().slice(0, 10),
    description: t.description,
    merchant: t.merchant,
    categoryId: t.categoryId,
    paymentMethod: t.paymentMethod,
    needsReview: t.needsReview,
  }
}

/** JSON shape for API responses: Decimals as euro numbers. */
export function serializeTransaction<T extends TxLike & { id: string }>(t: T) {
  return {
    ...t,
    amount: fromCents(toCents(t.grossAmount)),
    grossAmount: fromCents(toCents(t.grossAmount)),
    netAmount: fromCents(toCents(t.netAmount)),
    vatAmount: fromCents(toCents(t.vatAmount)),
    vatRate: Number(t.vatRate.toString()),
    businessAmount: fromCents(toCents(t.businessAmount)),
    privateAmount: fromCents(toCents(t.privateAmount)),
  }
}
