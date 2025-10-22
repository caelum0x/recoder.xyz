-- AlterTable
ALTER TABLE "public"."api_keys" ADD COLUMN     "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "rateLimitDaily" INTEGER,
ADD COLUMN     "rateLimitMonthly" INTEGER,
ADD COLUMN     "sessionId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'web',
ADD COLUMN     "usageCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."cli_sessions" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "authorizedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,

    CONSTRAINT "cli_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cli_usage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "model" TEXT,
    "provider" TEXT,
    "tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "cli_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_deviceCode_key" ON "public"."cli_sessions"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_userCode_key" ON "public"."cli_sessions"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_accessToken_key" ON "public"."cli_sessions"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_refreshToken_key" ON "public"."cli_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "cli_sessions_deviceCode_status_idx" ON "public"."cli_sessions"("deviceCode", "status");

-- CreateIndex
CREATE INDEX "cli_sessions_userId_status_idx" ON "public"."cli_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "cli_sessions_expiresAt_idx" ON "public"."cli_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "cli_sessions_status_idx" ON "public"."cli_sessions"("status");

-- CreateIndex
CREATE INDEX "cli_usage_userId_timestamp_idx" ON "public"."cli_usage"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "cli_usage_sessionId_timestamp_idx" ON "public"."cli_usage"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "cli_usage_provider_model_idx" ON "public"."cli_usage"("provider", "model");

-- CreateIndex
CREATE INDEX "cli_usage_timestamp_idx" ON "public"."cli_usage"("timestamp");

-- AddForeignKey
ALTER TABLE "public"."api_keys" ADD CONSTRAINT "api_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."cli_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cli_sessions" ADD CONSTRAINT "cli_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cli_usage" ADD CONSTRAINT "cli_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cli_usage" ADD CONSTRAINT "cli_usage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."cli_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
