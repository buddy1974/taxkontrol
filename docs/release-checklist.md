# Release Checklist — TaxKontrol

Use for every release to `main` (= production deploy on Vercel project `taxkontrol`).

## Before merge
- [ ] Branch is green: `npm run typecheck`, `npm run lint` (0 errors), `npm test`, `npm run build`, `npm run test:e2e`
- [ ] CI workflow green on GitHub (incl. migration drift check)
- [ ] Independent review done (Codex / human); findings resolved or recorded
- [ ] New migrations reviewed: additive? data-safe? backward compatible with the currently deployed code?
- [ ] Production DB identity confirmed; Neon restore point created
- [ ] Migrations applied to production **before** merge (`migrate status` up to date)
- [ ] Vercel env vars present for production (names checked via `vercel env ls`)
- [ ] `docs/change-log.md`, `decision-log.md`, `known-risks.md` updated

## After merge
- [ ] Vercel deployment for the merge commit is **Ready** (verify in Vercel, not just a local build)
- [ ] `GET /api/health` → `{"status":"ok","database":"ok"}` and `commit` matches
- [ ] Smoke test on the deployed URL: login, dashboard, add transaction, tax page, report download
- [ ] Error logs checked for the first hour

## Rollback
- Vercel → Deployments → previous Ready deployment → "Promote to Production".
- Migrations are additive; leave them in place. Restore from Neon only for data damage.
