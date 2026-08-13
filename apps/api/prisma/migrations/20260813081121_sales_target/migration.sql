-- CreateTable
CREATE TABLE "SalesTarget" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesTarget_period_idx" ON "SalesTarget"("period");

-- CreateIndex
CREATE UNIQUE INDEX "SalesTarget_service_period_key" ON "SalesTarget"("service", "period");
