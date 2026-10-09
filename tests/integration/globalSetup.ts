import { execSync } from 'child_process'
import { assertSafeTestDatabase, TEST_DATABASE_URL } from './testDb'

/**
 * Applies all migrations to the isolated test database before the run.
 * Start it with:  npm run test:db:up
 */
export default function setup() {
  assertSafeTestDatabase()
  execSync('npx prisma migrate deploy', {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  })
}
