# TaxKontrol

Financial clarity for small businesses and the self-employed in Germany: what is really yours,
what belongs to the tax office, what is still due — before problems develop.
Estimates only; TaxKontrol does not file taxes.

Stack: Next.js 16 · React 19 · Prisma 7 (Postgres) · Auth.js v5 · Cloudflare R2 · Claude API.

## Local development

```bash
npm ci
npm run test:db:up                 # isolated Postgres in Docker on localhost:55440
cp .env.example .env.local         # point DATABASE_URL at a LOCAL or dev database — never production
npx prisma migrate deploy
npm run seed:demo                  # local DB only; prints a generated demo password
npm run dev                        # http://localhost:2011
```

Never run `seed:demo`, `migrate dev`, `migrate reset` or `db push` against a shared database —
the tooling refuses non-local URLs, see `CLAUDE.md`.

## Verification

```bash
npm run typecheck
npm run lint
npm test                 # unit + integration (isolated DB)
npm run build
npm run test:e2e         # Playwright, desktop + mobile + axe, uses the production build
```
`npm run verify` runs the first four in sequence. CI: `.github/workflows/ci.yml`.

## Documentation

Start with `docs/repository-map.md`. Finance rules and sources: `docs/finance/RULES.md`,
how numbers are calculated: `docs/finance/CALCULATIONS.md`. Release status and external actions:
`docs/release/`.
