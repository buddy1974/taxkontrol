# Repository Map — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel (Maxpromo Digital) |
| Repository class | Maxpromo / AI-assisted |
| Lifecycle stage | **Beta** — release candidate RC2 for controlled real-user testing (not publicly launched) |
| Security tier | S2 (personal financial data) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## 1. Folder Structure

| Path | Purpose |
|---|---|
| `app/(app)/*` | Signed-in pages (dashboard, input, transactions, documents, tax, money, reports, jobcenter, settings, guidance, decision centre, CRUD pages) |
| `app/(auth)/*` | Login, register |
| `app/api/v1/*` | JSON API (all routes authenticate and scope by `userId`) |
| `app/api/health` | Liveness + DB check (public) |
| `app/impressum`, `app/datenschutz`, `app/contact` | Public legal/contact pages |
| `lib/finance/*` | **All money maths** (pure, integer cents, versioned rules) |
| `lib/time/berlin.ts` | German calendar boundaries |
| `lib/transactions/service.ts` | Create/update/delete transactions with validation + audit |
| `lib/ai/*` | Claude SDK client, schemas, suggestion helpers |
| `lib/audit.ts`, `lib/account/*`, `lib/debts.ts`, `lib/upload.ts`, `lib/http.ts`, `lib/env.ts` | Cross-cutting helpers |
| `lib/guidance/*`, `lib/finanzamt/*`, `lib/decision/*` | Guidance (letters, tasks), decision centre |
| `prisma/` | Schema, migrations, safe seed |
| `proxy.ts` | Next.js 16 Proxy (auth gate, public routes) |
| `instrumentation.ts` | Startup environment report |
| `tests/unit`, `tests/integration`, `tests/e2e` | Vitest unit, Vitest+Postgres integration, Playwright |
| `docs/` | Charter, finance rules, release docs |

## 2. Critical Logic

- `lib/finance/transactionAmounts.ts` — how one transaction splits into business / VAT / private / unclear.
- `lib/finance/position.ts` + `loadPosition.ts` — dashboard, spend check, warnings, decision centre.
- `lib/finance/rules.ts` — legal values with year and basis (`docs/finance/RULES.md`).
- `lib/finance/grundsicherung.ts` — Anlage EKS / §11b SGB II estimate.
- `app/api/v1/documents/[id]/review` + `transactions` POST — the only paths that book AI-read receipts (user-approved, claimed once).
- `lib/account/deleteUserData.ts` — scoped account deletion.

## 3. Do-Not-Touch (without PM approval)

- Applied migration files in `prisma/migrations/*` (never edit; add new ones).
- `prisma/seed.ts` safety guards (`isLocalDatabaseUrl`, `SEED_CONFIRM_REMOTE`).
- `lib/devAuth.ts` guards; `proxy.ts` public path list.
- `vercel.json` deployment switch (previews off while DBs are shared).

## 4. Entry Points

- Web: `/` → consultation (anonymous) or `/dashboard` (signed in); `/login`, `/register`.
- API: `/api/v1/*`, `/api/auth/*` (NextAuth), `/api/health`.
- CLI: `npm run seed:system | seed:demo`, `npm run test*`, `npm run verify`.

## 5. Document Index

`product-brief.md` · `architecture.md` · `workflow-map.md` · `data-ownership.md` · `decision-log.md` ·
`known-risks.md` · `production-readiness.md` · `security-checklist.md` · `release-checklist.md` ·
`change-log.md` · `finance/RULES.md` · `finance/CALCULATIONS.md` · `release/MARCEL-ACTION-REQUIRED.md` ·
`release/RC2-HANDOVER.md` · `SPRINT-15-ENTITLEMENTS-PLAN.md`
