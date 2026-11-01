# TaxKontrol — Session Recovery Report (2026-11-01)

Status keys: **PASS · FAIL · NOT TESTED · BLOCKED**. Every result below was re-executed in this
session; nothing is taken over from earlier reports without re-running it.

## 1. What happened before the "shutdown"

| Evidence | Finding |
|---|---|
| Previous session transcript (`756499f2…jsonl`) | Last activity 2026-10-09 14:12 UTC: the **final RC2 engineering report** was delivered after CI turned green. No edit, test run or commit was in progress. |
| Git | Working tree clean; `release/rc2-hardening` = `origin/release/rc2-hardening` = `80370ed`. No stash. Only untracked file: `TaxKontrol-Audit-Report.docx` (dated 2026-05-28, user file, left untouched). |
| `origin/main` | Still `2de2527` (RC1 baseline, 2026-05-30). Nothing merged. |
| GitHub | No pull request opened. CI runs 37939714281 and 37942131537 (HEAD) — success. |
| Vercel | No deployment since RC1 (latest production build 155 days old, status **Error**; previous one Ready). |

**Conclusion: no work was lost.** The interrupted programme had already been completed and
handed over on 2026-10-09 (`docs/release/RC2-HANDOVER.md`). TaxKontrol is **not** at the audit
stage. It is a verified release candidate waiting for Marcel's external actions and the Codex review.

- Last verified commit: `80370ed fix: findings of the independent RC2 review`
- Working branch: `release/rc2-hardening`
- Uncommitted changes at recovery: none (except the user's untracked .docx)

## 2. Original October 9 audit findings → current state (re-verified today)

| Area | Audit finding | State now | Evidence (2026-11-01) |
|---|---|---|---|
| TypeScript | passed | PASS | `npm run typecheck` |
| Build | passed with uncommitted changes | PASS (committed code) | `npm run build`; CI green |
| ESLint | 65 errors | PASS — 0 errors, 8 warnings (unused vars in guidance module) | `npx eslint .` |
| Automated tests | none | PASS — 179/179 (13 files: unit + integration on isolated Postgres) | `npm test` |
| E2E / mobile / a11y | none | PASS — 11 passed, 3 skipped by design (desktop + Pixel 7, axe WCAG AA) | `npx playwright test` |
| Vercel | latest deployment failed | Build cause fixed in code (CI + local build PASS); production still on RC1 — BLOCKED (merge needs actions #1–#4) | `vercel list` |
| Domain | on wrong project | Unchanged by design — BLOCKED (action #7) | — |
| Database | 2 pending migrations | Local test DB: 4 migrations, up to date — PASS. Shared Neon DB: unreachable from this session (P1001) — NOT TESTED; baselining is action #3 | `prisma migrate status` (read-only) |
| Security | destructive seed, known credentials | Seed made safe — PASS (tests). Old seed account in shared DB — BLOCKED (action #5) | integration tests |
| Financial calculations | multiple errors | All 10 finance findings fixed with tests — PASS (Steuerberater review open, action #9) | unit/integration tests |
| Governance | conflicting instructions | TaxKontrol `CLAUDE.md` loaded; X-PATH rules **did not** appear in this session's context — PASS (closes R-011) | session context |

## 3. Phases

| Phase | Status |
|---|---|
| 1 Security & DB safety | Complete in code. External: actions #1, #2, #3, #5 |
| 2 Financial correctness | Complete; professional review open (#9) |
| 3 Architecture & code quality | Complete (8 lint warnings in un-refactored guidance code) |
| 4 Automated testing | Complete |
| 5 Functional & mobile UX | Complete for the tested journeys; upload E2E NOT TESTED (storage off in tests) |
| 6 SaaS & deployment readiness | BLOCKED on Marcel (#1–#4, #6, #7) |
| 7 Documentation & governance | Complete |
| 8 Release verification | Engineering part PASS; deployed smoke test BLOCKED until merge |

## 4. New finding since October 9 — dependency vulnerabilities

`npm audit` now reports advisories published after the RC2 handover, including **critical** ones in
production dependencies:

- `next` ≤ 16.4.0 (installed 16.2.6) — *Middleware/Proxy bypass in App Router*, Server Actions DoS.
  TaxKontrol's auth gate is `proxy.ts`, so this is directly relevant.
- `next-auth` 5.0.0-beta.31 / `@auth/core` ≤ 0.41.2 / `@auth/prisma-adapter` ≤ 2.11.2 — Auth.js
  e-mail normalisation and config-error auth-check issues.
- `zod` < 4.6.6 (memory exhaustion), `prisma` ≤ 7.10.0 (via `deepmerge-ts`, `@prisma/dev`),
  `sharp`, `postcss`, others transitively.
- Dev-only: `vitest` < 5 / `tinypool` (critical, test tooling only, not shipped).

**Next implementation priority:** patch these within the current major versions on the release
branch, then re-run the full verification. Results: §6.

## 5. Outstanding critical risks
R-001 DB identity/shared preview DB, R-002 migration order before merge, R-003 old seed account,
R-006 Datenschutz gaps, R-004 professional tax review — all need Marcel
(`docs/release/MARCEL-ACTION-REQUIRED.md`). New: R-017 dependency advisories (see §4/§6).

## 6. Resumed work — results

**Dependency security patch** (no source changes; `package.json` + lock only):
`next` 16.4.3, `next-auth` 5.0.0-beta.32 (`@auth/core` 0.41.3), `@auth/prisma-adapter` 2.11.3,
`zod` 4.6.7, `prisma` / `@prisma/client` / `@prisma/adapter-pg` 7.10.1, `eslint-config-next` 16.4.3
(pinned), plus `npm audit fix` for transitive packages.

| Check after patch | Result |
|---|---|
| `npm audit --omit=dev` | PASS — 0 vulnerabilities (was 20: 4 critical, 12 high) |
| `npm audit` incl. dev | Dev-only advisories remain (vitest 3 / tinypool, eslint/minimatch chain). vitest 5 upgrade refused by npm (peer chain `@types/node` / vite 8) — deferred, R-017 |
| `npm run typecheck` | PASS |
| `npx eslint .` | PASS — 0 errors, 8 warnings (unchanged) |
| `npm test` | PASS — 179/179 |
| `npm run build` | PASS |
| `npx prisma generate` / local `migrate status` | PASS (Prisma works although npm now blocks its install scripts) |
| E2E (desktop + Pixel 7 + axe) | PASS — 3 consecutive full runs 11/11 (3 skipped by design). One earlier full run had 1 failure in the first-time journey; it passed in isolation → R-018 |
| CI on GitHub (`CI` workflow, incl. E2E) | PASS — run 41309481691 on `49830ac` |

## 7. Database and deployment status
- Isolated test DB: 4 migrations, up to date.
- Shared Neon DB: **not reached** (P1001 from this session); no command other than read-only
  `migrate status` was attempted. Baselining/applying remains Marcel's action #3.
- Vercel: no new deployment; production still RC1 (latest build Error). Previews disabled.

## 8. State and next step
TaxKontrol is **approaching final testing**: the engineering backlog is done and re-verified, with the
security patch on top. The remaining release blockers are all external (Marcel #1–#5, then Codex
review, merge, deployed smoke test per `RC2-HANDOVER.md` §15). The safe executable backlog is
exhausted; optional engineering follow-ups: vitest 5 upgrade, 8 lint warnings in the guidance
module, R-018 flake diagnostics.

## 9. Continuation (same day) — see `ENGINEERING-HANDOVER-2026-11-01.md`
Second independent finance and security reviews, all confirmed findings fixed with regression
tests; flaky E2E root cause fixed; dev advisories reduced to one accepted item; new additive
migration `20261101120000_tax_payments_and_settlement`; the production migration runbook was
rehearsed on a local database built like production (pre-RC2 schema via `migrate diff
--from-empty` + psql, history = `init`): both migrations applied, status up to date, no drift.
(`prisma db push` refuses to run when invoked by an AI agent; that guard was respected.)

