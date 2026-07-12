-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "flowaccountContactCode" TEXT;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "flowaccountDocumentNumber" TEXT,
ADD COLUMN     "flowaccountId" TEXT,
ADD COLUMN     "flowaccountLastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "flowaccountStatus" TEXT;
