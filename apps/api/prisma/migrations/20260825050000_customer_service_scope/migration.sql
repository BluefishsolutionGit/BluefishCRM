-- AlterTable
ALTER TABLE "Customer" ADD COLUMN "primaryServiceLines" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill from existing opportunities + contracts, keeping only valid service lines
UPDATE "Customer" c SET "primaryServiceLines" = (
  SELECT COALESCE(array_agg(DISTINCT s), ARRAY[]::TEXT[])
  FROM (
    SELECT unnest("serviceLines") AS s FROM "Contract" WHERE "customerId" = c.id
    UNION
    SELECT "serviceOrProduct" AS s FROM "Opportunity"
      WHERE "customerId" = c.id AND "serviceOrProduct" IS NOT NULL AND "serviceOrProduct" <> ''
  ) t
  WHERE s IN ('Box', '3S', '3D', 'AI&RPA')
);
