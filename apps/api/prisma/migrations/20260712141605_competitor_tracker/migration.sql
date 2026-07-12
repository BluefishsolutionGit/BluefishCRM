-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorContract" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Monitoring',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "dealValue" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "confidence" TEXT NOT NULL DEFAULT 'Med',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorContract_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_name_key" ON "Competitor"("name");

-- CreateIndex
CREATE INDEX "CompetitorContract_competitorId_idx" ON "CompetitorContract"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorContract_customerId_idx" ON "CompetitorContract"("customerId");

-- CreateIndex
CREATE INDEX "CompetitorContract_ownerId_idx" ON "CompetitorContract"("ownerId");

-- CreateIndex
CREATE INDEX "CompetitorContract_endDate_idx" ON "CompetitorContract"("endDate");

-- CreateIndex
CREATE INDEX "CompetitorContract_status_idx" ON "CompetitorContract"("status");

-- AddForeignKey
ALTER TABLE "CompetitorContract" ADD CONSTRAINT "CompetitorContract_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorContract" ADD CONSTRAINT "CompetitorContract_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorContract" ADD CONSTRAINT "CompetitorContract_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
