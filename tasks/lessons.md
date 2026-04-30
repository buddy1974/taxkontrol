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
