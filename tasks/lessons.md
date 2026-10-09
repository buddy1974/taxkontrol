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
