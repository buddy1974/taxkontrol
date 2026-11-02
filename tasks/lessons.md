# TaxKontrol — Build Lessons

## Vercel vs Local TypeScript
Vercel runs Next.js TypeScript checker which is stricter than local tsc.
All .map() .filter() .reduce() callbacks need explicit types on Prisma return values.
Fix: add (param: any) to all untyped callbacks in API routes.

## Prisma on Vercel
Vercel fresh installs do not run prisma generate.
Fix: always use "build": "prisma generate && next build" in package.json.

## Prisma 7 + Next.js
Prisma 7 uses @prisma/adapter-pg — plain PrismaClient without adapter crashes.
Fix: use PrismaPg adapter in lib/db.ts and add serverExternalPackages to next.config.ts.

## Environment Variables
Prisma config reads .env not .env.local by default.
Fix: use dotenv config({ path: '.env.local', override: true }) in prisma.config.ts.

## RC2 hardening (2026-10-09)
- `prisma.config.ts` must NOT use `override: true` for `.env.local`: it silently redirected test
  and CI commands to the developer's cloud database. Explicit `DATABASE_URL` wins now.
- The old "(param: any)" workaround for Vercel type errors hid real type errors (57 lint errors).
  Run `prisma generate` before type checks instead; Prisma result types are inferred.
- Next.js 16 uses `proxy.ts`; a `runtime` export there breaks the build.
- Money: integer cents and Europe/Berlin boundaries. `new Date(y, m, 1)` on Vercel is UTC.
- Never trust a "success" when a side effect (Telegram, R2, AI) is not configured — return an
  honest error so the user can act.
- E2E: Next.js renders an empty `role="alert"` route announcer — target app alerts by id.
- Tests that create many users from one IP hit the registration limit by design — simulate
  distinct clients instead of raising the limit.

## Session recovery + dependency patch (2026-11-01)
- After an interruption, check the previous transcript tail and `git status` before re-planning:
  the "lost" RC2 programme had in fact finished and been handed over.
- Re-run `npm audit` at every resumption: critical advisories (Next.js proxy bypass, Auth.js)
  appeared within three weeks of a green RC.
- npm now blocks install scripts by default (`allow-scripts`). Prisma 7 still works (generate,
  migrate status) without the `prisma`/`@prisma/engines` scripts — verify, don't assume.
- One E2E failure is not proof of a regression or of a flake: isolate, then repeat the full suite.

## Second review round (2026-11-01)
- A passing "no core maths error" review checked the formulas, not what is fed into them. Ask
  explicitly about period boundaries (what happens on 2 January?), unknown inputs (VAT rate
  missing), and how a real-life event (paying the Finanzamt) is booked.
- Every place that reads transactions with its own `select` must include new semantic columns
  (the Jobcenter route silently treated tax payments as business expenses until fixed).
- Before trusting new regression tests, run them against the old code: 14/17 unit and 11/11
  integration tests failed there, the rest pin behaviour that was already right.
- A UI confirmation that is never cleared ("Saved.") makes tests race and misleads users.
- Long inline heredocs with JS template strings break in this shell: put patch scripts in files.
- `git push` can hang on the Credential Manager; use `gh auth git-credential` as helper.

## Independent adversarial review remediation (2026-11-02)
- Model the legal default, not the convenient case: VAT was computed as Istversteuerung for
  everyone, although Soll is the default and Ist needs an approval.
- Settings that change tax status are history, not a field: every period must be computed with
  the status valid then. A status change must be a patch from a date, never "replace from here".
- A reviewer of my own fix found three new High defects (overlapping periods, a payment making
  money "free" again, a patch wiping a later switch). Always get a fresh review of the fix itself.
- Prove regression tests fail without the fix: run them on the old commit in a disposable
  worktree + database, and mutation-test individual fixes.
- Check repository visibility before writing anything sensitive in docs: this repo is public.
- In this shell, any long heredoc can break — write patch scripts with the file tool.
- A Windows junction inside a worktree must be removed (Directory.Delete, non-recursive) before
  `git worktree remove --force`, or the shared node_modules could be deleted.

## 2026-11-02 — crash recovery / third review round

- **Run the suite at different times of day.** Every earlier green run was in the evening; the
  baseline at 00:54 Berlin exposed that calendar dates (12:00 UTC) were compared with `now`.
  Time-dependent tests must pin the clock (`vi.useFakeTimers({ toFake: ['Date'] })`) to the
  awkward moments: just after Berlin midnight, a CET morning, a CEST morning.
- **One concept, one number.** "Reserved" meant the total in one formula and the remaining
  balance in another — the same euro was spent twice. When two formulas use a stored amount,
  write down which meaning it has (ADR-030) and test the interaction, not each formula alone.
- **A derived value must stay in sync with its source.** `Receivable.paidAmount` vs. linked
  bookings: every path that deletes or edits one side must update or refuse the other.
- **Fresh reviewers with no conclusions in the brief find what internal reviewers miss**: both
  found the date bug independently; the finance reviewer found 2 Highs in the remediation.
- **Browser tests must wait for hydration** before typing into controlled inputs (WebKit lost
  values 3 of 5 runs); `__reactProps` on the form element is a reliable signal.
- **Do not edit the tree while a baseline is running against it** — keep the baseline on a clean
  commit or note exactly which steps saw which tree.
