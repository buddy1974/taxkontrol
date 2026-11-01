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
| ADR-013 | 2026-10-09 | Recording a payment books the transaction (opt-out "already entered") | Accepted (from independent review) |
| ADR-014 | 2026-10-09 | User-submitted review values are final; amounts parsed strictly (German/intl.), never guessed | Accepted (from independent review) |
| ADR-015 | 2026-11-01 | Tax payments/refunds are typed transactions (`taxPaymentType`, `taxPeriodStart`), outside profit, private money and monthly outflow | Accepted (from second review) — needs migration `20261101120000` |
| ADR-016 | 2026-11-01 | The just-ended VAT period and the previous income-tax year stay open until paid or marked settled (`TaxReserve.settledAt`) | Accepted (from second review) |
| ADR-017 | 2026-11-01 | Unconfirmed VAT on business income (Regelbesteuerung) is estimated at 19 %, not 0 % | Accepted (cautious default) |
| ADR-018 | 2026-11-01 | Each expense settles at most one commitment; legal forms are not name matches; payables matched on full amount only without recorded payments | Accepted |
| ADR-019 | 2026-11-01 | Cross-site API writes refused (Origin / Sec-Fetch-Site); session checked against the user table per request | Accepted |
| ADR-020 | 2026-11-01 | Income-tax projection kept; minimum on profit so far shown next to it | Accepted |
| ADR-021 | 2026-11-01 | Toolchain on Node 24 (engines), vitest 5; remaining minimatch advisory accepted | Accepted (see R-017) |

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

**ADR-013** Payments recorded on invoices/salaries previously disappeared from the month (removed from
"still due" but never added to "paid"). Now they are booked atomically; locks prevent lost updates.

**ADR-014** "1.234,56" was parsed as NaN and silently replaced by the AI amount. `parseEuroInput`
accepts unambiguous German and international formats and rejects everything else.

**ADR-012** The PM decided not to move `taxkontrol.de` or run Neon migrations until environments
are identified. Recommended target architecture is documented in `architecture.md`.

## ADR-015 … ADR-021 (2026-11-01, second independent review)

**ADR-015** Without a booking type for tax payments, a VAT payment booked as a business expense
lowered profit (and the income-tax reserve), and booked as private it vanished from the Anlage EKS.
Tax payments are recorded on the Tax page for a specific period; they never enter profit, private
money or "left from this month" (the tax was already deducted in the months that caused it). VAT
paid/refunded counts in the EKS; income tax does not (§11b Abs. 1 S. 1 Nr. 1 SGB II, shown as note).
Alternative rejected: a system category — it cannot carry the period, and categories are optional.

**ADR-016** Reserves covered only the current periods, so on 2 January the Q4 VAT and the whole
previous year's income tax disappeared from every figure while still unpaid. TaxKontrol cannot know
the Steuerbescheid, so the user ends a period explicitly ("settled"). Only the immediately previous
period is tracked; older periods are a documented limitation (no flood of alarms for legacy data).

**ADR-017** Rows with an unknown VAT rate were stored and summed as 0 % VAT — understating the VAT
reserve by 19/119 of the amount. They are already flagged for review; until reviewed the summary
assumes 19 % (the cautious reading) and says so. Confirming the rate clears the assumption.

**ADR-018** "Vodafone GmbH" matched "Telekom GmbH" (shared 4-letter word "gmbh"), one expense could
mark several commitments paid, and a booked partial supplier payment hid the open rest.

**ADR-019** SameSite=Lax is not enough once `app.taxkontrol.de` and `taxkontrol.de` (another
project) are same-site. JWT sessions of deleted accounts kept writing data (R2 uploads) — one
indexed lookup per request ends that.

**ADR-020** Dropping the projection for short histories would under-reserve steady earners in
January–February — the more dangerous error for this product. The floor is shown instead.

**ADR-021** `@types/node` 20 did not match the Node 24 runtime and blocked vitest 5 (critical
tinypool/@vitest/mocker advisories). minimatch < 11 is used by the whole ESLint 9 stack (3.x and
10.x lines have no fix; 11 has an incompatible export); it only parses our own lint config globs.
