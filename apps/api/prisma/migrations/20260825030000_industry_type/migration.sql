-- CreateTable
CREATE TABLE "IndustryType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IndustryType_name_key" ON "IndustryType"("name");

-- Backfill from existing customers + common defaults
INSERT INTO "IndustryType" ("id", "name", "active", "updatedAt")
SELECT
  substring(md5(random()::text || clock_timestamp()::text) from 1 for 24),
  "name",
  true,
  CURRENT_TIMESTAMP
FROM (
  SELECT DISTINCT "industry" AS "name" FROM "Customer" WHERE "industry" IS NOT NULL AND "industry" <> ''
  UNION
  VALUES
    ('Healthcare'),
    ('Government'),
    ('Retail'),
    ('Manufacturing'),
    ('Finance & Banking'),
    ('Education'),
    ('Real Estate'),
    ('Logistics'),
    ('Telecommunications'),
    ('Hospitality'),
    ('Energy & Utilities'),
    ('Technology')
) AS distinct_names
ON CONFLICT ("name") DO NOTHING;
