# Marcel — Action Required (TaxKontrol RC2)

Consolidated list of external actions the engineering work could not (and must not) do alone.
Ordered by dependency. Secret values never go into chat, code or this file.

Status keys: ⛔ release-blocking · ⚠️ before real users · 🔹 recommended

---

## 1. ⛔ Identify which database is which

- **Why:** Claude must never guess where real customer data lives. The Neon database in local
  `.env.local` (`ep-small-dawn-alq84b48-pooler…eu-central-1`, db `neondb`) holds 3 users,
  12 transactions and 1 document (read-only count on 2026-10-09). Two users look like
  seed/dev accounts. The third may be real.
- **Platform:** Vercel (project `taxkontrol`) + Neon console.
- **Steps:**
  1. Vercel → Project `taxkontrol` → Settings → Environment Variables → `DATABASE_URL`.
     It currently applies to **Production and Preview together**. Note the Neon host shown in the
     Neon console for that connection string (do not paste the value anywhere).
  2. In Neon, check whether that host is `ep-small-dawn-alq84b48`.
  3. Tell Claude: "production DB host = ep-…, local .env.local DB is production / dev".
- **Needed info:** host name only (no password).
- **If skipped:** no migration can be applied safely; RC2 cannot be deployed.
- **Claude verifies by:** read-only `prisma migrate status` + table counts against the confirmed target.

## 2. ⛔ Separate production and preview/development databases

- **Why:** Preview and production share one `DATABASE_URL`. Any preview build or test would
  write into production. Preview deployments are therefore **disabled** in `vercel.json`
  (only `main` deploys) until this is fixed.
- **Platform:** Neon + Vercel.
- **Steps:**
  1. Neon → create a branch `preview` (or a separate project) from production.
  2. Vercel → `DATABASE_URL`: edit so that **Production** keeps the production URL and add a
     separate value for **Preview** (the `preview` branch URL). Same for `Development` if used.
  3. Locally, point `.env.local` at a **local or dev branch** database, never production.
  4. Optional: once done, ask Claude to re-enable preview deployments in `vercel.json`.
- **If skipped:** previews stay disabled; any accidental preview writes to production.
- **Claude verifies by:** `vercel env ls` (names/targets only) shows distinct entries per target.

## 3. ⛔ Apply database migrations to production — BEFORE merging to `main`

- **Why:** RC2 code needs table `AuditEvent` and column `TaxProfile.vatFilingPeriod`
  (migration `20261009072541_add_audit_events_and_vat_period`, additive only: one new table, one
  new column with a default). The production DB was built with `db push` earlier. Its migration
  history only records `init`, so `migrate deploy` would fail on the two already-present
  migrations unless they are first marked as applied.
- **Verified so far:** on the `.env.local` Neon DB, `prisma migrate diff` (database → schema
  before RC2) was **empty**. The two pending migrations' objects already exist there, so marking
  them applied is bookkeeping only. Repeat this check on the confirmed production DB.
- **Steps** (PowerShell, in the repo, with `DATABASE_URL` set to the **confirmed production** URL
  in the current shell only):
  1. Neon → create a branch/backup "pre-rc2" (point-in-time restore point).
  2. `git checkout 37a600b -- prisma/schema.prisma` (schema before RC2), then
     `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`
     → must print "This is an empty migration." Then `git checkout HEAD -- prisma/schema.prisma`.
  3. `npx prisma migrate resolve --applied 20260530150000_add_entitlements`
  4. `npx prisma migrate resolve --applied 20260605000001_add_guidance_and_document_review`
  5. `npx prisma migrate deploy` → applies only `20261009072541_add_audit_events_and_vat_period`.
  6. `npx prisma migrate status` → "Database schema is up to date".
  7. `$env:SEED_CONFIRM_REMOTE="<host>"; npm run seed:system` (upserts the 7 system categories; nothing deleted).
- **If skipped:** after merge, settings, dashboard, transactions and reports return 500 errors in production.
- **Claude verifies by:** read-only `migrate status` and a table/column existence query.

## 4. ⛔ Review and merge the release branch (after 1–3)

- **Why:** All work is on branch `release/rc2-hardening` (not merged, not deployed). Merging to `main`
  triggers a production deployment on Vercel project `taxkontrol`.
- **Steps:** independent review (Codex), then open a PR `release/rc2-hardening → main`, check CI,
  merge. Then confirm the Vercel deployment is **Ready** and `GET /api/health` returns `{"status":"ok"}`.
- **Claude verifies by:** `vercel list taxkontrol` + health endpoint + smoke test on the deployed URL.

## 5. ⚠️ Seed / dev accounts in the shared database

- **Why:** The old seed script created `lone@taxkontrol.com` with the hardcoded password
  `taxkontrol2024`, and the dev bypass created `test@taxkontrol.local`. Both appear to exist in the
  Neon DB (2 "seed-like" users counted).
- **Steps:** in the confirmed production DB, delete these accounts, or at least set a new password
  through the app. Do it in-app via Settings → Delete account (export first if needed), or ask
  Claude for a scoped one-off script once the DB is identified.
- **If skipped:** anyone who knows the old seed password can sign in to that account.

## 6. ⚠️ Vercel environment variables (project `taxkontrol`)

Set or confirm (names only; values only in Vercel):

| Variable | Needed for | Note |
|---|---|---|
| `AUTH_SECRET` (or `NEXTAUTH_SECRET`) | sessions | ≥ 32 chars, generate with `openssl rand -base64 32`; separate per environment |
| `AUTH_URL` / `NEXTAUTH_URL` | auth callbacks | the final app URL (see item 7) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | contact form | currently **missing on `taxkontrol`**. Before RC2 every consultation request was silently lost; it now answers 503 with your e-mail address |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | shared rate limiting | without them limits are per serverless instance |
| `ANTHROPIC_MODEL` (optional) | AI receipt reading | default `claude-opus-5-5`; see item 10 for cost |
| `DEV_BYPASS_LOGIN` | — | must **not** be set on Vercel (code ignores it there anyway) |
| `ENTITLEMENTS_ENFORCED` | paid features | leave unset (off) until item 11 is decided |

- **Claude verifies by:** server start log `[env] …` lines (names only) and `/api/health`.

## 7. ⚠️ Domain architecture

- **Current state (verified):** `taxkontrol.de` and `www.taxkontrol.de` are attached to Vercel
  project **maxpromo-digital** (marketing page). There `/login` and `/dashboard` redirect to
  `maxpromo.digital`. The app itself is only reachable at `taxkontrol-*.vercel.app`.
- **Recommendation:** keep `taxkontrol.de` as the product website, serve the app at
  **`app.taxkontrol.de`** from project `taxkontrol`.
- **Steps:** Vercel → project `taxkontrol` → Domains → add `app.taxkontrol.de` → create the shown
  DNS record at your DNS provider → set `AUTH_URL`/`NEXTAUTH_URL` to `https://app.taxkontrol.de`
  → link "Login" on the marketing site to it. Do not move `taxkontrol.de` itself.
- **If skipped:** users cannot reach the app under the brand domain.
- **Claude verifies by:** `vercel domains inspect app.taxkontrol.de` + HTTPS request to `/api/health`.

## 8. ⚠️ Legal texts (Datenschutz / Impressum) — your decision, not engineering

Claude does not write legal text. Gaps found:
- Datenschutz does not mention: contact-form data and its delivery via **Telegram**, **Upstash** (if
  enabled), legal bases (Art. 6 DSGVO), storage/deletion periods, transfers to third countries
  (Anthropic, Vercel — US), the new self-service data export and account deletion.
- Datenschutz says Anthropic processes data "according to its own policies". Check that a DPA/AVV is
  in place with Anthropic, Vercel, Neon, Cloudflare (and Telegram/Upstash if used).
- Impressum publishes the personal **Steuernummer**. Not required by § 5 DDG and commonly
  discouraged; decide whether to remove it. (Citation updated from § 5 TMG to § 5 DDG.)

## 9. ⚠️ Professional review of the financial logic

- **Why:** Calculations now follow documented law (`docs/finance/RULES.md`) and are tested, but they
  remain estimates for non-experts. Before real users rely on them, a Steuerberater should review
  `docs/finance/CALCULATIONS.md`, in particular the Kleinunternehmer handling, the income-tax
  estimate assumptions and the Jobcenter (§11b SGB II) estimate.
- **Claude verifies by:** turning review comments into tests and changes.

## 10. 🔹 AI cost/model decision

Receipt and bank-statement reading now uses the official SDK with structured outputs. The default
model is `claude-opus-5-5` (highest quality, $4/$20 per MTok). Set `ANTHROPIC_MODEL` if you prefer
a cheaper model (e.g. `claude-sonnet-5-5` or `claude-haiku-5-5`). The old IDs (`claude-sonnet-4-20250514`,
`claude-haiku-4-5-20251001`) are no longer used.

## 11. 🔹 Paid features (Sprint 15)

Decide which features are paid (`docs/SPRINT-15-ENTITLEMENTS-PLAN.md`, open decisions) and whether
to build Stripe checkout. Server-side gates exist for letter analysis (FINANZAMT) and preparation
package (PREPARATION) but stay **off** until `ENTITLEMENTS_ENFORCED=true`.

## 12. 🔹 Operations

- Neon: confirm point-in-time restore retention on the production branch; do one restore test.
- Uptime monitor on `https://<app-domain>/api/health` (any monitoring service).
- Optional error monitoring (e.g. Sentry) needs an account — tell Claude if wanted.
- GitHub: after the first push of this branch, confirm the **CI** workflow runs green (needs Actions enabled).

## 13. 🔹 Product decisions

- UI language: currently English with German terms explained. Switch to full German?
- Anonymous visitors to the app root `/` go to the consultation form (kept from RC1). Keep?
- Claude Code: `.claude/settings.json` excludes the X-PATH `CLAUDE.md` from the parent folder.
  Please confirm in a new session that X-PATH rules no longer appear (`/memory`).
