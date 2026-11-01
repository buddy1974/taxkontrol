-- AlterTable
ALTER TABLE "TaxReserve" ADD COLUMN     "settledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "taxPaymentType" "TaxReserveType",
ADD COLUMN     "taxPeriodStart" TIMESTAMP(3);

