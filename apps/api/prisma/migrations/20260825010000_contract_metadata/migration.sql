-- AlterTable
ALTER TABLE "Contract"
  ADD COLUMN "name"               TEXT,
  ADD COLUMN "serviceDescription" TEXT,
  ADD COLUMN "businessUnit"       TEXT,
  ADD COLUMN "contactPerson"      TEXT,
  ADD COLUMN "contactEmail"       TEXT,
  ADD COLUMN "contractTerm"       TEXT,
  ADD COLUMN "renewNoticeDays"    INTEGER;
