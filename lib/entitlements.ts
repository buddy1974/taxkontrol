import { db } from '@/lib/db'
import { EntitlementFeature, ProductSku } from '@prisma/client'

/**
 * Entitlement helper layer (Sprint 15.1).
 *
 * Architecture: Option C — Purchase (ledger) → Entitlement (derived projection).
 * This module is READ + RESOLVE only. It does not gate routes (Sprint 15.4) and
 * does not write entitlements — that is the verified Stripe webhook's job
 * (Sprint 15.3). Keeping grant logic centralized here means no part of the app
 * hardcodes the SKU set, which is what lets a future consumable SKU (Human
 * Review) slot in without touching callers.
 */

/** Derived, client-safe access flags. Stored compactly in the JWT. */
export interface EntitlementFlags {
  hasFinanzamt: boolean
  hasPreparation: boolean
  hasComplete: boolean
}

export const DEFAULT_ENTITLEMENT_FLAGS: EntitlementFlags = {
  hasFinanzamt: false,
  hasPreparation: false,
  hasComplete: false,
}

/**
 * Single source of truth for which features a paid SKU grants.
 * The Stripe webhook (15.3) will read this to write Entitlement rows.
 * KOMPLETT intentionally grants both lower-tier features so gating only ever
 * checks a FEATURE, never a SKU.
 */
export const SKU_GRANTS: Record<ProductSku, EntitlementFeature[]> = {
  [ProductSku.FINANZAMT_ASSISTENT]: [EntitlementFeature.FINANZAMT],
  [ProductSku.STEUERBERATER_VORBEREITUNG]: [EntitlementFeature.PREPARATION],
  [ProductSku.KOMPLETT]: [EntitlementFeature.FINANZAMT, EntitlementFeature.PREPARATION],
}

/** Features a given SKU unlocks. */
export function featuresForSku(sku: ProductSku): EntitlementFeature[] {
  return SKU_GRANTS[sku] ?? []
}

/** Active feature grants for a user, read from the Entitlement projection. */
export async function getUserEntitlements(userId: string): Promise<EntitlementFeature[]> {
  const rows = await db.entitlement.findMany({
    where: { userId, active: true },
    select: { feature: true },
  })
  return rows.map((r: { feature: EntitlementFeature }) => r.feature)
}

/** Pure resolver: feature list → client-safe flags. */
export function resolveFlags(features: EntitlementFeature[]): EntitlementFlags {
  const set = new Set(features)
  return {
    hasFinanzamt: set.has(EntitlementFeature.FINANZAMT),
    hasPreparation: set.has(EntitlementFeature.PREPARATION),
    hasComplete:
      set.has(EntitlementFeature.FINANZAMT) && set.has(EntitlementFeature.PREPARATION),
  }
}

/**
 * Convenience: load + resolve a user's flags in one call (one DB read).
 * Never throws: login must keep working even if the entitlement tables are not
 * migrated yet in an environment — the user then simply has no paid features.
 */
export async function getEntitlementFlags(userId: string): Promise<EntitlementFlags> {
  try {
    return resolveFlags(await getUserEntitlements(userId))
  } catch (err) {
    console.error('[entitlements] could not load flags:', err instanceof Error ? err.message : err)
    return DEFAULT_ENTITLEMENT_FLAGS
  }
}

/**
 * Paid-feature enforcement is switched on per environment with
 * ENTITLEMENTS_ENFORCED=true. It stays off until checkout (Stripe) exists and
 * the product owner has confirmed which features are paid — otherwise users
 * would be locked out of features they cannot buy.
 */
export function entitlementsEnforced(): boolean {
  return process.env.ENTITLEMENTS_ENFORCED === 'true'
}

/** Server-side gate for premium API routes. Returns null when access is allowed. */
export async function requireFeature(userId: string, feature: EntitlementFeature): Promise<Response | null> {
  if (!entitlementsEnforced()) return null
  if (await userHasFeature(userId, feature)) return null
  return new Response(
    JSON.stringify({ error: 'This feature is part of a paid package.', feature, upgradeUrl: '/upgrade' }),
    { status: 402, headers: { 'Content-Type': 'application/json' } }
  )
}

/** Server-side truth check for a single feature. Used by gates in Sprint 15.4. */
export async function userHasFeature(
  userId: string,
  feature: EntitlementFeature,
): Promise<boolean> {
  const count = await db.entitlement.count({
    where: { userId, feature, active: true },
  })
  return count > 0
}
