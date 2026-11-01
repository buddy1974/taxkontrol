# Change Log — `taxkontrol`

## RC2.3 — independent adversarial review remediation (2026-11-02) — on release/rc2-hardening, not merged or deployed

- Tax status history (status, Soll/Ist, filing period, Dauerfristverlängerung) with effective
  dates; nothing is retroactive unless the user corrects "since always" (IR-03).
- Sollversteuerung default with invoice date + VAT rate on customer invoices; Ist only with
  confirmed §20 approval; linked invoice payments; §20 S. 3 switch handling (IR-02).
- Every unpaid VAT period / income-tax year since the year before last stays open; DFV due dates;
  bulk "filed and paid up to …" (IR-05).
- Safe to spend deducts unreserved ended-period and earlier taxes and unreserved tax payments;
  uncertainties rule out "safe" (IR-01); Kleinunternehmer check counts unclassified income (IR-04).
- Jobcenter: future-period and unclassified-income warnings, stored with the record (IR-06/07).
- Bank-import Finanzamt lines stay unclassified and can be linked as tax payments; duplicate
  payments refused (IR-08). Idempotent payments (IR-09). Payment dates (IR-16).
- Durable storage deletion queue + daily cleanup job (IR-10). Gewerbesteuer warning (IR-11).
  Projection counts the current month partially (IR-12). Receipt type must be chosen (IR-13).
  "1,234" refused (IR-17). Shared calculations moved to lib/finance (IR-18). Smaller hardening (IR-19).
- Seed password and DB host removed from docs (IR-20). Migration `20261102090000`.

## RC2.2 — second independent review (2026-11-01) — on release/rc2-hardening, not merged or deployed

### Finance (from an adversarial finance review; each fix has a regression test that fails on RC2.1)
- Tax payments to / refunds from the Finanzamt are recorded on the Tax page as typed transactions
  for a period: not profit, not business expense, not private money, not this month's spending;
  VAT ones count in the Anlage EKS. New migration `20261101120000_tax_payments_and_settlement`.
- The VAT period just ended and last year's income tax stay open (warning, Tax page) until paid
  or marked settled — previously they vanished on the first day of the new period.
- Business income with an unconfirmed VAT rate (Regelbesteuerung) is estimated at 19 % instead of
  0 %; import (`vatRate: null`) and receipt approval without VAT now flag the booking.
- One expense settles one commitment; "GmbH" etc. are no name match; partly paid bills keep their rest.
- Kleinunternehmer: founding-year limit checked before the 100,000 € warning; turnover measured
  net with each row's stored VAT rate.
- Future-dated records excluded from "so far" figures; minimum income tax on profit so far shown.
- Import: string amounts parsed strictly ("1.234" = 1,234 €). Preparation export uses the shared
  summary and Berlin years. Jobcenter route now honours tax payments.

### Security (from an adversarial security review)
- Open redirect after login fixed; cross-site API writes refused; sessions of deleted accounts
  rejected; per-account login limit and constant-time unknown-user path; AI route input validated;
  paid amounts on invoices/bills can no longer be reduced (double booking); daily close serialised;
  persona input bounded; guidance ids must be strings; letters cannot be booked; PII-safe logging.

### Quality
- Flaky E2E root cause: stale "Saved." confirmation (also a UX bug) — fixed; tests wait for HTTP 201.
- New tests: anonymous-access matrix over all routes, extra tenant isolation, session, security
  units, finance regression units, VAT tax-payment E2E (desktop + mobile + axe).
- Dev toolchain: vitest 5, @types/node 24, tsx 4.23 (esbuild 0.28.2), engines Node 24.x.

## RC2.1 — security patch (2026-11-01) — on release/rc2-hardening, not merged or deployed

- Session recovery: no work lost; see `docs/release/SESSION-RECOVERY-REPORT.md`.
- Dependencies patched for advisories published after RC2: `next` 16.2.6 → 16.4.3 (incl.
  Middleware/Proxy bypass), `next-auth` beta.31 → beta.32 (`@auth/core` 0.41.3),
  `@auth/prisma-adapter` 2.11.3, `zod` 4.6.7, `prisma`/`@prisma/client`/`@prisma/adapter-pg` 7.10.1,
  `eslint-config-next` 16.4.3, transitive fixes via `npm audit fix`. Production audit: 0 vulnerabilities.
- No source changes needed; full verification re-run (see recovery report §6).

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
