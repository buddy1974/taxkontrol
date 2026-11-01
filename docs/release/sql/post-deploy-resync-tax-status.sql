-- TaxKontrol: run ONCE right after the code of release/rc2-hardening is live (Marcel action #3).
-- Why: migration 20261102090000 copies each user's status into "TaxStatusPeriod". If a user
-- changed their VAT status or filing period in Settings between the migration and the code
-- deploy, the OLD code only updated "User"/"TaxProfile", so the copied row is stale.
-- This updates only users whose history is still the single migrated row (valid since
-- 1970-01-01) and whose values differ from the current settings. The new code writes both
-- places in one transaction, so for every other user nothing changes. Safe to run twice.
-- Check first (read-only):
--   SELECT count(*) FROM "TaxStatusPeriod" t JOIN "User" u ON u.id = t."userId"
--   LEFT JOIN "TaxProfile" p ON p."userId" = u.id
--   WHERE t."validFrom" = TIMESTAMP '1970-01-01 00:00:00'
--     AND (SELECT count(*) FROM "TaxStatusPeriod" x WHERE x."userId" = t."userId") = 1
--     AND (t."taxType" <> u."taxType" OR t."vatFilingPeriod" <> COALESCE(p."vatFilingPeriod", 'QUARTERLY'));
BEGIN;
UPDATE "TaxStatusPeriod" t
SET "taxType" = u."taxType",
    "vatFilingPeriod" = COALESCE(p."vatFilingPeriod", 'QUARTERLY')
FROM "User" u
LEFT JOIN "TaxProfile" p ON p."userId" = u.id
WHERE u.id = t."userId"
  AND t."validFrom" = TIMESTAMP '1970-01-01 00:00:00'
  AND (SELECT count(*) FROM "TaxStatusPeriod" x WHERE x."userId" = t."userId") = 1
  AND (t."taxType" <> u."taxType" OR t."vatFilingPeriod" <> COALESCE(p."vatFilingPeriod", 'QUARTERLY'));
COMMIT;
