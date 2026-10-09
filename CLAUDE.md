# TaxKontrol — Repository Governance

**Project:** TaxKontrol (financial clarity for small businesses and the self-employed in Germany)
**Owner / PM:** Marcel (Maxpromo Digital)
**Repository:** `C:\Users\loneb\Documents\ai-software-dev\projects\taxkontrol` · GitHub `buddy1974/taxkontrol`
**Lifecycle stage:** Beta (release candidate for controlled real-user testing) — see `docs/repository-map.md`

> **Scope of instructions.** Only this file, `AGENTS.md`, the AI Operating System below and
> `docs/` govern TaxKontrol. The parent folder's `projects/CLAUDE.md` belongs to the
> unrelated **X-PATH** project (pathology). Its guardrails, milestones and roles do **not**
> apply here. `.claude/settings.json` excludes it via `claudeMdExcludes`; if it still shows
> up in context, ignore it for TaxKontrol work.

@AGENTS.md

## Operating system

`C:\Users\loneb\Documents\AI-OPERATING-SYSTEM\MASTER-AI-OPERATING-SYSTEM.md` — read first.
If it is missing, report that and continue with this file as the governing authority.

## Startup procedure

1. Read this file, `AGENTS.md`, `docs/repository-map.md`, `docs/known-risks.md` and
   `docs/release/MARCEL-ACTION-REQUIRED.md`.
2. Confirm working directory, branch and `git status`; preserve unrelated changes.
3. For financial work, read `docs/finance/RULES.md` and `docs/finance/CALCULATIONS.md`.
4. Plan, implement, verify (below), document, hand over.

## Non-negotiable safety rules

- **Databases.** Never run `seed:demo`, `migrate dev`, `migrate reset`, `db push` or any
  destructive SQL against a non-local database. The Neon database in `.env.local` must be
  treated as possibly containing real customer data until Marcel confirms otherwise.
  Tests use the isolated local Postgres (`npm run test:db:up`) only — the harness refuses
  non-local URLs.
- **Production migrations** are applied only by Marcel (see the action list), never by an agent.
- **Secrets** never in code, logs, chat or docs. Report variable *names* only.
- **No deploys or merges to `main`** without Marcel's approval. Preview deployments are
  disabled (`vercel.json`) because preview and production currently share one database.
- **Financial rules.** Never invent tax rates, limits or filing duties. Every legal value lives
  in `lib/finance/rules.ts` with its legal basis and year, and in `docs/finance/RULES.md` with
  sources. Years without enacted law fall back to the latest enacted year and are flagged.
- **Money logic lives in one place**: `lib/finance/*` (pure, tested). Routes and pages must not
  re-implement calculations.
- **AI output is only a suggestion.** Nothing AI-extracted is booked without explicit user
  approval; bank-import lines default to "not sure".
- Distinguish **estimates** from confirmed liabilities in every user-facing text. A reserve
  target is never "money owed to the Finanzamt", and "reserved" is only what the user entered.

## Verification before "done"

```
npm run typecheck
npm run lint            # 0 errors required
npm run test:db:up      # once: isolated Postgres on localhost:55440
npm test                # unit + integration
npm run build
npm run test:e2e        # Playwright desktop + mobile + axe, after build
```

A passing build is not proof a feature works. Report PASS / FAIL / NOT TESTED / BLOCKED honestly.

## Human approval required

Agents must not approve their own work, releases, security exceptions, architecture changes
or production deployments. Material changes are recorded in `docs/decision-log.md`.

## Memory rule

Chat history is not a source of truth. Before ending a session update `docs/change-log.md`,
`docs/decision-log.md`, `docs/known-risks.md` and `docs/release/MARCEL-ACTION-REQUIRED.md`
as applicable, and add lessons to `tasks/lessons.md`.
