-- AlterTable
ALTER TABLE "Competitor"
  ADD COLUMN "serviceLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "product"      TEXT;
