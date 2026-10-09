# Change Log — `taxkontrol`

## RC2 — release/rc2-hardening (2026-10-09) — not yet merged or deployed

### Pre-existing work committed (unchanged content)
Proxy runtime fix (unblocks Vercel builds), entitlement schema/read layer, guidance migration,
legal/contact pages, explainer boxes, governance stubs.

### Finance (release-blocking fixes)
- New shared layer `lib/finance/*`: cents, Berlin periods, versioned rules (2025/2026), one
  transaction split, monthly position, per-period reserves, Kleinunternehmer monitor,
  Grundsicherungsgeld (§11b) estimate, reports. Four diverging safe-to-spend copies removed.
- Jobcenter: replaced inverted `(profit − 100) × 0.3` with §11b allowances on monthly cash income.
- Bank import: lines default to "not sure" (were 100 % business, 0 % VAT); atomic, duplicate-safe.
- Income can be business / private (loan, deposit) / unsure; only business income is profit.
- Kleinunternehmer: limits 25k/100k (were 22k), expenses gross, VAT on income refused.
- Income tax: §32a tariff + Soli + church tax, YTD projection over months with records (was flat 30 %).
- Fixed costs no longer double-counted once paid; quarterly/yearly as monthly provision; salaries
  once per month; supplier bills by due date; negative months shown.
- Tax reserves per period, history immutable, "reserved" only what the user enters.
- Partial payments add up instead of overwriting the paid total.
- Bills due today are not "overdue".

### Security / data
- Safe seed (no wipe-all, no hardcoded password); dev bypass refuses remote DBs.
- `prisma.config.ts` no longer overrides an explicit `DATABASE_URL`.
- Upload validation by file content; storage keys under owner id.
- Receipt approval race-safe; linked transactions ownership-checked; receipts from the input form
  booked once.
- Validation on all CRUD routes; foreign ids → 404; audit trail (`AuditEvent`).
- Legal pages public; login/registration bounds; IP from platform headers; contact form honest
  about delivery; GDPR export and account deletion; `/api/health`.
- AI via official SDK with structured outputs; retired model IDs removed.

### UI / UX
Dashboard, input, transactions (review filter, corrections, delete), receipt review, import,
money, private money, tax, reports (month picker), Jobcenter, settings (VAT period, church tax,
Jobcenter, export, delete), onboarding (explicit VAT status). WCAG AA contrast fixes. Lint 0 errors.

### Quality
Vitest unit (finance, rules with independent reference values, time, env, decision) and
integration (isolated Postgres) suites; Playwright E2E desktop + mobile with axe; CI workflow;
migration drift check.

### Docs / governance
TaxKontrol-specific `CLAUDE.md` (X-PATH file excluded), complete charter docs, finance rules with
sources, release action list, handover.

### Migration
`20261009072541_add_audit_events_and_vat_period` (additive). Not applied to any shared DB.
