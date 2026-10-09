import { NextResponse } from 'next/server'

export function jsonError(status: number, error: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error, ...extra }, { status })
}

export const unauthorized = () => jsonError(401, 'Unauthorized')
export const notFound = () => jsonError(404, 'Not found')

/** Parses a JSON body; returns null on malformed JSON or non-object bodies. */
export async function readJsonObject(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await req.json()
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export function optionalString(value: unknown, max: number): string | null | undefined {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim().slice(0, max)
  return trimmed === '' ? null : trimmed
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/** Parses a non-negative euro amount (number or numeric string); undefined if invalid. */
export function parseAmount(value: unknown, { max = 10_000_000 }: { max?: number } = {}): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(n) || n < 0 || n > max) return undefined
  return Math.round(n * 100) / 100
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? Math.trunc(value) : NaN
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
