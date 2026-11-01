-- CreateEnum
CREATE TYPE "VatMethod" AS ENUM ('SOLL', 'IST');

-- AlterTable
ALTER TABLE "JobcenterRecord" ADD COLUMN     "warnings" JSONB;

-- AlterTable
ALTER TABLE "Receivable" ADD COLUMN     "invoiceDate" TIMESTAMP(3),
ADD COLUMN     "vatRate" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "receivableId" TEXT;

-- CreateTable
CREATE TABLE "TaxStatusPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "taxType" "TaxType" NOT NULL,
    "vatMethod" "VatMethod" NOT NULL DEFAULT 'SOLL',
    "vatFilingPeriod" "VatFilingPeriod" NOT NULL DEFAULT 'QUARTERLY',
    "dauerfristverlaengerung" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxStatusPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "response" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingStorageDeletion" (
    "id" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PendingStorageDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Transaction_receivableId_idx" ON "Transaction"("receivableId");

-- CreateIndex
CREATE INDEX "IdempotencyRecord_createdAt_idx" ON "IdempotencyRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxStatusPeriod_userId_validFrom_key" ON "TaxStatusPeriod"("userId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyRecord_userId_key_key" ON "IdempotencyRecord"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PendingStorageDeletion_objectKey_key" ON "PendingStorageDeletion"("objectKey");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxStatusPeriod" ADD CONSTRAINT "TaxStatusPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdempotencyRecord" ADD CONSTRAINT "IdempotencyRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Data: every existing user keeps the status they have today as their history so far
-- (valid "since always"). Additive only; nothing is deleted or rewritten. VAT method
-- defaults to SOLL, the legal default (§16 UStG); users approved for Ist-Versteuerung
-- (§20 UStG) confirm it in Settings.
INSERT INTO "TaxStatusPeriod" ("id", "userId", "validFrom", "taxType", "vatMethod", "vatFilingPeriod", "dauerfristverlaengerung")
SELECT gen_random_uuid()::text, u."id", TIMESTAMP '1970-01-01 00:00:00', u."taxType", 'SOLL',
       COALESCE(p."vatFilingPeriod", 'QUARTERLY'), false
FROM "User" u
LEFT JOIN "TaxProfile" p ON p."userId" = u."id"
ON CONFLICT ("userId", "validFrom") DO NOTHING;
