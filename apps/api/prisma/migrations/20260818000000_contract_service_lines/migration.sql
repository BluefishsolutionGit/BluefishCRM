-- AlterTable
ALTER TABLE "Contract" ADD COLUMN "serviceLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
