-- Per-user BYOK API credentials. `encryptedKey` is base64(iv||tag||ciphertext)
-- using AES-256-GCM via integrations/crypto.ts (same helper as ChannelIntegration).
-- When a user has a key for a provider, LlmClient uses it instead of the
-- company-wide ANTHROPIC_API_KEY — cost lands on the user's own Anthropic bill.

CREATE TABLE "UserAiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Default',
    "encryptedKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "UserAiKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserAiKey_userId_provider_label_key" ON "UserAiKey"("userId", "provider", "label");
CREATE INDEX "UserAiKey_userId_idx" ON "UserAiKey"("userId");

ALTER TABLE "UserAiKey" ADD CONSTRAINT "UserAiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
