# Decision Log — `taxkontrol`

| Field | Value |
|---|---|
| Document tier | 2 — decision record |
| Owner (DRI) | Marcel |
| Lifecycle stage | Beta (RC2) |
| Last reviewed | 2026-10-09 |
| Status | Complete |

## ADR Index

| ADR | Date | Title | Status |
|---|---|---|---|
| ADR-001 | 2026-10-09 | One pure finance layer; all routes/pages use it | Accepted (engineering, PM-authorised programme) |
| ADR-002 | 2026-10-09 | Integer cents + Europe/Berlin calendar for all periods | Accepted |
| ADR-003 | 2026-10-09 | Versioned legal rules with sources; unenacted years flagged provisional | Accepted |
| ADR-004 | 2026-10-09 | Usage semantics extended to income (PRIVATE = deposit/loan, UNSURE excluded) — no schema change | Accepted |
| ADR-005 | 2026-10-09 | Kleinunternehmer: expenses gross, VAT on income refused | Accepted |
| ADR-006 | 2026-10-09 | "Left from this month" may be negative; based on records, not bank balance | Accepted |
| ADR-007 | 2026-10-09 | Tax reserves per tax period; history immutable; reserved = user-entered only | Accepted |
| ADR-008 | 2026-10-09 | Append-only AuditEvent for financial changes | Accepted |
| ADR-009 | 2026-10-09 | AI via official SDK + structured outputs, default `claude-opus-5-5`, configurable | Accepted — cost decision open (action #10) |
| ADR-010 | 2026-10-09 | Paid-feature gates exist but off (`ENTITLEMENTS_ENFORCED`) | Accepted — tier mapping open (action #11) |
| ADR-011 | 2026-10-09 | Preview deployments disabled while DBs are shared | Accepted — revisit after action #2 |
| ADR-012 | 2026-10-09 | Do not move `taxkontrol.de`; propose `app.taxkontrol.de` | PM decision (given in the remediation brief) / proposal |

## ADR-001 … ADR-012 (summary)

**ADR-001** Four diverging "safe to spend" implementations and unused engines existed. Replaced by
`lib/finance/*` (pure, 100+ tests); the old `lib/engines/*` were deleted.

**ADR-002** Floats and server-timezone month boundaries produced off-by-cent and wrong-month
results on Vercel (UTC). Cents and Berlin boundaries remove both classes of bugs.

**ADR-003** Laws change yearly (2025 KU limits, 2026 tariff, 1.7.2026 Grundsicherungsgeld). Values
live in `rules.ts` with basis/year; the 2027 tariff is a draft and is not used.

**ADR-004** Income previously had no business/private distinction, so loans and private deposits
became "profit". The existing `usage` enum now applies to income too (no migration needed).

**ADR-005** §19 UStG: no VAT on invoices, no input-VAT deduction. Expense VAT is part of the cost.

**ADR-006** Flooring at 0 hid real shortfalls. Users see a negative number with explanation.

**ADR-007** The tax page used to overwrite the newest rows with the current month's figure
whatever their period. Now rows are keyed by type + period start.

**ADR-008** Corrections, approvals, imports, reserve and settings changes are recorded
(before/after of changed fields).

**ADR-009** Raw `fetch` with regex JSON-stripping and retired model IDs replaced.

**ADR-010** Enforcing gates without a checkout would lock users out of features they cannot buy.

**ADR-011** Preview and production share `DATABASE_URL`.

**ADR-012** The PM decided not to move `taxkontrol.de` or run Neon migrations until environments
are identified. Recommended target architecture is documented in `architecture.md`.
