-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "name" TEXT NOT NULL,
    "organization" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "subscription" TEXT NOT NULL DEFAULT 'free',
    "apiKey" TEXT,
    "refreshToken" TEXT,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'planning',
    "config" JSONB NOT NULL DEFAULT '{}',
    "structure" JSONB,
    "lastGenerated" TIMESTAMP(3),
    "generatedCodeMetadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "structure" JSONB NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "public" BOOLEAN NOT NULL DEFAULT false,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "originalTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_records" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,
    "agentId" TEXT,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."subscriptions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentMethodId" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoices" (
    "id" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payment_methods" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerId" TEXT NOT NULL,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."integrations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."api_keys" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimit" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."configurations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_settings" (
    "id" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT false,
    "weeklyReports" BOOLEAN NOT NULL DEFAULT true,
    "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."file_uploads" (
    "id" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimetype" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "url" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "file_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhooks" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" TEXT[],
    "secret" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastDelivery" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhook_deliveries" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "response" JSONB,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "webhookId" TEXT NOT NULL,

    CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."oauth_accounts" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "email" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_devices" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "pushToken" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sync_states" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "conflictData" JSONB,
    "syncStatus" TEXT NOT NULL DEFAULT 'synced',
    "deviceSyncMap" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "sync_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ai_provider_status" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "responseTime" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION,
    "lastCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uptime" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."usage_analytics" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "provider" TEXT,
    "tokens" INTEGER,
    "cost" DOUBLE PRECISION,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "deviceId" TEXT,
    "projectId" TEXT,

    CONSTRAINT "usage_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dodo_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "dodoSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dodo_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dodo_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "tokensUsed" INTEGER NOT NULL,
    "requestsMade" INTEGER NOT NULL,
    "aiProvider" TEXT NOT NULL,
    "featureUsed" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dodo_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dodo_charges" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "dodoChargeId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dodo_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dodo_webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'dodo_payments',
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "processingError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dodo_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."codebase_knowledge" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "repositoryUrl" TEXT,
    "type" TEXT NOT NULL DEFAULT 'project',
    "language" TEXT,
    "framework" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'private',
    "status" TEXT NOT NULL DEFAULT 'active',
    "totalFiles" INTEGER NOT NULL DEFAULT 0,
    "indexedFiles" INTEGER NOT NULL DEFAULT 0,
    "lastIndexedAt" TIMESTAMP(3),
    "processingMeta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "codebase_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."code_chunks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileExtension" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "startLine" INTEGER,
    "endLine" INTEGER,
    "functionName" TEXT,
    "className" TEXT,
    "methodName" TEXT,
    "variableName" TEXT,
    "complexity" TEXT,
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,
    "vectorId" TEXT,

    CONSTRAINT "code_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."vector_embeddings" (
    "id" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "embeddingModel" TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    "dimension" INTEGER NOT NULL DEFAULT 1536,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "contentHash" TEXT NOT NULL,
    "similarity" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "knowledgeBaseId" TEXT NOT NULL,
    "chunkId" TEXT,

    CONSTRAINT "vector_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."semantic_queries" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "queryType" TEXT NOT NULL DEFAULT 'search',
    "intent" TEXT,
    "language" TEXT,
    "framework" TEXT,
    "complexity" TEXT,
    "maxResults" INTEGER NOT NULL DEFAULT 10,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "processingTime" INTEGER,
    "totalResults" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT NOT NULL,

    CONSTRAINT "semantic_queries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."semantic_search_results" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "similarity" DOUBLE PRECISION NOT NULL,
    "relevanceScore" DOUBLE PRECISION,
    "contextWindow" TEXT,
    "explanation" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "queryId" TEXT NOT NULL,
    "chunkId" TEXT NOT NULL,
    "vectorId" TEXT NOT NULL,

    CONSTRAINT "semantic_search_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."embedding_cache" (
    "id" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" DOUBLE PRECISION[],
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "dimension" INTEGER NOT NULL,
    "hitCount" INTEGER NOT NULL DEFAULT 1,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "embedding_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rag_sessions" (
    "id" TEXT NOT NULL,
    "sessionType" TEXT NOT NULL DEFAULT 'chat',
    "context" JSONB NOT NULL DEFAULT '{}',
    "conversationId" TEXT,
    "totalQueries" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qualityScore" DOUBLE PRECISION,
    "feedback" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "knowledgeBaseId" TEXT,

    CONSTRAINT "rag_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rag_interactions" (
    "id" TEXT NOT NULL,
    "interactionType" TEXT NOT NULL,
    "input" TEXT,
    "output" TEXT,
    "tokensUsed" INTEGER,
    "cost" DOUBLE PRECISION,
    "latency" INTEGER,
    "provider" TEXT,
    "model" TEXT,
    "retrievedChunks" INTEGER NOT NULL DEFAULT 0,
    "relevanceScore" DOUBLE PRECISION,
    "userRating" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sessionId" TEXT NOT NULL,

    CONSTRAINT "rag_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backup_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "backupId" TEXT NOT NULL,
    "storageLocation" TEXT,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "databaseName" TEXT NOT NULL,
    "tableCount" INTEGER NOT NULL DEFAULT 0,
    "recordCount" INTEGER NOT NULL DEFAULT 0,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "checksum" TEXT,
    "compressionType" TEXT,
    "encryptionType" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "config" JSONB NOT NULL DEFAULT '{}',
    "retention" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."restore_jobs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "restoreType" TEXT NOT NULL DEFAULT 'full',
    "targetDatabase" TEXT,
    "dryRun" BOOLEAN NOT NULL DEFAULT false,
    "cleanFirst" BOOLEAN NOT NULL DEFAULT false,
    "skipConstraints" BOOLEAN NOT NULL DEFAULT false,
    "tablesToRestore" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pointInTime" TIMESTAMP(3),
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "completedSteps" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStep" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "errorMessage" TEXT,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restoredTables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "restoredRecords" INTEGER NOT NULL DEFAULT 0,
    "skippedTables" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "backupId" TEXT NOT NULL,
    "userId" TEXT,

    CONSTRAINT "restore_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backup_validations" (
    "id" TEXT NOT NULL,
    "validationType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "checksumValid" BOOLEAN,
    "integrityValid" BOOLEAN,
    "restoreValid" BOOLEAN,
    "structureValid" BOOLEAN,
    "testDatabase" TEXT,
    "validationSteps" JSONB NOT NULL DEFAULT '[]',
    "errors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "validationTime" INTEGER,
    "testDataSize" INTEGER,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "config" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "backupId" TEXT NOT NULL,

    CONSTRAINT "backup_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backup_schedules" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scheduleType" TEXT NOT NULL,
    "cronExpression" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "databaseName" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'local',
    "storageConfig" JSONB NOT NULL DEFAULT '{}',
    "compressionType" TEXT NOT NULL DEFAULT 'gzip',
    "encryptionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "retentionDaily" INTEGER NOT NULL DEFAULT 7,
    "retentionWeekly" INTEGER NOT NULL DEFAULT 4,
    "retentionMonthly" INTEGER NOT NULL DEFAULT 12,
    "lastRunAt" TIMESTAMP(3),
    "lastBackupId" TEXT,
    "nextRunAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notificationConfig" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backup_storage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "credentials" JSONB NOT NULL DEFAULT '{}',
    "bucket" TEXT,
    "region" TEXT,
    "endpoint" TEXT,
    "basePath" TEXT NOT NULL DEFAULT '/',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestAt" TIMESTAMP(3),
    "testStatus" TEXT,
    "testError" TEXT,
    "totalBackups" INTEGER NOT NULL DEFAULT 0,
    "totalSizeBytes" BIGINT NOT NULL DEFAULT 0,
    "availableBytes" BIGINT,
    "usedBytes" BIGINT NOT NULL DEFAULT 0,
    "encryptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "encryptionKey" TEXT,
    "accessLevel" TEXT NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_storage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."backup_access" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "permissions" TEXT[] DEFAULT ARRAY['read']::TEXT[],
    "databases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "operations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "maxBackups" INTEGER,
    "maxRestore" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "backup_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "themePreferences" JSONB DEFAULT '{}',
    "languagePreferences" JSONB DEFAULT '{}',
    "uiPreferences" JSONB DEFAULT '{}',
    "notificationPreferences" JSONB DEFAULT '{}',
    "privacyPreferences" JSONB DEFAULT '{}',
    "accessibilityPreferences" JSONB DEFAULT '{}',
    "developerPreferences" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."translations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "context" TEXT,
    "pluralRule" TEXT,
    "category" TEXT NOT NULL DEFAULT 'ui',
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "reviewerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."responsive_configs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "breakpoints" JSONB NOT NULL DEFAULT '{}',
    "gridColumns" JSONB NOT NULL DEFAULT '{}',
    "gridGutters" JSONB NOT NULL DEFAULT '{}',
    "typographyScale" JSONB NOT NULL DEFAULT '{}',
    "spacingScale" JSONB NOT NULL DEFAULT '{}',
    "componentRules" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responsive_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."device_analytics" (
    "id" TEXT NOT NULL,
    "deviceType" TEXT NOT NULL,
    "screenWidth" INTEGER,
    "screenHeight" INTEGER,
    "viewportWidth" INTEGER,
    "viewportHeight" INTEGER,
    "pixelRatio" DOUBLE PRECISION DEFAULT 1.0,
    "userAgent" TEXT,
    "browserName" TEXT,
    "browserVersion" TEXT,
    "platform" TEXT,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "pageUrl" TEXT,
    "component" TEXT,
    "loadTime" INTEGER,
    "renderTime" INTEGER,
    "interactionTime" INTEGER,
    "breakpointUsed" TEXT,
    "layoutShifts" INTEGER DEFAULT 0,
    "scrollDepth" DOUBLE PRECISION,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "domain" TEXT,
    "customDomain" TEXT,
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "settings" TEXT NOT NULL,
    "branding" TEXT NOT NULL,
    "limits" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "permissions" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tenant_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'custom',
    "permissions" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_apiKey_key" ON "public"."users"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_key" ON "public"."configurations"("key");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_key" ON "public"."notification_settings"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerId_key" ON "public"."oauth_accounts"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_deviceId_key" ON "public"."user_devices"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_userId_dataType_key" ON "public"."sync_states"("userId", "dataType");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_status_provider_key" ON "public"."ai_provider_status"("provider");

-- CreateIndex
CREATE INDEX "usage_analytics_userId_timestamp_idx" ON "public"."usage_analytics"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_analytics_platform_timestamp_idx" ON "public"."usage_analytics"("platform", "timestamp");

-- CreateIndex
CREATE INDEX "usage_analytics_provider_timestamp_idx" ON "public"."usage_analytics"("provider", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "dodo_subscriptions_dodoSubscriptionId_key" ON "public"."dodo_subscriptions"("dodoSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "dodo_charges_dodoChargeId_key" ON "public"."dodo_charges"("dodoChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "code_chunks_vectorId_key" ON "public"."code_chunks"("vectorId");

-- CreateIndex
CREATE INDEX "code_chunks_knowledgeBaseId_language_idx" ON "public"."code_chunks"("knowledgeBaseId", "language");

-- CreateIndex
CREATE INDEX "code_chunks_contentType_language_idx" ON "public"."code_chunks"("contentType", "language");

-- CreateIndex
CREATE INDEX "code_chunks_filePath_idx" ON "public"."code_chunks"("filePath");

-- CreateIndex
CREATE UNIQUE INDEX "vector_embeddings_chunkId_key" ON "public"."vector_embeddings"("chunkId");

-- CreateIndex
CREATE INDEX "vector_embeddings_knowledgeBaseId_idx" ON "public"."vector_embeddings"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "vector_embeddings_contentHash_idx" ON "public"."vector_embeddings"("contentHash");

-- CreateIndex
CREATE INDEX "semantic_queries_userId_createdAt_idx" ON "public"."semantic_queries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "semantic_queries_knowledgeBaseId_queryType_idx" ON "public"."semantic_queries"("knowledgeBaseId", "queryType");

-- CreateIndex
CREATE INDEX "semantic_search_results_queryId_rank_idx" ON "public"."semantic_search_results"("queryId", "rank");

-- CreateIndex
CREATE INDEX "semantic_search_results_similarity_idx" ON "public"."semantic_search_results"("similarity");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_cache_contentHash_key" ON "public"."embedding_cache"("contentHash");

-- CreateIndex
CREATE INDEX "embedding_cache_contentHash_idx" ON "public"."embedding_cache"("contentHash");

-- CreateIndex
CREATE INDEX "embedding_cache_model_provider_idx" ON "public"."embedding_cache"("model", "provider");

-- CreateIndex
CREATE INDEX "rag_sessions_userId_isActive_idx" ON "public"."rag_sessions"("userId", "isActive");

-- CreateIndex
CREATE INDEX "rag_interactions_sessionId_createdAt_idx" ON "public"."rag_interactions"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "backup_jobs_backupId_key" ON "public"."backup_jobs"("backupId");

-- CreateIndex
CREATE INDEX "backup_jobs_status_createdAt_idx" ON "public"."backup_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "backup_jobs_type_status_idx" ON "public"."backup_jobs"("type", "status");

-- CreateIndex
CREATE INDEX "backup_jobs_databaseName_createdAt_idx" ON "public"."backup_jobs"("databaseName", "createdAt");

-- CreateIndex
CREATE INDEX "restore_jobs_status_createdAt_idx" ON "public"."restore_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "restore_jobs_backupId_createdAt_idx" ON "public"."restore_jobs"("backupId", "createdAt");

-- CreateIndex
CREATE INDEX "backup_validations_backupId_validationType_idx" ON "public"."backup_validations"("backupId", "validationType");

-- CreateIndex
CREATE INDEX "backup_validations_status_createdAt_idx" ON "public"."backup_validations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "backup_schedules_isActive_nextRunAt_idx" ON "public"."backup_schedules"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "backup_schedules_databaseName_scheduleType_idx" ON "public"."backup_schedules"("databaseName", "scheduleType");

-- CreateIndex
CREATE INDEX "backup_storage_provider_isActive_idx" ON "public"."backup_storage"("provider", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "backup_storage_provider_bucket_basePath_key" ON "public"."backup_storage"("provider", "bucket", "basePath");

-- CreateIndex
CREATE UNIQUE INDEX "backup_access_userId_key" ON "public"."backup_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "public"."user_preferences"("userId");

-- CreateIndex
CREATE INDEX "translations_locale_category_idx" ON "public"."translations"("locale", "category");

-- CreateIndex
CREATE INDEX "translations_key_approved_idx" ON "public"."translations"("key", "approved");

-- CreateIndex
CREATE UNIQUE INDEX "translations_key_locale_key" ON "public"."translations"("key", "locale");

-- CreateIndex
CREATE INDEX "responsive_configs_isDefault_isActive_idx" ON "public"."responsive_configs"("isDefault", "isActive");

-- CreateIndex
CREATE INDEX "device_analytics_deviceType_timestamp_idx" ON "public"."device_analytics"("deviceType", "timestamp");

-- CreateIndex
CREATE INDEX "device_analytics_userId_timestamp_idx" ON "public"."device_analytics"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "device_analytics_sessionId_timestamp_idx" ON "public"."device_analytics"("sessionId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "public"."tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "public"."tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "public"."tenants"("customDomain");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenantId_email_key" ON "public"."tenant_users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "tenant_usage_tenantId_date_idx" ON "public"."tenant_usage"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_tenantId_metric_date_key" ON "public"."tenant_usage"("tenantId", "metric", "date");

-- CreateIndex
CREATE INDEX "roles_type_isActive_idx" ON "public"."roles"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_tenantId_key" ON "public"."roles"("name", "tenantId");

-- CreateIndex
CREATE INDEX "user_roles_userId_tenantId_idx" ON "public"."user_roles"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_tenantId_key" ON "public"."user_roles"("userId", "roleId", "tenantId");

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."projects" ADD CONSTRAINT "projects_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "public"."templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."templates" ADD CONSTRAINT "templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."agents" ADD CONSTRAINT "agents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_records" ADD CONSTRAINT "usage_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_records" ADD CONSTRAINT "usage_records_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "public"."agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscriptions" ADD CONSTRAINT "subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "public"."payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."integrations" ADD CONSTRAINT "integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."file_uploads" ADD CONSTRAINT "file_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."webhooks" ADD CONSTRAINT "webhooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "public"."webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sync_states" ADD CONSTRAINT "sync_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_analytics" ADD CONSTRAINT "usage_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_analytics" ADD CONSTRAINT "usage_analytics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dodo_subscriptions" ADD CONSTRAINT "dodo_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dodo_usage" ADD CONSTRAINT "dodo_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dodo_usage" ADD CONSTRAINT "dodo_usage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."dodo_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dodo_charges" ADD CONSTRAINT "dodo_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "public"."dodo_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."codebase_knowledge" ADD CONSTRAINT "codebase_knowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."codebase_knowledge" ADD CONSTRAINT "codebase_knowledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_chunks" ADD CONSTRAINT "code_chunks_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."code_chunks" ADD CONSTRAINT "code_chunks_vectorId_fkey" FOREIGN KEY ("vectorId") REFERENCES "public"."vector_embeddings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."vector_embeddings" ADD CONSTRAINT "vector_embeddings_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."semantic_queries" ADD CONSTRAINT "semantic_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."semantic_queries" ADD CONSTRAINT "semantic_queries_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."semantic_search_results" ADD CONSTRAINT "semantic_search_results_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "public"."semantic_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."semantic_search_results" ADD CONSTRAINT "semantic_search_results_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "public"."code_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."semantic_search_results" ADD CONSTRAINT "semantic_search_results_vectorId_fkey" FOREIGN KEY ("vectorId") REFERENCES "public"."vector_embeddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rag_sessions" ADD CONSTRAINT "rag_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rag_sessions" ADD CONSTRAINT "rag_sessions_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "public"."codebase_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rag_interactions" ADD CONSTRAINT "rag_interactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."rag_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."restore_jobs" ADD CONSTRAINT "restore_jobs_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "public"."backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."restore_jobs" ADD CONSTRAINT "restore_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."backup_validations" ADD CONSTRAINT "backup_validations_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "public"."backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."backup_access" ADD CONSTRAINT "backup_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."translations" ADD CONSTRAINT "translations_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_users" ADD CONSTRAINT "tenant_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tenant_usage" ADD CONSTRAINT "tenant_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
