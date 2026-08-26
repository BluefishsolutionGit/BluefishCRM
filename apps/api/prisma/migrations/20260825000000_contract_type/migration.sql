-- CreateTable
CREATE TABLE "ContractType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractType_name_key" ON "ContractType"("name");

-- Backfill from existing contract data + demo template types
INSERT INTO "ContractType" ("id", "name", "active", "updatedAt")
SELECT
  substring(md5(random()::text || clock_timestamp()::text) from 1 for 24) AS "id",
  "type" AS "name",
  true AS "active",
  CURRENT_TIMESTAMP AS "updatedAt"
FROM (
  SELECT DISTINCT "type" FROM "Contract" WHERE "type" IS NOT NULL AND "type" <> ''
  UNION
  VALUES
    ('Master Service Agreement'),
    ('Maintenance & Support'),
    ('SaaS Subscription'),
    ('Software License'),
    ('Non-Disclosure Agreement'),
    ('Service Level Agreement')
) AS distinct_types
ON CONFLICT ("name") DO NOTHING;
