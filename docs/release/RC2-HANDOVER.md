# TaxKontrol RC2 — Engineering Handover (2026-10-09)

Branch `release/rc2-hardening` (pushed to GitHub, **not merged, not deployed**).
Status keys: **PASS · FAIL · NOT TESTED · BLOCKED**.

## 1. Original findings (baseline) → outcome

| # | Finding | Outcome |
|---|---|---|
| F1 | Jobcenter formula inverted (`(profit−100)×0.3`) | Fixed: §11b SGB II allowances on monthly cash income, 2025/2026 rules, Grundsicherungsgeld naming — PASS |
| F2 | Bank import booked everything as 100 % business, 0 % VAT | Fixed: "not sure" by default, explicit classification, atomic + duplicate-safe — PASS |
| F3 | Kleinunternehmer limits outdated, VAT split on KU expenses, VAT shown for everyone | Fixed: 25k/100k monitor, KU expenses gross, VAT on KU income refused, reports VAT-aware — PASS |
| F4 | Four diverging safe-to-spend calculations | Replaced by one tested engine — PASS |
| F5 | Reserve formula mixed cash/profit, double-counted fixed costs | Fixed (see CALCULATIONS.md) — PASS |
| F6 | Unvalidated transaction values; no edit/delete | Fixed: strict validation, audited PATCH/DELETE — PASS |
| F7 | Flat 30 % income tax presented as "owed" | §32a tariff + Soli + church tax, labelled estimate with assumptions — PASS |
| F8 | Tax page overwrote stored targets; reserved unvalidated | Per-period rows, immutable history, validated + audited — PASS |
| F9 | Receipt review: foreign link, duplicate booking, no history | Owner checks, race-safe claim, full audit — PASS |
| F10 | Floats, server-timezone months | Integer cents, Europe/Berlin — PASS |
| S | Destructive seed + hardcoded password | Safe seed; dev bypass refuses remote DBs — PASS |
| S | Legal pages behind login | Public — PASS (E2E) |
| S | Paid features not enforced | Gates implemented, **off** by design until tiers/checkout decided — BLOCKED (PM decision) |
| S | Uploads trusted browser MIME | Magic-byte validation — PASS (code); upload E2E NOT TESTED (storage disabled in tests) |
| D | Failed Vercel build (proxy `runtime`) | Fixed; build PASS locally and in CI |
| D | Domain on `maxpromo-digital` | Investigated, documented, not moved (PM instruction) — BLOCKED (action #7) |
| G | X-PATH governance leaking into TaxKontrol | `claudeMdExcludes` + TaxKontrol CLAUDE.md — NOT TESTED (needs new session) |

## 2. Additional discoveries (fixed unless noted)

- `prisma.config.ts` `override: true` silently pointed test/CI commands at the cloud DB.
- Contact form reported success while Telegram was not configured → every request lost (now 503 + e-mail address).
- Partial payments overwrote the cumulative paid amount (customers & suppliers pages).
- Receipts uploaded on the input form could be booked twice (form + later approval).
- Bills due today were flagged "overdue" (time-of-day comparison).
- Decision centre rated spending "caution" when the month was already negative without income.
- Employees could be marked paid twice per month; CRUD routes accepted NaN/negative/unknown enums (500s).
- Entitlement lookup at login would break sign-in on DBs without the entitlement tables.
- Retired Claude model IDs and regex-parsed JSON; letter upload accepted any `image/*` incl. SVG.
- Impressum cited repealed § 5 TMG; glossary defined a non-existent "IKS"; "10 years" retention outdated.
- WCAG contrast failures across the app (secondary text 2.3–3.7:1, hover buttons 3.8:1).
- `.env.example` was git-ignored; 57 `any` lint errors from an old workaround.
- Preview and production share one `DATABASE_URL` → previews disabled (action #2).
- Shared Neon DB has migration history `init` only although all tables exist (needs baselining, action #3).

### Independent code review (fresh agent, after implementation)
No Critical findings (no IDOR, no missing auth, no core-maths error). Fixed and regression-tested
(`tests/integration/reviewFindings.test.ts`):
- High — German amount "1.234,56" on receipt review was silently replaced by the AI amount → strict
  `parseEuroInput`; user-submitted values are final.
- High — recorded supplier/customer payments and paid salaries vanished from the month → now booked
  atomically as transactions (opt-out "already entered"); booked bills not counted twice.
- Medium — identical lines in one bank statement were dropped as duplicates → count-based matching;
  imports serialised per user.
- Medium — five pages crashed when the server rejected input → errors shown.
- Medium — quarterly/yearly costs double-counted in the payment month → provision skipped.
- Low — lost updates on parallel payments, double salary payment, duplicate reserve rows → advisory
  locks; "19%" VAT accepted as 0 % → rejected; decision centre 500 on null body → 400; daily-close
  default date in UTC → Berlin.
- E2E then surfaced one more contrast issue (hover state of "Show" toggles, 4.35:1) → fixed.

## 3. Architecture improvements
Shared pure finance layer, transaction service, audit trail, shared debt handler, Berlin time utils,
HTTP/validation helpers, AI client with structured outputs, env report, health endpoint, CI.
Details: `docs/architecture.md`, ADRs in `docs/decision-log.md`.

## 4–6. Security, finance, workflow
See §1–2, `docs/security-checklist.md`, `docs/finance/CALCULATIONS.md`, `docs/workflow-map.md`.

## 7. Tests and actual results (local, 2026-10-09)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 8 warnings (unused vars in untouched guidance code) |
| Unit tests (Vitest) | PASS — 122/122 |
| Integration tests (Vitest + isolated Postgres) | PASS — 57/57 |
| `npm run build` | PASS |
| E2E Playwright (desktop + Pixel 7, axe WCAG A/AA) | PASS — 11 passed in 3 consecutive full runs; 3 skipped by design (screenshot helper ×2, server-side rate test on mobile) |
| Migration drift (migrations ↔ schema) | PASS — no difference |
| CI on GitHub (`CI` workflow) | see §12 |

## 8. Mobile verification
Pixel 7 E2E run (no horizontal scroll asserted on every journey page) and manual review of
screenshots: dashboard, input, transactions review, tax — PASS. Fixed during review: overdue-today
bug, empty receivables card, wrapping "+ Add" button.

## 9. Database and migration status
- New migration `20261009072541_add_audit_events_and_vat_period` (additive): applied to the isolated test DB only.
- Shared Neon DB (`.env.local`): **untouched** (read-only inspection). Pending: baseline 2 migrations + apply 1 — action #3.

## 10. Deployment status
- No deployment triggered by the branch push (verified with `vercel list`; `vercel.json` limits deploys to `main`).
- Production on Vercel is still the RC1-era deployment from 133 days ago; latest production build (RC1 commit) is in **Error**.
- Merge + deploy: BLOCKED until actions #1–#4.

## 11. Remaining risks
`docs/known-risks.md` (R-001 … R-014). Release-blocking: DB identity/separation, migration order,
old seed account, Datenschutz gaps, professional tax review.

## 12. Git
Commits `acbc26d` … HEAD on `release/rc2-hardening` (see `git log 2de2527..HEAD`); pushed to
`origin/release/rc2-hardening`. CI run: see the final report.

## 13. Outstanding external actions
`docs/release/MARCEL-ACTION-REQUIRED.md` (13 items, 4 release-blocking).

## 14. Release-readiness assessment
**Release candidate for independent review — NOT production-ready.** Engineering items are done and
verified locally. Real-user testing requires actions #1–#4, #5, #8 and #9.

## 15. Final test plan (after Marcel's actions)
1. Re-run `npm run verify` and `npm run test:e2e` on the merge commit (CI).
2. On the confirmed production DB: `migrate status` up to date; `/api/health` ok.
3. Deployed smoke test (desktop + phone): register, onboarding (both VAT statuses), money in
   (business + private loan), mixed expense, receipt upload → approve (real R2 + AI), bank import with
   classification, tax page update, report download, Jobcenter period, data export, account deletion.
4. Cross-account check with two real test accounts.
5. Contact form delivery to Telegram.
6. Steuerberater walkthrough of `docs/finance/CALCULATIONS.md` with 3 realistic cases.
