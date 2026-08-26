-- CreateTable
CREATE TABLE "PushSubscription" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "endpoint"      TEXT NOT NULL,
    "p256dh"        TEXT NOT NULL,
    "auth"          TEXT NOT NULL,
    "userAgent"     TEXT,
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt"   TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

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
