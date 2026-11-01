# Security Checklist — `taxkontrol` (RC2, 2026-10-09; updated 2026-11-01)

| Control | Status | Evidence |
|---|---|---|
| Every API route authenticates | PASS | `tests/integration/authMatrix.test.ts` (all 35 non-public route modules × every method → 401, nothing written), E2E 401 check |
| Every query scoped by `userId`; foreign ids → 404 | PASS | `tenantIsolation.test.ts` + `tenantIsolation2.test.ts` (fixed costs, invoices, bills, employees pay/deactivate, guidance cases/tasks, foreign receipt booking, tax-period settlement) |
| Ids must be strings (no Prisma filter objects) | PASS | guidance cases/tasks; `tenantIsolation2.test.ts` |
| Cross-site writes to `/api/v1` refused (Origin / Sec-Fetch-Site) | PASS | `lib/csrf.ts`, `tests/unit/security.test.ts` |
| Session of a deleted account no longer authenticates | PASS | `lib/getCurrentUser.ts`, `tests/integration/session.test.ts` |
| Login return target same-origin only (open redirect) | PASS | `lib/safeRedirect.ts`, unit tests incl. tab/newline tricks |
| Proxy: legal pages public, everything else gated | PASS | E2E public pages |
| Passwords bcrypt (cost 12), length 10–72 bytes, no hash in session | PASS | register tests, `lib/auth.ts` |
| Login/registration rate limits | PASS (per instance) | E2E 429 test (registration); login per IP+email and per account, constant-time for unknown e-mails — login limit NOT TESTED automatically; shared limits need Upstash |
| AI routes validate type/size before calling the model | PASS | `review2Findings.test.ts` |
| Recorded payments cannot be reduced (double booking) | PASS | `review2Findings.test.ts` |
| Finanzamt letters cannot be booked as transactions | PASS | `review2Findings.test.ts` |
| Dev bypass impossible on Vercel or remote DB | PASS | `lib/devAuth.ts` |
| No hardcoded credentials | PASS | seed generates/accepts env password; grep clean |
| Destructive seed impossible against remote DB | PASS | `prisma/seed.ts` guards; tooling refuses non-local URLs |
| Uploads validated by content; SVG/HEIC rejected; size limits | PASS (code) / NOT TESTED in E2E (storage disabled) | `lib/upload.ts` |
| Storage keys prefixed with owner id; short-lived signed URLs | PASS (code) | `lib/r2.ts` |
| AI output never booked without user approval; race-safe single booking | PASS | `documentsReview.test.ts` |
| Audit trail for financial changes | PASS | transaction/document/reserve/settings audit tests |
| Security headers (HSTS, frame-ancestors, nosniff, referrer, permissions) | PASS (config) | `next.config.ts` |
| No PII in logs | PASS (since 2026-11-01) | Previously **FAIL**: routes logged raw Prisma errors, which echo query arguments. Now `lib/log.ts` (class/code only), unit-tested |
| Secrets only in env; startup report names only | PASS | `lib/env.ts` + test |
| Account export / deletion (DSGVO Art. 15/17/20) | PASS | `account.test.ts`; rare orphaned upload on a race: R-020 |
| Dependency advisories (production) | PASS — `npm audit --omit=dev` 0 | 2026-11-01; dev-only minimatch accepted (R-017) |
| Full CSP (script-src) | NOT DONE | only `frame-ancestors` (Next inline runtime) |
| Dependency audit | NOT RUN in CI | add `npm audit` gate later |
| Penetration test | NOT DONE | before public launch |
