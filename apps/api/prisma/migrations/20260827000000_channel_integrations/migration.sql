-- CreateTable
CREATE TABLE "ChannelIntegration" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default',
    "credentials" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelIntegration_channel_idx" ON "ChannelIntegration"("channel");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelIntegration_channel_label_key" ON "ChannelIntegration"("channel", "label");

-- AddForeignKey
ALTER TABLE "ChannelIntegration" ADD CONSTRAINT "ChannelIntegration_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
