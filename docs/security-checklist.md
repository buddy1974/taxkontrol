# Security Checklist — `taxkontrol` (RC2, 2026-10-09)

| Control | Status | Evidence |
|---|---|---|
| Every API route authenticates | PASS | `tests/integration/tenantIsolation.test.ts`, E2E 401 check |
| Every query scoped by `userId`; foreign ids → 404 | PASS | tenant isolation tests (transactions, documents, review link, reserves, dashboard, Jobcenter, export) |
| Proxy: legal pages public, everything else gated | PASS | E2E public pages |
| Passwords bcrypt (cost 12), length 10–72 bytes, no hash in session | PASS | register tests, `lib/auth.ts` |
| Login/registration rate limits | PASS (per instance) | E2E 429 test; shared limits need Upstash |
| Dev bypass impossible on Vercel or remote DB | PASS | `lib/devAuth.ts` |
| No hardcoded credentials | PASS | seed generates/accepts env password; grep clean |
| Destructive seed impossible against remote DB | PASS | `prisma/seed.ts` guards; tooling refuses non-local URLs |
| Uploads validated by content; SVG/HEIC rejected; size limits | PASS (code) / NOT TESTED in E2E (storage disabled) | `lib/upload.ts` |
| Storage keys prefixed with owner id; short-lived signed URLs | PASS (code) | `lib/r2.ts` |
| AI output never booked without user approval; race-safe single booking | PASS | `documentsReview.test.ts` |
| Audit trail for financial changes | PASS | transaction/document/reserve/settings audit tests |
| Security headers (HSTS, frame-ancestors, nosniff, referrer, permissions) | PASS (config) | `next.config.ts` |
| No PII in logs | PASS (reviewed) | contact route, AI client |
| Secrets only in env; startup report names only | PASS | `lib/env.ts` + test |
| Account export / deletion (DSGVO Art. 15/17/20) | PASS | `account.test.ts` |
| Full CSP (script-src) | NOT DONE | only `frame-ancestors` (Next inline runtime) |
| Dependency audit | NOT RUN in CI | add `npm audit` gate later |
| Penetration test | NOT DONE | before public launch |
