-- AlterTable
ALTER TABLE "public"."Chat" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "public"."GeneratedApp" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "public"."Message" ADD COLUMN     "metadata" JSONB;

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "username" TEXT,
    "bio" TEXT,
    "location" TEXT,
    "company" TEXT,
    "blog" TEXT,
    "publicRepos" INTEGER,
    "followers" INTEGER,
    "following" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "totpSecret" TEXT,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."UserSettings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferences" JSONB NOT NULL,
    "limits" JSONB NOT NULL,
    "apiKeys" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageStats" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generationsUsed" INTEGER NOT NULL DEFAULT 0,
    "tokensUsed" INTEGER NOT NULL DEFAULT 0,
    "modelsUsed" JSONB NOT NULL,
    "costAccrued" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "riskLevel" TEXT NOT NULL DEFAULT 'low',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ApiKey" (
    "id" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "scopes" TEXT[],
    "restrictions" JSONB NOT NULL,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DeviceFlow" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "platform" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "success" BOOLEAN NOT NULL,
    "riskLevel" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SecurityEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Router" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Router_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RouterUsage" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "responseTime" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL,

    CONSTRAINT "RouterUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RouterAnalytics" (
    "id" TEXT NOT NULL,
    "routerId" TEXT NOT NULL,
    "analyticsData" JSONB NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouterAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "UserSettings_userId_key" ON "public"."UserSettings"("userId");

-- CreateIndex
CREATE INDEX "UsageStats_userId_idx" ON "public"."UsageStats"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageStats_userId_date_key" ON "public"."UsageStats"("userId", "date");

-- CreateIndex
CREATE INDEX "UserSession_userId_idx" ON "public"."UserSession"("userId");

-- CreateIndex
CREATE INDEX "UserSession_deviceId_idx" ON "public"."UserSession"("deviceId");

-- CreateIndex
CREATE INDEX "UserSession_expiresAt_idx" ON "public"."UserSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserSession_userId_deviceId_key" ON "public"."UserSession"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyId_key" ON "public"."ApiKey"("keyId");

-- CreateIndex
CREATE INDEX "ApiKey_userId_idx" ON "public"."ApiKey"("userId");

-- CreateIndex
CREATE INDEX "ApiKey_keyId_idx" ON "public"."ApiKey"("keyId");

-- CreateIndex
CREATE INDEX "ApiKey_active_idx" ON "public"."ApiKey"("active");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceFlow_deviceCode_key" ON "public"."DeviceFlow"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceFlow_userCode_key" ON "public"."DeviceFlow"("userCode");

-- CreateIndex
CREATE INDEX "DeviceFlow_deviceCode_idx" ON "public"."DeviceFlow"("deviceCode");

-- CreateIndex
CREATE INDEX "DeviceFlow_userCode_idx" ON "public"."DeviceFlow"("userCode");

-- CreateIndex
CREATE INDEX "DeviceFlow_status_idx" ON "public"."DeviceFlow"("status");

-- CreateIndex
CREATE INDEX "DeviceFlow_expiresAt_idx" ON "public"."DeviceFlow"("expiresAt");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "public"."AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "public"."AuditLog"("action");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_riskLevel_idx" ON "public"."AuditLog"("riskLevel");

-- CreateIndex
CREATE INDEX "SecurityEvent_userId_idx" ON "public"."SecurityEvent"("userId");

-- CreateIndex
CREATE INDEX "SecurityEvent_eventType_idx" ON "public"."SecurityEvent"("eventType");

-- CreateIndex
CREATE INDEX "SecurityEvent_severity_idx" ON "public"."SecurityEvent"("severity");

-- CreateIndex
CREATE INDEX "SecurityEvent_createdAt_idx" ON "public"."SecurityEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SecurityEvent_resolved_idx" ON "public"."SecurityEvent"("resolved");

-- CreateIndex
CREATE UNIQUE INDEX "Router_routerId_key" ON "public"."Router"("routerId");

-- CreateIndex
CREATE INDEX "Router_userId_idx" ON "public"."Router"("userId");

-- CreateIndex
CREATE INDEX "Router_routerId_idx" ON "public"."Router"("routerId");

-- CreateIndex
CREATE INDEX "Router_status_idx" ON "public"."Router"("status");

-- CreateIndex
CREATE INDEX "Router_lastUsed_idx" ON "public"."Router"("lastUsed");

-- CreateIndex
CREATE INDEX "RouterUsage_routerId_idx" ON "public"."RouterUsage"("routerId");

-- CreateIndex
CREATE INDEX "RouterUsage_timestamp_idx" ON "public"."RouterUsage"("timestamp");

-- CreateIndex
CREATE INDEX "RouterUsage_provider_idx" ON "public"."RouterUsage"("provider");

-- CreateIndex
CREATE INDEX "RouterUsage_model_idx" ON "public"."RouterUsage"("model");

-- CreateIndex
CREATE INDEX "RouterAnalytics_routerId_idx" ON "public"."RouterAnalytics"("routerId");

-- CreateIndex
CREATE INDEX "RouterAnalytics_timestamp_idx" ON "public"."RouterAnalytics"("timestamp");

-- CreateIndex
CREATE INDEX "Chat_userId_idx" ON "public"."Chat"("userId");

-- CreateIndex
CREATE INDEX "GeneratedApp_userId_idx" ON "public"."GeneratedApp"("userId");

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."GeneratedApp" ADD CONSTRAINT "GeneratedApp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Chat" ADD CONSTRAINT "Chat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UsageStats" ADD CONSTRAINT "UsageStats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ApiKey" ADD CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Router" ADD CONSTRAINT "Router_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouterUsage" ADD CONSTRAINT "RouterUsage_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "public"."Router"("routerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RouterAnalytics" ADD CONSTRAINT "RouterAnalytics_routerId_fkey" FOREIGN KEY ("routerId") REFERENCES "public"."Router"("routerId") ON DELETE CASCADE ON UPDATE CASCADE;
