# Architecture — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## 1. System Overview

Next.js 16 (App Router, React 19) monolith on Vercel. PostgreSQL (Neon) via Prisma 7 with the
`@prisma/adapter-pg` driver adapter. Auth.js v5 (credentials, JWT sessions). Uploaded files in
Cloudflare R2 under `<userId>/…`. Claude API (official SDK, structured outputs) reads receipts,
bank statements and letters. Optional Upstash Redis for shared rate limits, Telegram for
contact-form delivery.

## 2. Components

| Layer | Technology | Responsibility |
|---|---|---|
| Frontend | Next.js pages (server + client components), Tailwind v4 | UI, mobile-first, no financial maths |
| Proxy | `proxy.ts` (Next 16 Proxy, Node runtime) | Session gate, public routes, 401 for API |
| API | Route handlers `app/api/v1/*` | Validation, ownership scoping, orchestration |
| Domain | `lib/finance`, `lib/transactions`, `lib/debts`, `lib/decision`, `lib/guidance` | Business rules; finance is pure + unit-tested |
| Data | Prisma 7 + Postgres | Tenant-scoped rows (`userId` on every table), `AuditEvent` history |
| Files | Cloudflare R2 | Receipts/letters; key prefix = owner id; signed URLs 5 min |
| AI | `lib/ai/claude.ts` | Suggestions only; failures → manual entry |

## 3. Data flow (money)

`input / import / receipt review` → `lib/transactions/service` (validate, derive via
`computeTransactionAmounts`, audit) → DB → `loadFinancialPosition` (Berlin periods, settings) →
`computeFinancialPosition` (pure) → `presentPosition` → dashboard / money / decisions / warnings /
decision centre. Reports and Jobcenter use `summarizeTransactions` from the same module.

## 4. Environments

| Environment | Vercel project | Domain | Database |
|---|---|---|---|
| Production | `taxkontrol` (deploys from `main`) | `taxkontrol-*.vercel.app` today; proposed `app.taxkontrol.de` | Neon — **identity to be confirmed** (action list #1) |
| Preview | disabled in `vercel.json` | — | currently shares production `DATABASE_URL` (action list #2) |
| Marketing | `maxpromo-digital` | `taxkontrol.de`, `www.taxkontrol.de` | — |
| Local dev | `npm run dev` | localhost:2011 | `.env.local` (must not be production) |
| Tests / CI | — | localhost | isolated Postgres (`npm run test:db:up`, CI service) |

## 5. Security architecture

Auth on every API route + proxy; tenant scoping by `userId` in every query (ownership checked
with `findFirst({id, userId})` before mutations; other users' ids return 404). Uploads validated
by magic bytes. Rate limits on auth, uploads, AI and imports. Security headers in
`next.config.ts`. Dev bypass hard-disabled on Vercel and for remote databases. Secrets only in
environment variables; startup report logs names only.

## 6. Key decisions

See `decision-log.md` (ADR-001 … ADR-012).
