# Known Risks — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 1 — repository charter |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
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
| R-011 | `claudeMdExcludes` glob on Windows unverified | Process | Low | Medium | Verify in a new session (action #13) | Marcel | Open |
| R-012 | Duplicate tax-reserve rows under concurrent first load (no unique index) | Data | Low | Low | Sums by period are still correct; add unique index later | Eng | Accepted |
| R-013 | CI workflow not yet run on GitHub | Process | Low | — | First push; action #12 | Marcel | Open |
| R-014 | Legacy rows (pre-RC2) store old derived columns | Data | Low | Certain | Aggregations recompute from primary fields; edits rewrite cache | Eng | Mitigated |

## 1. Technical Debt

- Guidance module (`lib/guidance/*`, letter analysis) not refactored in RC2; 9 lint warnings (unused vars) remain there.
- UI copy is English with German terms; i18n not set up.
- `reports/pdf` route returns text (name kept for compatibility).

## 2. Temporary Solutions

- Preview deployments disabled (`vercel.json`) until separate databases exist.
- Paid-feature gates disabled by default.
