# Production Readiness — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | **Release candidate — NOT production-ready until the ⛔ items in `release/MARCEL-ACTION-REQUIRED.md` are done** |

## 1. Can customers use it?

| Check | Status |
|---|---|
| Core journey (register → onboarding → record → dashboard → correct → report) | PASS (E2E desktop + mobile) |
| Financial calculations match documented reference cases | PASS (unit + integration) |
| Accessibility (axe WCAG A/AA, serious/critical) on tested pages | PASS on onboarding, dashboard, input, transactions, tax |
| Mobile layout (no horizontal scroll, touch targets ≥ 44 px on new screens) | PASS (Pixel 7 run + visual review) |
| Legal pages public | PASS |
| Reachable under the brand domain | BLOCKED (action #7) |
| Professional review of tax logic | NOT DONE (action #9) |

## 2. Can it scale?

Serverless on Vercel; per-request DB queries bounded (one position load ≈ 6 queries; transactions
for prior + current year). Fine for controlled testing; revisit indexes and caching for thousands of
transactions per user. Rate limits need Upstash for multi-instance enforcement (action #6).

## 3. Can it recover?

Neon PITR (retention to confirm). Migrations are additive and versioned; rollback = redeploy previous
Vercel deployment (schema additions are backward-compatible). Restore test NOT DONE (action #12).

## 4. Can another developer support it?

Yes: charter docs, finance rule sources, `npm run verify`, isolated test DB, CI workflow, ADRs.

## 5. Operations

`/api/health` (DB check), startup environment report, structured error logs without PII.
Uptime monitor and error tracking: not configured (action #12).

## 6. Sign-off

| Role | Name | Date | Decision |
|---|---|---|---|
| Engineering (Claude) | — | 2026-10-09 | RC2 ready for independent review; not self-approved |
| Independent review (Codex) | | | |
| PM / Owner | Marcel | | |
| Tax review | Steuerberater | | |
