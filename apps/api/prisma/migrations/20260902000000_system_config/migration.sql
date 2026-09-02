-- Generic key-value store for runtime config that admins can edit via UI
-- (e.g. AI provider API keys) instead of editing .env + restarting.

CREATE TABLE "SystemConfig" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "SystemConfig_pkey" PRIMARY KEY ("key")
);
