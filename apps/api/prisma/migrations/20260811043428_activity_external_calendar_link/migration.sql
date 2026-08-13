-- AlterTable
ALTER TABLE "Activity" ADD COLUMN     "externalCalendarAccountId" TEXT,
ADD COLUMN     "externalCalendarId" TEXT;

-- CreateIndex
CREATE INDEX "Activity_externalCalendarId_idx" ON "Activity"("externalCalendarId");
