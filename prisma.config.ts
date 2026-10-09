import { config } from 'dotenv'
import { defineConfig } from 'prisma/config'

// Load .env.local for local convenience, but NEVER override a DATABASE_URL that
// was set explicitly in the environment. Tests and CI point Prisma at an
// isolated database by exporting DATABASE_URL; with `override: true` the
// developer's cloud database URL in .env.local would silently win instead.
config({ path: process.env.PRISMA_ENV_FILE ?? '.env.local', override: false })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
    // Only used by `migrate diff --from-migrations` (CI drift check). Disposable DB.
    ...(process.env['SHADOW_DATABASE_URL'] ? { shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'] } : {}),
  },
})
