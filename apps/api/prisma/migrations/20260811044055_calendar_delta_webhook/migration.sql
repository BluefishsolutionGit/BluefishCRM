-- AlterTable
ALTER TABLE "CalendarSyncAccount" ADD COLUMN     "deltaLink" TEXT,
ADD COLUMN     "webhookClientState" TEXT,
ADD COLUMN     "webhookExpiresAt" TIMESTAMP(3),
ADD COLUMN     "webhookSubscriptionId" TEXT;

-- CreateIndex
CREATE INDEX "CalendarSyncAccount_webhookClientState_idx" ON "CalendarSyncAccount"("webhookClientState");
