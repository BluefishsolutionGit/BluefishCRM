-- CreateTable
CREATE TABLE "ReportSchedule" (
    "id" TEXT NOT NULL,
    "reportKey" TEXT NOT NULL,
    "filters" JSONB,
    "cron" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'xlsx',
    "recipients" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReportSchedule_reportKey_idx" ON "ReportSchedule"("reportKey");

-- CreateIndex
CREATE INDEX "ReportSchedule_isActive_idx" ON "ReportSchedule"("isActive");
