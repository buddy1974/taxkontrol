# Known Risks — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-11-01 |
| Status | Complete |

## Risk Register

| ID | Risk | Type | Severity | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-001 | Production DB identity unknown; preview shares it | Security/Data | High | Certain | Previews disabled; tooling refuses remote DBs; action #1–2 | Marcel | Open |
| R-002 | Merging before migrations → 500s in production | Release | High | Medium | Action #3 ordering; drift check in CI | Marcel | Open |
| R-003 | Old seed account with known password may exist in the shared DB | Security | High | Likely | Seed fixed; action #5 | Marcel | Open |
| R-004 | Estimates misunderstood as tax assessments | Product/Legal | High | Medium | Labels, limitations, assumptions; Steuerberater review (action #9) | Marcel | Mitigated, review open |
| R-005 | Rate limits per instance without Upstash | Security | Medium | Medium | Upstash env (action #6) | Marcel | Open |
| R-006 | Datenschutz incomplete (Telegram, legal bases, transfers) | Legal | Medium | Certain | Action #8 | Marcel | Open |
| R-007 | Fixed-cost/salary "already paid" matching is heuristic (name + ±2 %) | Accuracy | Medium | Medium | Explained in UI; booked costs reduce commitments; tests | Eng | Accepted |
| R-008 | Income-tax estimate assumes single assessment, no other income, no Gewerbesteuer | Accuracy | Medium | Medium | Assumptions shown; settings for church tax | Eng | Accepted |
| R-009 | Purchases cascade-delete with the account (retention duty once payments exist) | Legal | Medium | Low (no payments yet) | Change to anonymise before Stripe goes live | Eng | Open |
| R-010 | AI reading quality/cost; Anthropic outage | Ops | Low | Medium | Suggestions only, manual fallback, model configurable | Eng | Accepted |
| R-011 | `claudeMdExcludes` glob on Windows unverified | Process | Low | Medium | Verified 2026-11-01: X-PATH rules absent from a new session's context | Eng | Resolved |
| R-012 | Duplicate tax-reserve rows under concurrent first load | Data | Low | Low | Advisory lock per user/type; unique index could be added later | Eng | Mitigated |
| R-015 | Supplier-bill "already booked" detection is heuristic (name + amount ±2 %) | Accuracy | Low | Medium | Explicit "already entered" checkbox when recording payments | Eng | Accepted |
| R-016 | Past-period reserve rows: the "set aside" amount can still be updated (targets are frozen) | Product | Low | Low | Intended (late transfers); audited | Eng | Accepted |
| R-013 | CI workflow on GitHub | Process | Low | — | First run 37939714281 green (incl. E2E) | Eng | Resolved |
| R-017 | Dependency advisories | Security | Low | Certain | Prod: 0 (Next 16.4.3, Auth.js, zod, prisma patched). Dev: vitest 5, @types/node 24, tsx/esbuild 0.28.2 → only `minimatch` < 11 (moderate ReDoS) left inside ESLint 9/eslint-config-next; no patched 3.x/10.x, v11 API-incompatible; input is our own lint globs only. Re-check when eslint-config-next moves to minimatch ≥ 11 | Eng | Accepted (dev only) |
| R-018 | E2E first-time journey failed once (2026-11-01) | Process | — | — | Root cause found: the input page kept the previous "Saved." message during and after the next save (also a UX bug: shown next to a refused save). Page fixed; tests wait for the HTTP 201 of each save; regression assertion added. 12× isolated + 3× full suite green | Eng | Resolved |
| R-019 | Second migration `20261101120000_tax_payments_and_settlement` must be applied before merge | Release | High | Medium | Additive (3 nullable columns); included in `migrate deploy` of action #3 | Marcel | Open |
| R-020 | Upload racing an account deletion can leave one orphaned R2 object | Legal | Low | Low | Deleted accounts no longer authenticate; deletion collects keys before the DB transaction. Periodic orphan sweep possible later | Eng | Accepted |
| R-021 | Registration answers 409 for an existing e-mail (account enumeration) | Security | Low | Medium | Rate limited 5/15 min per IP; login is timing-equalised and limited per account | Eng | Accepted |
| R-022 | (resolved 2026-11-02 — status history, ADR-022) Reports of old periods used the user's current VAT status | Accuracy | Low | Low | Kleinunternehmer turnover check uses stored rates; reports note it in CALCULATIONS.md | Eng | Accepted |
| R-023 | (resolved 2026-11-02 — all periods since the year before last, ADR-024) Only the last ended VAT period / income-tax year were tracked | Accuracy | Medium | Low | Limitation text; older unpaid periods need the Steuerberater | Eng | Accepted |
| R-024 | Per-account login limit (30 / 15 min) can be used to lock a user out briefly | Availability | Low | Low | Window is short; IP+email limit remains 10 | Eng | Accepted |
| R-014 | Legacy rows (pre-RC2) store old derived columns | Data | Low | Certain | Aggregations recompute from primary fields; edits rewrite cache | Eng | Mitigated |

## 1. Technical Debt

- Guidance module (`lib/guidance/*`, letter analysis) not refactored in RC2; 9 lint warnings (unused vars) remain there.
- UI copy is English with German terms; i18n not set up.
- `reports/pdf` route returns text (name kept for compatibility).

## 2. Temporary Solutions

- Preview deployments disabled (`vercel.json`) until separate databases exist.
- Paid-feature gates disabled by default.

### Added 2026-11-02 (independent review remediation)

| ID | Risk | Area | Impact | Likelihood | Mitigation | Owner | Status |
|---|---|---|---|---|---|---|---|
| R-025 | Seed account password is in the git history of the **public** repository | Security | High | Certain | Removed from docs; account must be deleted/rotated (action #5). History rewrite would not help and is not authorised | Marcel | Open — release-blocking |
| R-026 | VAT model (Soll/Ist, invoice date as Leistungszeitpunkt, input VAT on payment) not yet confirmed by a Steuerberater | Accuracy | High | Medium | RULES.md / CALCULATIONS.md §7; cautious defaults | Marcel (#9) | Open — release-blocking |
| R-027 | After the migration, existing VAT-registered users are on Soll; users with Ist approval see higher VAT until they confirm it; legacy open invoices are dated when entered | Accuracy/UX | Medium | High | Limitations VAT_METHOD / LEGACY_INVOICE_DATES; user communication (action #14) | Marcel | Open |
| R-028 | Migration applied but code not yet deployed: Settings changes by old code make the status history stale | Release | Medium | Low | Deploy right after migrating; re-sync SQL `docs/release/sql/post-deploy-resync-tax-status.sql` (rehearsed) | Marcel (#3) | Open |
| R-029 | Users importing long histories see many ENDED periods until they mark them settled | UX | Medium | Medium | Bulk "filed and paid up to …"; cautious by design | Eng | Accepted |
| R-030 | Not modelled: Sondervorauszahlung, §17 bad debts, Anzahlungen, Leistungsdatum ≠ invoice date | Accuracy | Medium | Low | Documented limitations (CALCULATIONS.md §7) | Eng | Accepted |
| R-031 | Storage cleanup job needs `CRON_SECRET`; without it failed deletions of deleted accounts stay queued | Legal | Medium | Low | Durable queue; 503 when unset | Marcel (#6) | Open |
| R-008 | (update) Gewerbesteuer now flagged above 24,500 € projected profit and blocks a "safe" answer | Accuracy | Medium | Medium | Warning, uncertainty | Eng | Mitigated |
