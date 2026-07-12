-- CreateTable
CREATE TABLE "AiPromptVersion" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "userTemplate" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
    "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiPromptVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "userId" TEXT,
    "input" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "model" TEXT,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDryRun" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "summary" TEXT,
    "promptVersion" INTEGER,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiResult" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "reviewStatus" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdCrmId" TEXT,
    "createdCrmType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiPromptVersion_agentKey_isActive_idx" ON "AiPromptVersion"("agentKey", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "AiPromptVersion_agentKey_version_key" ON "AiPromptVersion"("agentKey", "version");

-- CreateIndex
CREATE INDEX "AiRun_agentKey_idx" ON "AiRun"("agentKey");

-- CreateIndex
CREATE INDEX "AiRun_userId_idx" ON "AiRun"("userId");

-- CreateIndex
CREATE INDEX "AiRun_startedAt_idx" ON "AiRun"("startedAt");

-- CreateIndex
CREATE INDEX "AiResult_runId_idx" ON "AiResult"("runId");

-- CreateIndex
CREATE INDEX "AiResult_reviewStatus_idx" ON "AiResult"("reviewStatus");

-- AddForeignKey
ALTER TABLE "AiResult" ADD CONSTRAINT "AiResult_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
