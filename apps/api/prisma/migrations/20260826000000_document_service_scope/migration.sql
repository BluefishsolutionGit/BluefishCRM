-- AlterTable — Document scope
ALTER TABLE "Document"
  ADD COLUMN "serviceLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "isCentral"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "description"  TEXT;

-- AlterTable — DocumentVersion notes
ALTER TABLE "DocumentVersion"
  ADD COLUMN "notes" TEXT;

-- CreateIndex
CREATE INDEX "Document_isCentral_idx" ON "Document"("isCentral");

-- Backfill Document.serviceLines from linked Contract, then Customer, then Opportunity
UPDATE "Document" d SET "serviceLines" = c."serviceLines"
FROM "Contract" c
WHERE d."contractId" = c.id AND d."contractId" IS NOT NULL
  AND array_length(c."serviceLines", 1) IS NOT NULL;

UPDATE "Document" d SET "serviceLines" = cust."primaryServiceLines"
FROM "Customer" cust
WHERE d."customerId" = cust.id AND d."customerId" IS NOT NULL
  AND array_length(d."serviceLines", 1) IS NULL
  AND array_length(cust."primaryServiceLines", 1) IS NOT NULL;

UPDATE "Document" d SET "serviceLines" = ARRAY[o."serviceOrProduct"]
FROM "Opportunity" o
WHERE d."opportunityId" = o.id AND d."opportunityId" IS NOT NULL
  AND array_length(d."serviceLines", 1) IS NULL
  AND o."serviceOrProduct" IS NOT NULL AND o."serviceOrProduct" IN ('Box', '3S', '3D', 'AI&RPA');
