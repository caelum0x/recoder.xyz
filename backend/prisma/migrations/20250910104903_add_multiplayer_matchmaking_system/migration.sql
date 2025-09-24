-- AlterTable
ALTER TABLE "public"."projects" ADD COLUMN     "configuration" JSONB DEFAULT '{}',
ADD COLUMN     "framework" TEXT,
ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "language" TEXT,
ADD COLUMN     "metadata" JSONB DEFAULT '{}',
ADD COLUMN     "projectPath" TEXT;

-- AlterTable
ALTER TABLE "public"."user_devices" ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "lastSyncAt" TIMESTAMP(3),
ADD COLUMN     "model" TEXT,
ADD COLUMN     "notificationPreferences" JSONB DEFAULT '{}',
ADD COLUMN     "version" TEXT;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "avatar" TEXT;

-- CreateTable
CREATE TABLE "public"."analytics_reports" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "slug" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dataSource" JSONB NOT NULL DEFAULT '{}',
    "dimensions" JSONB NOT NULL DEFAULT '[]',
    "metrics" JSONB NOT NULL DEFAULT '[]',
    "visualizations" JSONB NOT NULL DEFAULT '[]',
    "schedule" JSONB DEFAULT '{}',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "analytics_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_executions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "executionTime" INTEGER,
    "results" JSONB,
    "error" TEXT,
    "rowCount" INTEGER,
    "cacheHit" BOOLEAN NOT NULL DEFAULT false,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scheduleId" TEXT,

    CONSTRAINT "report_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_exports" (
    "id" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filePath" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "options" JSONB NOT NULL DEFAULT '{}',
    "customization" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3),
    "accessToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastDownloadAt" TIMESTAMP(3),
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "report_exports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "schedule" JSONB NOT NULL DEFAULT '{}',
    "delivery" JSONB NOT NULL DEFAULT '[]',
    "exportOptions" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastRun" TIMESTAMP(3),
    "nextRun" TIMESTAMP(3),
    "runCount" INTEGER NOT NULL DEFAULT 0,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."scheduled_executions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "executionTime" INTEGER,
    "results" JSONB,
    "error" TEXT,
    "deliveryResults" JSONB,
    "scheduleId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "scheduled_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_shares" (
    "id" TEXT NOT NULL,
    "shareType" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "shareToken" TEXT,
    "publicUrl" TEXT,
    "message" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "lastAccessedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_share_recipients" (
    "id" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "permission" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'invited',
    "lastAccessedAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "shareId" TEXT NOT NULL,
    "recipientId" TEXT,

    CONSTRAINT "report_share_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_share_accesses" (
    "id" TEXT NOT NULL,
    "accessType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT,
    "duration" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "shareId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "report_share_accesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_comments" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorName" TEXT,
    "authorEmail" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "parentId" TEXT,
    "threadDepth" INTEGER NOT NULL DEFAULT 0,
    "isModerated" BOOLEAN NOT NULL DEFAULT false,
    "moderatedBy" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "reportId" TEXT NOT NULL,
    "shareId" TEXT,
    "userId" TEXT,

    CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."report_cache" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "lastHitAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "dataSize" INTEGER,
    "rowCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "report_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mobile_sessions" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pushToken" TEXT,
    "platform" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."mobile_analytics" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "screenSize" JSONB DEFAULT '{}',
    "appVersion" TEXT,
    "osVersion" TEXT,
    "networkType" TEXT,
    "duration" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "sessionId" TEXT,

    CONSTRAINT "mobile_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."push_notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "targetPlatform" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceTokens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "push_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."offline_actions" (
    "id" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT,
    "actionData" JSONB NOT NULL DEFAULT '{}',
    "uuid" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "conflictData" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "offline_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_assets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "category" TEXT,
    "filePath" TEXT,
    "fileUrl" TEXT,
    "fileSize" INTEGER,
    "format" TEXT,
    "resolution" TEXT,
    "duration" DOUBLE PRECISION,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'active',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "game_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_builds" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "buildType" TEXT NOT NULL DEFAULT 'Release',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "status" TEXT NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "progress" INTEGER,
    "downloadUrl" TEXT,
    "artifactSize" INTEGER,
    "queuePosition" INTEGER,
    "estimatedWaitTime" INTEGER,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "logs" JSONB NOT NULL DEFAULT '[]',
    "buildSettings" JSONB NOT NULL DEFAULT '{}',
    "configuration" JSONB NOT NULL DEFAULT '{}',
    "buildNumber" TEXT,
    "buildName" TEXT,
    "engineVersion" TEXT,
    "buildSize" INTEGER,
    "buildPath" TEXT,
    "buildUrl" TEXT,
    "cloudBuild" BOOLEAN NOT NULL DEFAULT false,
    "autoPublish" BOOLEAN NOT NULL DEFAULT false,
    "buildDuration" INTEGER,
    "buildLog" TEXT,
    "errorLog" TEXT,
    "warningLog" TEXT,
    "publishStatus" TEXT NOT NULL DEFAULT 'not_published',
    "publishedAt" TIMESTAMP(3),
    "publishUrl" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "game_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_rooms" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "maxPlayers" INTEGER NOT NULL DEFAULT 10,
    "currentPlayers" INTEGER NOT NULL DEFAULT 0,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "password" TEXT,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "gameSettings" JSONB NOT NULL DEFAULT '{}',
    "mapName" TEXT,
    "serverRegion" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hostId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "game_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_room_players" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'player',
    "team" TEXT,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "score" INTEGER NOT NULL DEFAULT 0,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,

    CONSTRAINT "game_room_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."matchmaking_queue" (
    "id" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "skillLevel" INTEGER NOT NULL DEFAULT 1000,
    "preferredRegion" TEXT,
    "maxWaitTime" INTEGER NOT NULL DEFAULT 300,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "priority" INTEGER NOT NULL DEFAULT 1,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "partySize" INTEGER NOT NULL DEFAULT 1,
    "partyMembers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "matchedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "estimatedWaitTime" INTEGER,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "roomId" TEXT,

    CONSTRAINT "matchmaking_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_matches" (
    "id" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "gameMode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'starting',
    "duration" INTEGER,
    "winner" TEXT,
    "finalScore" JSONB,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "mapName" TEXT,
    "serverRegion" TEXT,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalDeaths" INTEGER NOT NULL DEFAULT 0,
    "averageSkillLevel" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roomId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "game_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."game_match_players" (
    "id" TEXT NOT NULL,
    "team" TEXT,
    "finalPosition" INTEGER,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "skillBefore" INTEGER NOT NULL DEFAULT 1000,
    "skillAfter" INTEGER,
    "skillChange" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "userId" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,

    CONSTRAINT "game_match_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."code_generations" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "generatedCode" TEXT,
    "type" TEXT NOT NULL,
    "framework" TEXT,
    "language" TEXT NOT NULL,
    "aiProvider" TEXT,
    "model" TEXT,
    "tokensUsed" INTEGER,
    "generationTime" INTEGER,
    "complexity" TEXT,
    "files" JSONB NOT NULL DEFAULT '[]',
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "instructions" TEXT,
    "tests" TEXT,
    "documentation" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "quality" TEXT,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "validationResults" JSONB,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "userRating" INTEGER,
    "feedback" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "code_generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."visual_scripts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "nodeGraph" JSONB NOT NULL DEFAULT '{}',
    "compiledCode" TEXT,
    "scriptType" TEXT NOT NULL DEFAULT 'logic',
    "engine" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'C#',
    "nodeCount" INTEGER NOT NULL DEFAULT 0,
    "connectionCount" INTEGER NOT NULL DEFAULT 0,
    "complexity" TEXT NOT NULL DEFAULT 'simple',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "lastCompiled" TIMESTAMP(3),
    "compileErrors" JSONB,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "visual_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "analytics_reports_slug_key" ON "public"."analytics_reports"("slug");

-- CreateIndex
CREATE INDEX "analytics_reports_userId_category_idx" ON "public"."analytics_reports"("userId", "category");

-- CreateIndex
CREATE INDEX "analytics_reports_slug_isPublic_idx" ON "public"."analytics_reports"("slug", "isPublic");

-- CreateIndex
CREATE INDEX "analytics_reports_type_isActive_idx" ON "public"."analytics_reports"("type", "isActive");

-- CreateIndex
CREATE INDEX "report_executions_reportId_startedAt_idx" ON "public"."report_executions"("reportId", "startedAt");

-- CreateIndex
CREATE INDEX "report_executions_userId_status_idx" ON "public"."report_executions"("userId", "status");

-- CreateIndex
CREATE INDEX "report_executions_scheduleId_status_idx" ON "public"."report_executions"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "report_exports_reportId_format_idx" ON "public"."report_exports"("reportId", "format");

-- CreateIndex
CREATE INDEX "report_exports_userId_createdAt_idx" ON "public"."report_exports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "report_exports_status_expiresAt_idx" ON "public"."report_exports"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "report_schedules_reportId_isActive_idx" ON "public"."report_schedules"("reportId", "isActive");

-- CreateIndex
CREATE INDEX "report_schedules_userId_nextRun_idx" ON "public"."report_schedules"("userId", "nextRun");

-- CreateIndex
CREATE INDEX "report_schedules_isActive_nextRun_idx" ON "public"."report_schedules"("isActive", "nextRun");

-- CreateIndex
CREATE INDEX "scheduled_executions_scheduleId_startedAt_idx" ON "public"."scheduled_executions"("scheduleId", "startedAt");

-- CreateIndex
CREATE INDEX "scheduled_executions_status_startedAt_idx" ON "public"."scheduled_executions"("status", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "report_shares_shareToken_key" ON "public"."report_shares"("shareToken");

-- CreateIndex
CREATE INDEX "report_shares_reportId_isActive_idx" ON "public"."report_shares"("reportId", "isActive");

-- CreateIndex
CREATE INDEX "report_shares_sharedBy_shareType_idx" ON "public"."report_shares"("sharedBy", "shareType");

-- CreateIndex
CREATE INDEX "report_shares_shareToken_isActive_idx" ON "public"."report_shares"("shareToken", "isActive");

-- CreateIndex
CREATE INDEX "report_share_recipients_shareId_status_idx" ON "public"."report_share_recipients"("shareId", "status");

-- CreateIndex
CREATE INDEX "report_share_recipients_recipientId_status_idx" ON "public"."report_share_recipients"("recipientId", "status");

-- CreateIndex
CREATE INDEX "report_share_recipients_recipientEmail_status_idx" ON "public"."report_share_recipients"("recipientEmail", "status");

-- CreateIndex
CREATE INDEX "report_share_accesses_shareId_accessedAt_idx" ON "public"."report_share_accesses"("shareId", "accessedAt");

-- CreateIndex
CREATE INDEX "report_share_accesses_reportId_accessType_idx" ON "public"."report_share_accesses"("reportId", "accessType");

-- CreateIndex
CREATE INDEX "report_share_accesses_userId_accessedAt_idx" ON "public"."report_share_accesses"("userId", "accessedAt");

-- CreateIndex
CREATE INDEX "report_comments_reportId_isDeleted_idx" ON "public"."report_comments"("reportId", "isDeleted");

-- CreateIndex
CREATE INDEX "report_comments_shareId_isDeleted_idx" ON "public"."report_comments"("shareId", "isDeleted");

-- CreateIndex
CREATE INDEX "report_comments_userId_createdAt_idx" ON "public"."report_comments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "report_comments_parentId_threadDepth_idx" ON "public"."report_comments"("parentId", "threadDepth");

-- CreateIndex
CREATE UNIQUE INDEX "report_cache_cacheKey_key" ON "public"."report_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "report_cache_reportId_expiresAt_idx" ON "public"."report_cache"("reportId", "expiresAt");

-- CreateIndex
CREATE INDEX "report_cache_cacheKey_expiresAt_idx" ON "public"."report_cache"("cacheKey", "expiresAt");

-- CreateIndex
CREATE INDEX "report_cache_expiresAt_idx" ON "public"."report_cache"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_sessions_sessionToken_key" ON "public"."mobile_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "mobile_analytics_userId_timestamp_idx" ON "public"."mobile_analytics"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "mobile_analytics_event_platform_idx" ON "public"."mobile_analytics"("event", "platform");

-- CreateIndex
CREATE INDEX "push_notifications_userId_status_idx" ON "public"."push_notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "push_notifications_status_sentAt_idx" ON "public"."push_notifications"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "offline_actions_uuid_key" ON "public"."offline_actions"("uuid");

-- CreateIndex
CREATE INDEX "offline_actions_userId_status_idx" ON "public"."offline_actions"("userId", "status");

-- CreateIndex
CREATE INDEX "offline_actions_deviceId_status_idx" ON "public"."offline_actions"("deviceId", "status");

-- CreateIndex
CREATE INDEX "game_assets_userId_assetType_idx" ON "public"."game_assets"("userId", "assetType");

-- CreateIndex
CREATE INDEX "game_assets_projectId_assetType_idx" ON "public"."game_assets"("projectId", "assetType");

-- CreateIndex
CREATE INDEX "game_builds_userId_status_idx" ON "public"."game_builds"("userId", "status");

-- CreateIndex
CREATE INDEX "game_builds_projectId_status_idx" ON "public"."game_builds"("projectId", "status");

-- CreateIndex
CREATE INDEX "game_builds_status_queuedAt_idx" ON "public"."game_builds"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "game_builds_priority_queuedAt_idx" ON "public"."game_builds"("priority", "queuedAt");

-- CreateIndex
CREATE INDEX "game_rooms_status_gameMode_idx" ON "public"."game_rooms"("status", "gameMode");

-- CreateIndex
CREATE INDEX "game_rooms_hostId_status_idx" ON "public"."game_rooms"("hostId", "status");

-- CreateIndex
CREATE INDEX "game_rooms_projectId_status_idx" ON "public"."game_rooms"("projectId", "status");

-- CreateIndex
CREATE INDEX "game_rooms_serverRegion_gameMode_idx" ON "public"."game_rooms"("serverRegion", "gameMode");

-- CreateIndex
CREATE INDEX "game_room_players_roomId_status_idx" ON "public"."game_room_players"("roomId", "status");

-- CreateIndex
CREATE INDEX "game_room_players_userId_status_idx" ON "public"."game_room_players"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_room_players_userId_roomId_key" ON "public"."game_room_players"("userId", "roomId");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_gameMode_idx" ON "public"."matchmaking_queue"("status", "gameMode");

-- CreateIndex
CREATE INDEX "matchmaking_queue_skillLevel_gameMode_idx" ON "public"."matchmaking_queue"("skillLevel", "gameMode");

-- CreateIndex
CREATE INDEX "matchmaking_queue_queuedAt_status_idx" ON "public"."matchmaking_queue"("queuedAt", "status");

-- CreateIndex
CREATE INDEX "matchmaking_queue_userId_status_idx" ON "public"."matchmaking_queue"("userId", "status");

-- CreateIndex
CREATE INDEX "game_matches_status_matchType_idx" ON "public"."game_matches"("status", "matchType");

-- CreateIndex
CREATE INDEX "game_matches_gameMode_status_idx" ON "public"."game_matches"("gameMode", "status");

-- CreateIndex
CREATE INDEX "game_matches_startedAt_status_idx" ON "public"."game_matches"("startedAt", "status");

-- CreateIndex
CREATE INDEX "game_match_players_matchId_team_idx" ON "public"."game_match_players"("matchId", "team");

-- CreateIndex
CREATE INDEX "game_match_players_userId_skillAfter_idx" ON "public"."game_match_players"("userId", "skillAfter");

-- CreateIndex
CREATE UNIQUE INDEX "game_match_players_userId_matchId_key" ON "public"."game_match_players"("userId", "matchId");

-- CreateIndex
CREATE INDEX "code_generations_userId_createdAt_idx" ON "public"."code_generations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "code_generations_projectId_type_idx" ON "public"."code_generations"("projectId", "type");

-- CreateIndex
CREATE INDEX "code_generations_framework_language_idx" ON "public"."code_generations"("framework", "language");

-- CreateIndex
CREATE INDEX "visual_scripts_userId_createdAt_idx" ON "public"."visual_scripts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "visual_scripts_projectId_scriptType_idx" ON "public"."visual_scripts"("projectId", "scriptType");

-- CreateIndex
CREATE INDEX "visual_scripts_engine_language_idx" ON "public"."visual_scripts"("engine", "language");

-- AddForeignKey
ALTER TABLE "public"."analytics_reports" ADD CONSTRAINT "analytics_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_executions" ADD CONSTRAINT "report_executions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_executions" ADD CONSTRAINT "report_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_executions" ADD CONSTRAINT "report_executions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."report_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_exports" ADD CONSTRAINT "report_exports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_exports" ADD CONSTRAINT "report_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_schedules" ADD CONSTRAINT "report_schedules_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_schedules" ADD CONSTRAINT "report_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_executions" ADD CONSTRAINT "scheduled_executions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "public"."report_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_executions" ADD CONSTRAINT "scheduled_executions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."scheduled_executions" ADD CONSTRAINT "scheduled_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_shares" ADD CONSTRAINT "report_shares_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_shares" ADD CONSTRAINT "report_shares_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_share_recipients" ADD CONSTRAINT "report_share_recipients_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."report_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_share_recipients" ADD CONSTRAINT "report_share_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_share_accesses" ADD CONSTRAINT "report_share_accesses_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."report_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_share_accesses" ADD CONSTRAINT "report_share_accesses_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_share_accesses" ADD CONSTRAINT "report_share_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_comments" ADD CONSTRAINT "report_comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_comments" ADD CONSTRAINT "report_comments_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "public"."report_shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_comments" ADD CONSTRAINT "report_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_comments" ADD CONSTRAINT "report_comments_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_comments" ADD CONSTRAINT "report_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."report_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."report_cache" ADD CONSTRAINT "report_cache_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "public"."analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mobile_sessions" ADD CONSTRAINT "mobile_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."mobile_analytics" ADD CONSTRAINT "mobile_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."push_notifications" ADD CONSTRAINT "push_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."offline_actions" ADD CONSTRAINT "offline_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_assets" ADD CONSTRAINT "game_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_assets" ADD CONSTRAINT "game_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_builds" ADD CONSTRAINT "game_builds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_builds" ADD CONSTRAINT "game_builds_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_rooms" ADD CONSTRAINT "game_rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_rooms" ADD CONSTRAINT "game_rooms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_room_players" ADD CONSTRAINT "game_room_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_room_players" ADD CONSTRAINT "game_room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."game_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."game_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_matches" ADD CONSTRAINT "game_matches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "public"."game_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_matches" ADD CONSTRAINT "game_matches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_match_players" ADD CONSTRAINT "game_match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_match_players" ADD CONSTRAINT "game_match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "public"."game_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_generations" ADD CONSTRAINT "code_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_generations" ADD CONSTRAINT "code_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visual_scripts" ADD CONSTRAINT "visual_scripts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."visual_scripts" ADD CONSTRAINT "visual_scripts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
