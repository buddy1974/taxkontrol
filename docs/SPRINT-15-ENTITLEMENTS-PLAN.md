# Sprint 15 — Entitlements & One-Time Unlocks (Architecture Plan)

> Status: **PROPOSAL — awaiting approval. No code written.**
> Business model: FREE app, one-time unlocks only. No subscriptions, no recurring billing, no credits, no monthly plans.
> Verified against codebase 2026-05-30: Stripe **not** installed, **no** entitlement model exists. Clean slate.

---

## 1. Entitlement Architecture

**Decision: ledger table as source of truth, access computed from it — not three mutable booleans on `User`.**

Reason: the spec's example booleans (`hasFinanzamtAssistant`...) work for read-path gating but lose the payment audit trail and make the Stripe webhook non-idempotent (replayed events would silently re-flip flags). A one-row-per-purchase ledger keyed on the Stripe session ID is replay-safe by construction and gives us a clean refund path. Access is derived, never stored redundantly.

**Three products, additive unlock logic:**

| Product enum | Price | Grants |
|---|---|---|
| `FINANZAMT_ASSISTENT` | 49€ | Finanzamt features |
| `STEUERBERATER_VORBEREITUNG` | 99€ | Steuerberater-prep features |
| `KOMPLETT` | 149€ | Everything (implies both above) |

**Access resolution (`lib/entitlements.ts`):**

```
hasFinanzamt    = active(KOMPLETT) || active(FINANZAMT_ASSISTENT)
hasPreparation  = active(KOMPLETT) || active(STEUERBERATER_VORBEREITUNG)
hasComplete     = active(KOMPLETT)
```

`active(x)` = an `Entitlement` row for the user with that product and `status = ACTIVE`. Idempotent, stackable, refund-aware.

**Gating happens in two layers:**
- **Server (authority):** `requireEntitlement('finanzamt')` guard at the top of every premium API route + premium page. This is the real lock — never trust the client.
- **Client (UX only):** entitlement flags read from the session/JWT to show/hide CTAs and render the paywall. Cosmetic.

> **Correction (2026-10-09):** the earlier claim that `proxy.ts` is never loaded was wrong. Next.js 16 replaced `middleware.ts` with `proxy.ts` and the build lists "Proxy (Middleware)". Entitlement gating still belongs in route handlers (server-side), which is what RC2 implements behind `ENTITLEMENTS_ENFORCED`.
>
> **Implementation note:** the shipped schema uses a `Purchase` ledger + `Entitlement` projection (migration `20260530150000_add_entitlements`), not the single-table model sketched below.

---

## 2. Database Changes

One new model + one enum. Additive, non-destructive — safe migration.

```prisma
model Entitlement {
  id                      String            @id @default(cuid())
  userId                  String
  user                    User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  product                 EntitlementProduct
  status                  EntitlementStatus @default(ACTIVE)
  stripeCheckoutSessionId String            @unique   // idempotency key for webhook
  stripePaymentIntentId   String?
  amountCents             Int
  currency                String            @default("eur")
  grantedAt               DateTime          @default(now())
  refundedAt              DateTime?
  createdAt               DateTime          @default(now())

  @@index([userId, product])
}

enum EntitlementProduct {
  FINANZAMT_ASSISTENT
  STEUERBERATER_VORBEREITUNG
  KOMPLETT
}

enum EntitlementStatus {
  ACTIVE
  REFUNDED
}
```

Plus on `User`: add `entitlements Entitlement[]`.

Migration: `prisma migrate dev --name add_entitlements` locally, committed; `prisma migrate deploy` runs in the Vercel build (build script already runs `prisma generate` first — confirm migrate step is wired).

> Note the existing Prisma quirk: app uses `@prisma/adapter-pg` (PrismaPg), not plain `PrismaClient`. No change to that — just regenerate.

---

## 3. Stripe Integration Plan

**Mode: `payment` (one-time). Never `subscription`.** This is the structural guarantee that the locked business model can't be violated by accident.

**New env vars** (`.env.local` + Vercel dashboard):
```
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_FINANZAMT          # one-time price, 49€
STRIPE_PRICE_STEUERBERATER      # one-time price, 99€
STRIPE_PRICE_KOMPLETT           # one-time price, 149€
NEXT_PUBLIC_APP_URL             # for success/cancel redirect URLs
```

**Stripe Dashboard setup (manual, one-time):** create 3 Products, each with a single **one-time** Price in EUR. No recurring interval.

**Checkout** — `POST /api/v1/checkout`:
- Authenticated. Body: `{ product }`.
- Reject if the user already has access to that product (no double-charge).
- Create Checkout Session: `mode: 'payment'`, the matching `price`, `client_reference_id = userId`, `metadata: { userId, product }`, `success_url = /upgrade/success?session_id={CHECKOUT_SESSION_ID}`, `cancel_url = /upgrade`.
- Return the session URL; client redirects.

**Webhook** — `POST /api/v1/stripe/webhook` (the source of truth for granting):
- Read **raw body** (`await req.text()`), verify signature with `STRIPE_WEBHOOK_SECRET`.
- Handle `checkout.session.completed` → `upsert` an `Entitlement` keyed on `stripeCheckoutSessionId` (idempotent — Stripe retries safely).
- Handle `charge.refunded` → set matching entitlement `status = REFUNDED`, `refundedAt`.
- Return 200 fast; never block on heavy work.
- Add this path to any route-protection allowlist (it must be reachable unauthenticated by Stripe).

**§19 compliance flag (Kleinunternehmer):** the merchant of record is your business (§19 UStG, no VAT). Stripe Tax must be **OFF**, no USt-ID, and the customer receipt/invoice must carry *"Gemäß §19 UStG wird keine Umsatzsteuer berechnet."* Configure this in Stripe's invoice/receipt settings — decide before going live.

---

## 4. Upgrade Flow

```
Premium feature locked
   → PaywallGate shows "Freischalten" CTA   (NOT "Jetzt kaufen" on landing — see CTA strategy)
   → POST /api/v1/checkout { product }
   → redirect to Stripe Checkout (mode: payment)
   → user pays
   → Stripe redirects → /upgrade/success?session_id=...
        (async, in parallel) Stripe → webhook → Entitlement upserted  ← real grant
   → success page calls GET /api/v1/me/entitlements, polls briefly until ACTIVE
        (handles webhook lag race; falls back to "wird aktiviert…" then auto-unlocks)
   → session/JWT refreshed → premium UI unlocked permanently
```

Landing-page CTA stays **"Kostenlos starten"**. Users hit the paywall only when they reach into a premium feature — value first, payment second.

---

## 5. Files to CREATE

```
prisma/migrations/<ts>_add_entitlements/   # generated
lib/stripe.ts                              # server Stripe client (singleton)
lib/entitlements.ts                        # active()/hasFinanzamt/hasPreparation/hasComplete + requireEntitlement() guard
app/api/v1/checkout/route.ts               # create Checkout Session (mode: payment)
app/api/v1/stripe/webhook/route.ts         # signature verify + idempotent grant + refund
app/api/v1/me/entitlements/route.ts        # GET current access (success-page poll + client gating)
app/(app)/upgrade/page.tsx                 # 3-tier unlock page, "Freischalten" CTAs
app/(app)/upgrade/success/page.tsx         # post-payment poll + confirm
components/premium/PaywallGate.tsx          # wraps locked UI, shows CTA when no access
types/next-auth.d.ts                        # augment Session/JWT with entitlement flags (no augmentation file exists today)
```

## 6. Files to MODIFY

```
prisma/schema.prisma                        # + Entitlement model, enums, User relation
lib/auth.ts                                 # jwt(): load entitlement flags; session(): expose them
app/page.tsx                                # confirm/keep "Kostenlos starten" CTA, add upgrade link
app/(app)/guidance/page.tsx                 # PaywallGate around premium sections
app/(app)/guidance/[caseId]/page.tsx        # server guard (Finanzamt = 49€ tier)
app/api/v1/guidance/analyze-letter/route.ts        # requireEntitlement('finanzamt')
app/api/v1/guidance/preparation-package/route.ts   # requireEntitlement('preparation')
app/api/v1/guidance/preparation-package/export/route.ts  # requireEntitlement('preparation')
# .env.local + Vercel env: add the 5 Stripe vars above
```

> ⚠️ **Flag — tier mapping needs your sign-off.** I mapped premium routes from names:
> - `guidance/analyze-letter` → Finanzamt (49€)
> - `guidance/preparation-package(+export)` → Steuerberater (99€)
> - `guidance/suggestions`, `guidance/tasks`, `guidance/persona`, `guidance/cases`, `decision-center/*` → **unassigned.** Are these free (basic guidance) or premium? Confirm before I lock the guards.

---

## Vercel Cost Note
Net build impact = **1 deploy**: one `stripe` dependency + one additive migration + the new routes. No ISR/image/middleware-heavy paths touched. Webhook/checkout are light serverless functions, billed on invocation not build. Batch the entire Sprint 15 into a single push — do not deploy file-by-file.

## Production-readiness gates before launch
- Webhook signature verification tested with Stripe CLI (`stripe listen`) locally.
- Idempotency proven (replay the same `checkout.session.completed`, assert one entitlement).
- Refund path flips status and re-locks features.
- Server guards confirmed to 403 without entitlement (don't rely on hidden UI).
- §19 receipt text + Stripe Tax OFF verified in Stripe settings.

---

## Open decisions for you (Product Owner)
1. **Entitlement ledger vs. boolean flags** — I recommend the ledger (above). Approve or override.
2. **Tier mapping** of `suggestions / tasks / persona / cases / decision-center` — free or paid?
3. **Stripe receipt/§19** handling — confirm Kleinunternehmer invoice text + Tax OFF.

**STOP — awaiting approval before implementation.**
