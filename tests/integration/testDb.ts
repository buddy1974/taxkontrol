import { isLocalDatabaseUrl } from '../../lib/dbTarget'

/** Isolated test database. Never a shared or cloud database. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://taxkontrol:taxkontrol_test@localhost:55440/taxkontrol_test'

export function assertSafeTestDatabase(): void {
  if (!isLocalDatabaseUrl(TEST_DATABASE_URL)) {
    throw new Error(`Refusing to run integration tests against a non-local database (${TEST_DATABASE_URL.replace(/\/\/.*@/, '//***@')}).`)
  }
}
