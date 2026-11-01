# TaxKontrol — Engineering Handover (2026-11-01)

Branch `release/rc2-hardening` — pushed, **not merged, not deployed**. Supersedes the status parts
of `RC2-HANDOVER.md` (which remains valid for the RC2 work itself).
Status keys: **PASS · FAIL · NOT TESTED · BLOCKED**.

**Assessment: release candidate for the independent Codex review. Not production-ready** — the
production database, deployment and live tests are outstanding (Marcel actions #1–#4, then the
final test plan in `RC2-HANDOVER.md` §15).

## 1. What was done in this round

| Area | Result |
|---|---|
| Session recovery | No work lost; RC2 had been completed on 2026-10-09 (`SESSION-RECOVERY-REPORT.md`) |
| Production dependencies | Next.js 16.4.3 (Proxy bypass fix), Auth.js beta.32, zod, Prisma 7.10.1 — `npm audit --omit=dev`: **0** |
| Dev dependencies | vitest 5, @types/node 24 (= runtime), tsx/esbuild 0.28.2, engines Node 24.x. Remaining: minimatch < 11 inside ESLint 9 (moderate, no fix exists, our own globs only) — accepted, R-017 |
| Flaky E2E | Root cause found and fixed (stale "Saved." confirmation — also a UX bug), not retried away. R-018 resolved |
| Independent finance review | 10 findings; 3 High confirmed. All confirmed findings fixed (below) |
| Independent security review | No cross-tenant leak found (re-confirmed). 10 findings, all fixed or accepted with reason |
| Test coverage gaps named by the reviews | Closed: auth matrix, tenant isolation for all CRUD/guidance routes, session check, ended tax periods, tax payments, unknown VAT, matching, Kleinunternehmer edge cases |
| Production migration runbook | Rehearsed end-to-end on a local database built like production (pre-RC2 schema, history = `init`): both pending migrations apply, status up to date, no drift |

## 2. Findings → outcome

### Finance (adversarial review, verified in code before fixing)
| # | Sev. | Finding | Outcome |
|---|---|---|---|
| 1 | High | On 2 Jan / after every VAT period, the unpaid VAT of the period just ended and last year's income tax vanished from all figures | Fixed: ended periods stay open until paid or settled; dashboard warning — PASS |
| 2 | High | No way to book a payment to the Finanzamt: as business expense it lowered profit; as private it vanished from the EKS | Fixed: typed tax payments per period (migration) — PASS |
| 3 | High/Med | Unknown VAT rate counted as 0 % (VAT understated, profit overstated) | Fixed: 19 % assumed until confirmed; import/receipt paths flag it — PASS |
| 4 | Med | One expense marked several commitments paid; "GmbH" matched any GmbH | Fixed — PASS |
| 5 | Med | Partly paid supplier bill disappeared | Fixed — PASS |
| 6 | Med | Founder at 85k got "approaching 100k" instead of "25k exceeded" | Fixed — PASS |
| 7 | Med | After switching to Kleinunternehmer, last year's 19 % rows counted gross | Fixed for the limit check — PASS; old reports use current status (R-022, accepted) |
| 8 | Med | One large early invoice → projection ~3× the tax | Projection kept (safer), minimum shown; future-dated rows excluded — PASS |
| 9 | Low | Stale snapshot of past VAT targets | Ended periods recomputed live while open — PASS |
| 10 | Low | "1.234" in import API = 1.23 € | Strict parser — PASS |
| + | — | Found while fixing: Jobcenter route ignored tax payments (income tax would have been an EKS expense) | Fixed — PASS |

### Security (adversarial review)
| # | Sev. | Finding | Outcome |
|---|---|---|---|
| 1 | Med | Open redirect after login (`/%09/evil`) | Fixed — PASS (unit) |
| 2 | Med | AI cost abuse via array/oversized fields | Fixed — PASS |
| 3 | Med | Reset paid amount → same payment booked twice | Fixed (decreases refused) — PASS |
| 4 | Low-Med | No CSRF origin check (relevant with app.taxkontrol.de) | Fixed — PASS (unit); browser behaviour PASS (E2E unaffected) |
| 5 | Low | Deleted account's JWT kept writing | Fixed — PASS; rare R2 orphan race R-020 accepted |
| 6 | Low | Past reserve "set aside" editable | Intended (late transfers), audited; wording corrected |
| 7 | Low | Duplicate daily close under concurrency | Fixed — PASS |
| 8 | Low | Persona unvalidated; PII in logs | Fixed — PASS. Security checklist row "No PII in logs" was wrong before and is corrected |
| 9 | Low | Login limits per IP+email only; timing oracle; register 409 | Per-account limit + constant time — code PASS, NOT TESTED automatically; 409 accepted (R-021) |
| 10 | Low | Non-string ids; letters bookable | Fixed — PASS |

## 3. Evidence (local, 2026-11-01, final tree)

| Check | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — 0 errors, 8 warnings (unused vars, un-refactored guidance module) |
| `npm test` | PASS — **266/266** (19 files; was 179) |
| `npm run build` | PASS |
| E2E Playwright desktop + Pixel 7 + axe WCAG AA | PASS — 13 passed × 3 consecutive full runs; 3 skipped by design (screenshot helper ×2, server-side rate test on mobile) |
| New regression tests fail on the previous code | PASS — finance unit 14/17 fail before (3 pin already-correct behaviour), integration 11/11 fail before |
| Migration drift (migrations ↔ schema) | PASS |
| Production runbook rehearsal (local) | PASS |
| `npm audit --omit=dev` | PASS — 0 |
| CI on GitHub | see final report / `gh run list` |

**Not tested:** real R2 uploads and real AI reading (disabled in tests by design), login rate
limit, Upstash limiter, anything against the shared Neon DB (unreachable here; never written),
deployed app.

## 4. Database
- New migration `20261101120000_tax_payments_and_settlement` (additive, 3 nullable columns).
- Pending on production: baseline 2 + apply 2 migrations — action #3 (updated).
- Migration files pinned to LF (`.gitattributes`) so Prisma checksums match on every OS.

## 5. Remaining risks
`docs/known-risks.md`. Release-blocking: R-001 (DB identity/separation), R-002/R-019 (migrations
before merge), R-003 (old seed account), R-006 (Datenschutz), R-004 (professional tax review).

## 6. Marcel
`docs/release/MARCEL-ACTION-REQUIRED.md` — unchanged list, action #3 now covers both migrations.
Review scope for Codex: `git diff 2de2527..release/rc2-hardening` (RC2 + this round).
