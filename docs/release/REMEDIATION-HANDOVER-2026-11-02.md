# TaxKontrol — Remediation of the Independent Adversarial Review (2026-11-02)

Branch `release/rc2-hardening` — pushed, **not merged, not deployed**. Review evidence:
`taxkontrol-independent-review/docs/release/INDEPENDENT-REVIEW-2026-11-01.md` (separate worktree,
untouched). Status keys: **PASS · FAIL · NOT TESTED · BLOCKED**.

**Assessment: release candidate again — not production-ready.** Blocking before real users:
Marcel actions #1–#5, #9 (Steuerberater sign-off of the VAT model) and #14.

## 1. Findings and disposition

| ID | Sev. | Finding (review) | Verified? | Root cause | Correction | Regression test |
|---|---|---|---|---|---|---|
| IR-01 | High | Decision SAFE despite unpaid ended-period VAT | Yes (repro) | Level depended only on this month's flow | `safeToSpendCents` deducts unreserved ended / earlier taxes and unreserved tax payments; any uncertainty → never SAFE | unit IR-01 ×5, round-2 F2 |
| IR-02 | High | VAT only on cash; Soll not modelled | Yes (repro + law §13/§16/§20 UStG) | No VAT method, no invoice VAT data | Soll default, Ist only on confirmed approval; invoice date + VAT rate; linked payments; §20 S. 3 | unit IR-02 ×7; integration IR-02 ×2, F4, F5 |
| IR-03 | High | Status change retroactive | Yes (repro) | One `User.taxType` for all time | `TaxStatusPeriod` history; per-row status; effective dates; patch semantics | unit IR-03 ×4; integration IR-03 ×4, F1 |
| IR-04 | High | KU check ignores unclassified income | Yes (repro) | Turnover = classified income only | Unclassified inflow counted + flagged | unit IR-04 ×2 |
| IR-05 | Med | One previous period; no DFV | Yes | "current + one previous" model | All periods since 1 Jan of year before last; DFV due dates; bulk settle | unit IR-05 ×4; integration F7 |
| IR-06 | Med | Future EKS period = 0 without warning | Yes | No period check | Warning, stored | integration IR-06/07 |
| IR-07 | Med | EKS unclassified warning lost on reload | Yes | Not persisted | `JobcenterRecord.warnings` | integration IR-06/07 |
| IR-08 | Med | Bank import cannot mark Finanzamt payment | Yes | No link path | Import keeps such lines "not sure"; Tax page links them; duplicate payment → 409 | integration IR-08 |
| IR-09 | Med | Payments not idempotent | Yes | Lock prevented lost updates only | `Idempotency-Key` + request fingerprint, 30-day purge | integration IR-09 ×2, L2 |
| IR-10 | Med | Failed R2 delete forgotten | Yes | Keys only in memory | Durable `PendingStorageDeletion` incl. user prefix, daily cron | integration IR-10 ×2 |
| IR-11 | Med | Gewerbesteuer not reserved | Yes (accepted limitation) | Unknown Gewerbe/Hebesatz | Warning + uncertainty above 24,500 € (no invented number) | unit IR-11 |
| IR-12 | Low | Projection counts current month fully | Yes (repro) | Integer months | Fractional current month, min. 1 | unit IR-12 ×2 |
| IR-13 | Low | Receipt type from AI if omitted | Yes | Fallback to OCR | Type must be sent | integration IR-13 |
| IR-14 | Low | Rate limiter per instance | Known (R-005) | — | Unchanged; Upstash = action #6 | — |
| IR-15 | Low | Register 409 / lockout | Known (R-021/R-024) | — | Accepted | — |
| IR-16 | Low | Payment always dated today | Yes | No date field | `paymentDate` (not in future) | integration IR-16 |
| IR-17 | Low | "1,234" → 1234 | Yes (repro) | Regex | Refused (ambiguous) | unit IR-17 |
| IR-18 | Low | Calculations outside lib/finance | Yes | Guidance used cached rows; page summed itself | Position shortfall; `lib/finance/fixedCosts.ts` | via suite |
| IR-19 | Low | Misc. (reason validation, raw AI error log, date ranges) | Partly | — | Reason validated, AI errors logged by name, Jobcenter years bounded. Not done: extra write rate limits, CSP, body-limit text | — |
| IR-20 | Low–Med | Plaintext seed password + DB host in docs | Yes — **repo is public**, password in 5 commits | — | Removed from docs; rotation/deletion = action #5 (blocker); no history rewrite (not authorised, would not help) | — |

### New defects found during remediation (internal reviewers, verified in code, fixed, tested)
| ID | Sev. | Defect | Fix |
|---|---|---|---|
| F1 | High | A status change "since always" overwrote a later status switch | Changes are patches; later entries keep other fields |
| F2 | High | Paying an unreserved tax made the same money "safe" again | Unreserved tax payments this month deducted |
| F3 | High | Filing-period change mid-period created overlapping periods (double VAT) | Rhythm changes only from 1 January (§18 Abs. 2); overlap guard |
| F4 | Med/High | "Already booked" invoice payment moved/doubled Soll VAT | Link required under Soll; candidate list; heuristic warning |
| F5 | Med | Ist invoice paid after switch to KU lost its VAT | Status of invoice date applies to its payment (§20 S. 3) |
| F6 | Med | Legacy invoices without date/VAT | Counted cautiously, flagged, confirmable |
| F7 | Med | Many old open periods after a history import | Bulk "filed and paid up to …" |
| M1 | Med | Migration-before-deploy window can make history stale | Deploy immediately; re-sync SQL (rehearsed) |
| M2, L1–L6 | Low–Med | Cleanup queue starvation, 500 after deletion race, idempotency replay with changed body, unbounded records, file names in keys (wording), future `/api/cron` routes, missing FK index | All fixed (`requireCronSecret`, ordering, `deleteMany`, fingerprint, purge, indexes) |

## 2. Evidence (local, 2026-11-02, final tree)

| Check | Result |
|---|---|
| Reviewer's 8 repro tests on `28607e5` | 8/8 reproduce the defects |
| Same repro tests on the fix | 3 fail as required (IR-01, IR-04, IR-17); 5 call the pure functions with the old input shape (no status history / invoices / fixed months) — the product path is covered by the integration tests below |
| New integration tests on `28607e5` (disposable worktree + DB) | **11/12 FAIL** (behaviour); the 1 pass is the Ist case the old code always computed |
| Mutation check of round-2 fixes (F1, F2, F3, F5, L2) | each undone fix → its test fails |
| `npm run typecheck` / `npm run lint` | PASS / PASS (0 errors, 8 old warnings) |
| `npm test` | PASS — **317/317** (21 files; was 266) |
| `npm run build` | PASS |
| E2E desktop + Pixel 7 + axe | PASS — 13 passed × 3 consecutive runs (3 skipped by design) |
| Migration drift (migrations ↔ schema) | PASS |
| Migration rehearsal (pre-migration schema + synthetic data → deploy → re-sync ×2) | PASS — backfill correct, data intact, re-sync idempotent, DB = schema |
| `npm audit --omit=dev` | PASS — 0 |
| CI on GitHub (Linux, Node 24, fresh `npm ci`, drift check, E2E) | PASS — run 41338517079 on `969b7b4` |

Commits: `eae4df4` (code, migration, tests), `969b7b4` (docs), plus this CI record.

**Not tested:** real R2, real AI, Upstash, Vercel Cron in production, the shared Neon DB (never
connected), the deployed app.

## 3. Database
New migration `20261102090000_tax_status_history_soll_ist` (additive; backfill). Production order:
backup → steps of action #3 (now three migrations) → **deploy immediately** → re-sync SQL if any
Settings change happened in between.

## 4. Release recommendation
Do **not** release to real users yet. After Marcel's #1–#5 and #14, and a Steuerberater sign-off
of the VAT model (#9), the branch is ready for a controlled beta. Re-run the final test plan
(RC2-HANDOVER §15) on the deployed app.
