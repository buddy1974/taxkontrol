import { execSync } from 'child_process'
import { Client } from 'pg'
import { isLocalDatabaseUrl } from '../../lib/dbTarget'

/** Fresh, migrated, isolated database for every E2E run. */
export default async function globalSetup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://taxkontrol:taxkontrol_test@localhost:55440/taxkontrol_test'
  if (!isLocalDatabaseUrl(url)) throw new Error('Refusing to run E2E tests against a non-local database.')
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } })
  const client = new Client({ connectionString: url })
  await client.connect()
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'"
  )
  if (rows.length) await client.query(`TRUNCATE ${rows.map(r => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`)
  await client.end()
  execSync('npx tsx prisma/seed.ts system', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } })
}
