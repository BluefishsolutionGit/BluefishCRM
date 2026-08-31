-- NOTE: The `PushSubscription` table was already introduced by the earlier
-- migration `20260712022912_inbox_integrations`. It used to be re-created
-- here (duplicate CREATE TABLE) which fails on a fresh database with
-- "relation PushSubscription already exists". The redundant block has been
-- removed — this migration now only adds the WebAuthn tables.

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "credentialId"  TEXT NOT NULL,
    "publicKey"     BYTEA NOT NULL,
    "counter"       BIGINT NOT NULL DEFAULT 0,
    "transports"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "deviceLabel"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt"    TIMESTAMP(3),

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WebAuthnCredential_credentialId_key" ON "WebAuthnCredential"("credentialId");
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT,
    "purpose"   TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WebAuthnChallenge_userId_idx" ON "WebAuthnChallenge"("userId");
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");
