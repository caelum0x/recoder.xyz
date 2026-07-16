-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
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
CREATE TABLE "ai_generated_projects" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framework" TEXT NOT NULL,
    "files" JSONB NOT NULL DEFAULT '[]',
    "chat" JSONB NOT NULL DEFAULT '[]',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "previewUrl" TEXT,
    "deployUrl" TEXT,
    "stars" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "forks" INTEGER NOT NULL DEFAULT 0,
    "lastSavedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_generated_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_provider_status" (
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
CREATE TABLE "analytics_reports" (
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
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rateLimit" JSONB NOT NULL DEFAULT '{}',
    "rateLimitDaily" INTEGER,
    "rateLimitMonthly" INTEGER,
    "sessionId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'web',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
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
CREATE TABLE "backup_access" (
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
CREATE TABLE "backup_jobs" (
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
CREATE TABLE "backup_schedules" (
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
CREATE TABLE "backup_storage" (
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
CREATE TABLE "backup_validations" (
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
CREATE TABLE "batch_executions" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "requestCount" INTEGER NOT NULL,
    "processingTime" INTEGER NOT NULL,
    "costSavings" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "batch_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maxWaitTime" INTEGER NOT NULL,
    "similarityThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "batchId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "batch_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blockchain_networks" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "rpcUrl" TEXT NOT NULL,
    "wsUrl" TEXT,
    "explorerUrl" TEXT NOT NULL,
    "explorerApiUrl" TEXT,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 18,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "isMainnet" BOOLEAN NOT NULL DEFAULT false,
    "gasPrice" BIGINT,
    "gasLimit" BIGINT,
    "maxFeePerGas" BIGINT,
    "maxPriorityFee" BIGINT,
    "supportsEIP1559" BOOLEAN NOT NULL DEFAULT false,
    "supportsContracts" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastChecked" TIMESTAMP(3),
    "blockHeight" BIGINT,
    "description" TEXT,
    "website" TEXT,
    "documentation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "blockchain_networks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT,
    "scope" TEXT,
    "state" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceCode" (
    "id" TEXT NOT NULL,
    "deviceCode" TEXT NOT NULL,
    "userCode" TEXT NOT NULL,
    "clientId" TEXT NOT NULL DEFAULT 'recoder-cli',
    "scope" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT,
    "deviceName" TEXT,
    "deviceType" TEXT NOT NULL DEFAULT 'cli',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "platformData" JSONB,

    CONSTRAINT "cli_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_usage" (
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

-- CreateTable
CREATE TABLE "code_chunks" (
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
CREATE TABLE "code_generations" (
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
CREATE TABLE "codebase_knowledge" (
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
CREATE TABLE "compilation_results" (
    "id" TEXT NOT NULL,
    "solcVersion" TEXT NOT NULL,
    "evmVersion" TEXT NOT NULL,
    "optimizationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "optimizationRuns" INTEGER NOT NULL DEFAULT 200,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errors" JSONB NOT NULL DEFAULT '[]',
    "abi" JSONB,
    "bytecode" TEXT,
    "deployedBytecode" TEXT,
    "sourceMap" TEXT,
    "gasEstimates" JSONB,
    "devdoc" JSONB,
    "userdoc" JSONB,
    "compilationTime" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "compilation_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "code" TEXT NOT NULL,
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "quality" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "component_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configurations" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_dependencies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "importPath" TEXT NOT NULL,
    "version" TEXT,
    "dependencyType" TEXT NOT NULL,
    "isDevDependency" BOOLEAN NOT NULL DEFAULT false,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "resolvedPath" TEXT,
    "contentHash" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "contractId" TEXT NOT NULL,

    CONSTRAINT "contract_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_deployments" (
    "id" TEXT NOT NULL,
    "contractAddress" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockTimestamp" TIMESTAMP(3) NOT NULL,
    "deployerAddress" TEXT NOT NULL,
    "constructorArgs" JSONB NOT NULL DEFAULT '[]',
    "gasUsed" BIGINT,
    "gasPrice" BIGINT,
    "deploymentCost" TEXT,
    "contractName" TEXT NOT NULL,
    "contractVersion" TEXT,
    "verificationStatus" TEXT NOT NULL DEFAULT 'unverified',
    "verificationDate" TIMESTAMP(3),
    "networkName" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isTestnet" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastInteraction" TIMESTAMP(3),
    "isUpgradeable" BOOLEAN NOT NULL DEFAULT false,
    "proxyAddress" TEXT,
    "implementationAddress" TEXT,
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "deploymentNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "networkId" TEXT NOT NULL,
    "deployedBy" TEXT NOT NULL,
    "solidityProjectId" TEXT,

    CONSTRAINT "contract_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_analytics" (
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
CREATE TABLE "dodo_charges" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "dodoChargeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "dodo_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dodo_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "dodoSubscriptionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "lastPaymentAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "dodo_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dodo_usage" (
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
CREATE TABLE "dodo_webhook_events" (
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
CREATE TABLE "embedding_cache" (
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
CREATE TABLE "file_uploads" (
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
CREATE TABLE "game_analytics_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "category" TEXT,
    "eventData" JSONB NOT NULL DEFAULT '{}',
    "properties" JSONB NOT NULL DEFAULT '{}',
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "sessionId" TEXT,
    "userId" TEXT,
    "projectId" TEXT,
    "gameVersion" TEXT,
    "platform" TEXT,
    "deviceInfo" JSONB DEFAULT '{}',
    "level" TEXT,
    "position" JSONB,
    "serverRegion" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "localTimestamp" TIMESTAMP(3),
    "sessionTime" INTEGER,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "batchId" TEXT,

    CONSTRAINT "game_analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_assets" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "game_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_builds" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "game_builds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_match_players" (
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
CREATE TABLE "game_matches" (
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
CREATE TABLE "game_room_players" (
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
CREATE TABLE "game_rooms" (
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
CREATE TABLE "game_sessions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT,
    "projectId" TEXT,
    "gameVersion" TEXT,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "levelsPlayed" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "totalScore" INTEGER NOT NULL DEFAULT 0,
    "coinsEarned" INTEGER NOT NULL DEFAULT 0,
    "coinsSpent" INTEGER NOT NULL DEFAULT 0,
    "itemsPurchased" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "avgFrameRate" DOUBLE PRECISION,
    "avgLoadTime" DOUBLE PRECISION,
    "crashCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "ipAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "serverRegion" TEXT,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integrations" (
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
CREATE TABLE "invoices" (
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
CREATE TABLE "matchmaking_queue" (
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
CREATE TABLE "mobile_analytics" (
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
CREATE TABLE "mobile_sessions" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "mobile_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_settings" (
    "id" TEXT NOT NULL,
    "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
    "pushNotifications" BOOLEAN NOT NULL DEFAULT false,
    "weeklyReports" BOOLEAN NOT NULL DEFAULT true,
    "securityAlerts" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "notification_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "actionUrl" TEXT,
    "actionText" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
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
CREATE TABLE "offline_actions" (
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
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "paymentType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dodoCheckoutId" TEXT,
    "frontend" TEXT NOT NULL DEFAULT 'web',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_methods" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerId" TEXT NOT NULL,
    "providerToken" TEXT,
    "brand" TEXT,
    "last4" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "holderName" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "keyName" TEXT,
    "encryptedKey" TEXT NOT NULL,
    "keyEncrypted" TEXT,
    "keyPrefix" TEXT,
    "quotaUsed" INTEGER DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "deviceInfo" JSONB NOT NULL DEFAULT '{}',
    "version" TEXT NOT NULL DEFAULT 'unknown',
    "environment" TEXT NOT NULL DEFAULT 'unknown',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_collaborators" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "project_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_comments" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "lineNumber" INTEGER,
    "filePath" TEXT,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_shares" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
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
    "configuration" JSONB DEFAULT '{}',
    "framework" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT,
    "metadata" JSONB DEFAULT '{}',
    "projectPath" TEXT,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_cache" (
    "id" TEXT NOT NULL,
    "promptHash" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "response" JSONB NOT NULL,
    "model" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "parameters" JSONB NOT NULL DEFAULT '{}',
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokens" INTEGER NOT NULL DEFAULT 0,
    "quality" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "prompt_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_notifications" (
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
CREATE TABLE "rag_interactions" (
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
CREATE TABLE "rag_sessions" (
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
CREATE TABLE "remote_assistance" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sessionData" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "url" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "remote_assistance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_cache" (
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
CREATE TABLE "report_comments" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),
    "reportId" TEXT NOT NULL,
    "shareId" TEXT,
    "userId" TEXT,

    CONSTRAINT "report_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_executions" (
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
CREATE TABLE "report_exports" (
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
CREATE TABLE "report_schedules" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_share_accesses" (
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
CREATE TABLE "report_share_recipients" (
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
CREATE TABLE "report_shares" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reportId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsive_configs" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsive_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restore_jobs" (
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
CREATE TABLE "roles" (
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
CREATE TABLE "scheduled_executions" (
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
CREATE TABLE "semantic_queries" (
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
CREATE TABLE "semantic_search_results" (
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
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "location" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "smart_contracts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "sourceCode" TEXT NOT NULL,
    "abi" JSONB,
    "bytecode" TEXT,
    "metadata" JSONB,
    "contractType" TEXT NOT NULL DEFAULT 'contract',
    "isAbstract" BOOLEAN NOT NULL DEFAULT false,
    "isInterface" BOOLEAN NOT NULL DEFAULT false,
    "isLibrary" BOOLEAN NOT NULL DEFAULT false,
    "compiled" BOOLEAN NOT NULL DEFAULT false,
    "compilationError" TEXT,
    "lastCompiledAt" TIMESTAMP(3),
    "securityWarnings" JSONB NOT NULL DEFAULT '[]',
    "gasEstimations" JSONB,
    "importDependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "changelog" JSONB NOT NULL DEFAULT '[]',
    "description" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "solidityProjectId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "smart_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solidity_projects" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "solcVersion" TEXT NOT NULL DEFAULT '0.8.24',
    "evmVersion" TEXT NOT NULL DEFAULT 'london',
    "optimization" BOOLEAN NOT NULL DEFAULT true,
    "optimizationRuns" INTEGER NOT NULL DEFAULT 200,
    "sourceDirectory" TEXT NOT NULL DEFAULT 'contracts/',
    "outputDirectory" TEXT NOT NULL DEFAULT 'artifacts/',
    "testDirectory" TEXT NOT NULL DEFAULT 'test/',
    "deployDirectory" TEXT NOT NULL DEFAULT 'scripts/deploy/',
    "dependencies" JSONB NOT NULL DEFAULT '{}',
    "devDependencies" JSONB NOT NULL DEFAULT '{}',
    "remappings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hardhatConfig" JSONB,
    "truffleConfig" JSONB,
    "foundryConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solidity_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_features" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plan_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plan_limits" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "monthlyRequests" INTEGER NOT NULL DEFAULT 0,
    "dailyRequests" INTEGER NOT NULL DEFAULT 0,
    "tokensPerRequest" INTEGER NOT NULL DEFAULT 1000,
    "modelsAvailable" JSONB NOT NULL DEFAULT '[]',
    "features" JSONB NOT NULL DEFAULT '[]',
    "costLimitUSD" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plan_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT NOT NULL DEFAULT 'month',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "dodoProductId" TEXT,
    "stripeProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "paymentMethodId" TEXT,
    "planId" TEXT NOT NULL,
    "provider" TEXT,
    "providerId" TEXT,
    "amount" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "interval" TEXT,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_states" (
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
CREATE TABLE "templates" (
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
CREATE TABLE "tenant_usage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_users" (
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
CREATE TABLE "tenants" (
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
CREATE TABLE "translations" (
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
CREATE TABLE "unreal_asset_references" (
    "id" TEXT NOT NULL,
    "unrealProjectId" TEXT NOT NULL,
    "assetPath" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "assetType" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "fileName" TEXT,
    "fileExtension" TEXT,
    "fileSize" INTEGER,
    "filePath" TEXT,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "dependencies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "referencedBy" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sourceFilePath" TEXT,
    "importSettings" JSONB,
    "importedAt" TIMESTAMP(3),
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3),
    "isUsed" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "subcategory" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "checksum" TEXT,
    "thumbnailPath" TEXT,
    "previewData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unreal_asset_references_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unreal_blueprint_nodes" (
    "id" TEXT NOT NULL,
    "unrealProjectId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeClass" TEXT NOT NULL,
    "nodeName" TEXT NOT NULL,
    "blueprintPath" TEXT NOT NULL,
    "blueprintName" TEXT NOT NULL,
    "blueprintType" TEXT NOT NULL,
    "positionX" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "positionY" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sizeX" DOUBLE PRECISION NOT NULL DEFAULT 150,
    "sizeY" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "inputPins" JSONB NOT NULL DEFAULT '[]',
    "outputPins" JSONB NOT NULL DEFAULT '[]',
    "connections" JSONB NOT NULL DEFAULT '[]',
    "functionName" TEXT,
    "eventType" TEXT,
    "variableName" TEXT,
    "variableType" TEXT,
    "executionOrder" INTEGER,
    "isEntryPoint" BOOLEAN NOT NULL DEFAULT false,
    "isExitPoint" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,
    "tooltip" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "nodeGuid" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unreal_blueprint_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unreal_build_configs" (
    "id" TEXT NOT NULL,
    "unrealProjectId" TEXT NOT NULL,
    "configName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "architecture" TEXT NOT NULL DEFAULT 'x64',
    "optimizationLevel" TEXT NOT NULL DEFAULT 'Default',
    "debugInfo" BOOLEAN NOT NULL DEFAULT true,
    "staticAnalysis" BOOLEAN NOT NULL DEFAULT false,
    "unityBuild" BOOLEAN NOT NULL DEFAULT true,
    "enabledPlugins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "disabledPlugins" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "engineFeatures" JSONB NOT NULL DEFAULT '{}',
    "pakFiles" BOOLEAN NOT NULL DEFAULT true,
    "compression" TEXT NOT NULL DEFAULT 'Default',
    "chunkInstall" BOOLEAN NOT NULL DEFAULT false,
    "deploymentTarget" TEXT,
    "signingCertificate" TEXT,
    "provisioningProfile" TEXT,
    "preBuildSteps" JSONB NOT NULL DEFAULT '[]',
    "postBuildSteps" JSONB NOT NULL DEFAULT '[]',
    "customCommands" JSONB NOT NULL DEFAULT '[]',
    "outputPath" TEXT,
    "artifactNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "artifactSizes" JSONB,
    "lastBuildTime" TIMESTAMP(3),
    "buildDuration" INTEGER,
    "buildStatus" TEXT NOT NULL DEFAULT 'never_built',
    "buildLog" TEXT,
    "buildErrors" JSONB,
    "maxParallelJobs" INTEGER NOT NULL DEFAULT 0,
    "memoryPerJob" INTEGER NOT NULL DEFAULT 2048,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unreal_build_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "unreal_projects" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL DEFAULT '5.3',
    "projectVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "targetPlatforms" TEXT[] DEFAULT ARRAY['Windows']::TEXT[],
    "rayTracingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lumenEnabled" BOOLEAN NOT NULL DEFAULT true,
    "naniteEnabled" BOOLEAN NOT NULL DEFAULT true,
    "virtualShadowMaps" BOOLEAN NOT NULL DEFAULT true,
    "worldPartition" BOOLEAN NOT NULL DEFAULT false,
    "projectPath" TEXT,
    "uprojectPath" TEXT,
    "sourceCodePath" TEXT,
    "contentPath" TEXT,
    "configPath" TEXT,
    "cppSupport" BOOLEAN NOT NULL DEFAULT false,
    "moduleName" TEXT,
    "apiMacro" TEXT,
    "blueprintCount" INTEGER NOT NULL DEFAULT 0,
    "widgetCount" INTEGER NOT NULL DEFAULT 0,
    "animBlueprintCount" INTEGER NOT NULL DEFAULT 0,
    "staticMeshCount" INTEGER NOT NULL DEFAULT 0,
    "materialCount" INTEGER NOT NULL DEFAULT 0,
    "textureCount" INTEGER NOT NULL DEFAULT 0,
    "audioCount" INTEGER NOT NULL DEFAULT 0,
    "buildConfiguration" JSONB NOT NULL DEFAULT '{}',
    "targetRules" JSONB NOT NULL DEFAULT '{}',
    "buildSettings" JSONB NOT NULL DEFAULT '{}',
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "unreal_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_analytics" (
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
CREATE TABLE "usage_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION,
    "duration" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT,
    "projectId" TEXT,
    "tokens" INTEGER,
    "tokensUsed" INTEGER,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "type" TEXT NOT NULL,
    "requestType" TEXT,
    "model" TEXT,
    "platform" TEXT,
    "provider" TEXT,
    "requestCount" INTEGER,
    "isPriceyModel" BOOLEAN,
    "errorMessage" TEXT,

    CONSTRAINT "usage_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_api_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT,
    "keyPrefix" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
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
    "lastSeenAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "model" TEXT,
    "notificationPreferences" JSONB DEFAULT '{}',
    "version" TEXT,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
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
CREATE TABLE "user_pricing_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "baseAmount" DOUBLE PRECISION NOT NULL,
    "processingFees" DOUBLE PRECISION NOT NULL,
    "taxAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "usageData" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_pricing_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "tenantId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "assignedBy" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    "image" TEXT,
    "password" TEXT,
    "apiKey" TEXT,
    "backupCodes" TEXT,
    "backupCodesTemp" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "organization" TEXT,
    "refreshToken" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "subscription" TEXT NOT NULL DEFAULT 'free',
    "subscriptionPlan" TEXT DEFAULT 'free',
    "subscriptionStatus" TEXT DEFAULT 'active',
    "subscriptionId" TEXT,
    "subscriptionEndDate" TIMESTAMP(3),
    "subscriptionCancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "cancelFeedback" TEXT,
    "hasOwnApiKey" BOOLEAN NOT NULL DEFAULT false,
    "openRouterApiKey" TEXT,
    "apiKeyEncrypted" TEXT,
    "lastPaymentDate" TIMESTAMP(3),
    "lastPaymentAmount" DOUBLE PRECISION,
    "paymentStatus" TEXT,
    "plan" TEXT,
    "onboardingStep" TEXT,
    "preferredModels" JSONB,
    "totpSecret" TEXT,
    "totpSecretTemp" TEXT,
    "twoFactorEnabledAt" TIMESTAMP(3),
    "twoFactorSetupAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_quota" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionsPerDay" INTEGER NOT NULL DEFAULT 5,
    "sessionsUsedToday" INTEGER NOT NULL DEFAULT 0,
    "tokensPerSession" INTEGER NOT NULL DEFAULT 10000,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "lastResetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestsLimit" INTEGER NOT NULL DEFAULT 1000,
    "requestsUsed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_quota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vector_embeddings" (
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
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_scripts" (
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
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "visual_scripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_deliveries" (
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
CREATE TABLE "webhook_events" (
    "id" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhooks" (
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
CREATE TABLE "MCPServer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "env" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MCPServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCPToolCall" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MCPToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousId" TEXT,
    "urlId" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "artifactId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "totalMessages" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3),
    "projectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generated_projects_sessionId_key" ON "ai_generated_projects"("sessionId");

-- CreateIndex
CREATE INDEX "ai_generated_projects_createdAt_idx" ON "ai_generated_projects"("createdAt");

-- CreateIndex
CREATE INDEX "ai_generated_projects_framework_idx" ON "ai_generated_projects"("framework");

-- CreateIndex
CREATE INDEX "ai_generated_projects_isPublic_stars_idx" ON "ai_generated_projects"("isPublic", "stars");

-- CreateIndex
CREATE INDEX "ai_generated_projects_userId_idx" ON "ai_generated_projects"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_provider_status_provider_key" ON "ai_provider_status"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "analytics_reports_slug_key" ON "analytics_reports"("slug");

-- CreateIndex
CREATE INDEX "analytics_reports_slug_isPublic_idx" ON "analytics_reports"("slug", "isPublic");

-- CreateIndex
CREATE INDEX "analytics_reports_type_isActive_idx" ON "analytics_reports"("type", "isActive");

-- CreateIndex
CREATE INDEX "analytics_reports_userId_category_idx" ON "analytics_reports"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE UNIQUE INDEX "backup_access_userId_key" ON "backup_access"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "backup_jobs_backupId_key" ON "backup_jobs"("backupId");

-- CreateIndex
CREATE INDEX "backup_jobs_databaseName_createdAt_idx" ON "backup_jobs"("databaseName", "createdAt");

-- CreateIndex
CREATE INDEX "backup_jobs_status_createdAt_idx" ON "backup_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "backup_jobs_type_status_idx" ON "backup_jobs"("type", "status");

-- CreateIndex
CREATE INDEX "backup_schedules_databaseName_scheduleType_idx" ON "backup_schedules"("databaseName", "scheduleType");

-- CreateIndex
CREATE INDEX "backup_schedules_isActive_nextRunAt_idx" ON "backup_schedules"("isActive", "nextRunAt");

-- CreateIndex
CREATE INDEX "backup_storage_provider_isActive_idx" ON "backup_storage"("provider", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "backup_storage_provider_bucket_basePath_key" ON "backup_storage"("provider", "bucket", "basePath");

-- CreateIndex
CREATE INDEX "backup_validations_backupId_validationType_idx" ON "backup_validations"("backupId", "validationType");

-- CreateIndex
CREATE INDEX "backup_validations_status_createdAt_idx" ON "backup_validations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "batch_executions_completedAt_idx" ON "batch_executions"("completedAt");

-- CreateIndex
CREATE INDEX "batch_executions_createdAt_idx" ON "batch_executions"("createdAt");

-- CreateIndex
CREATE INDEX "batch_executions_status_idx" ON "batch_executions"("status");

-- CreateIndex
CREATE INDEX "batch_executions_type_idx" ON "batch_executions"("type");

-- CreateIndex
CREATE INDEX "batch_requests_batchId_idx" ON "batch_requests"("batchId");

-- CreateIndex
CREATE INDEX "batch_requests_status_idx" ON "batch_requests"("status");

-- CreateIndex
CREATE INDEX "batch_requests_timestamp_idx" ON "batch_requests"("timestamp");

-- CreateIndex
CREATE INDEX "batch_requests_type_idx" ON "batch_requests"("type");

-- CreateIndex
CREATE INDEX "batch_requests_userId_idx" ON "batch_requests"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_networks_chainId_key" ON "blockchain_networks"("chainId");

-- CreateIndex
CREATE INDEX "blockchain_networks_chainId_isActive_idx" ON "blockchain_networks"("chainId", "isActive");

-- CreateIndex
CREATE INDEX "blockchain_networks_isMainnet_isTestnet_idx" ON "blockchain_networks"("isMainnet", "isTestnet");

-- CreateIndex
CREATE UNIQUE INDEX "AuthCode_code_key" ON "AuthCode"("code");

-- CreateIndex
CREATE INDEX "AuthCode_code_idx" ON "AuthCode"("code");

-- CreateIndex
CREATE INDEX "AuthCode_userId_idx" ON "AuthCode"("userId");

-- CreateIndex
CREATE INDEX "AuthCode_expiresAt_idx" ON "AuthCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCode_deviceCode_key" ON "DeviceCode"("deviceCode");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceCode_userCode_key" ON "DeviceCode"("userCode");

-- CreateIndex
CREATE INDEX "DeviceCode_deviceCode_idx" ON "DeviceCode"("deviceCode");

-- CreateIndex
CREATE INDEX "DeviceCode_userCode_idx" ON "DeviceCode"("userCode");

-- CreateIndex
CREATE INDEX "DeviceCode_status_idx" ON "DeviceCode"("status");

-- CreateIndex
CREATE INDEX "DeviceCode_expiresAt_idx" ON "DeviceCode"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_accessToken_key" ON "cli_sessions"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "cli_sessions_refreshToken_key" ON "cli_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "cli_sessions_accessToken_idx" ON "cli_sessions"("accessToken");

-- CreateIndex
CREATE INDEX "cli_sessions_deviceId_idx" ON "cli_sessions"("deviceId");

-- CreateIndex
CREATE INDEX "cli_sessions_expiresAt_idx" ON "cli_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "cli_sessions_refreshToken_idx" ON "cli_sessions"("refreshToken");

-- CreateIndex
CREATE INDEX "cli_sessions_userId_idx" ON "cli_sessions"("userId");

-- CreateIndex
CREATE INDEX "cli_usage_provider_model_idx" ON "cli_usage"("provider", "model");

-- CreateIndex
CREATE INDEX "cli_usage_sessionId_timestamp_idx" ON "cli_usage"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "cli_usage_timestamp_idx" ON "cli_usage"("timestamp");

-- CreateIndex
CREATE INDEX "cli_usage_userId_timestamp_idx" ON "cli_usage"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "code_chunks_vectorId_key" ON "code_chunks"("vectorId");

-- CreateIndex
CREATE INDEX "code_chunks_contentType_language_idx" ON "code_chunks"("contentType", "language");

-- CreateIndex
CREATE INDEX "code_chunks_filePath_idx" ON "code_chunks"("filePath");

-- CreateIndex
CREATE INDEX "code_chunks_knowledgeBaseId_language_idx" ON "code_chunks"("knowledgeBaseId", "language");

-- CreateIndex
CREATE INDEX "code_generations_framework_language_idx" ON "code_generations"("framework", "language");

-- CreateIndex
CREATE INDEX "code_generations_projectId_type_idx" ON "code_generations"("projectId", "type");

-- CreateIndex
CREATE INDEX "code_generations_userId_createdAt_idx" ON "code_generations"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "compilation_results_contractId_success_idx" ON "compilation_results"("contractId", "success");

-- CreateIndex
CREATE INDEX "compilation_results_solcVersion_createdAt_idx" ON "compilation_results"("solcVersion", "createdAt");

-- CreateIndex
CREATE INDEX "component_templates_category_framework_idx" ON "component_templates"("category", "framework");

-- CreateIndex
CREATE INDEX "component_templates_description_idx" ON "component_templates"("description");

-- CreateIndex
CREATE INDEX "component_templates_lastUsedAt_idx" ON "component_templates"("lastUsedAt");

-- CreateIndex
CREATE INDEX "component_templates_name_idx" ON "component_templates"("name");

-- CreateIndex
CREATE INDEX "component_templates_quality_idx" ON "component_templates"("quality");

-- CreateIndex
CREATE INDEX "component_templates_tags_idx" ON "component_templates"("tags");

-- CreateIndex
CREATE INDEX "component_templates_type_category_idx" ON "component_templates"("type", "category");

-- CreateIndex
CREATE INDEX "component_templates_usageCount_idx" ON "component_templates"("usageCount");

-- CreateIndex
CREATE UNIQUE INDEX "configurations_key_key" ON "configurations"("key");

-- CreateIndex
CREATE INDEX "contract_dependencies_dependencyType_version_idx" ON "contract_dependencies"("dependencyType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contract_dependencies_contractId_importPath_key" ON "contract_dependencies"("contractId", "importPath");

-- CreateIndex
CREATE INDEX "contract_deployments_deployerAddress_createdAt_idx" ON "contract_deployments"("deployerAddress", "createdAt");

-- CreateIndex
CREATE INDEX "contract_deployments_networkId_isActive_idx" ON "contract_deployments"("networkId", "isActive");

-- CreateIndex
CREATE INDEX "contract_deployments_projectId_status_idx" ON "contract_deployments"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "contract_deployments_contractAddress_chainId_key" ON "contract_deployments"("contractAddress", "chainId");

-- CreateIndex
CREATE INDEX "device_analytics_deviceType_timestamp_idx" ON "device_analytics"("deviceType", "timestamp");

-- CreateIndex
CREATE INDEX "device_analytics_sessionId_timestamp_idx" ON "device_analytics"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "device_analytics_userId_timestamp_idx" ON "device_analytics"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "dodo_charges_dodoChargeId_key" ON "dodo_charges"("dodoChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "dodo_subscriptions_dodoSubscriptionId_key" ON "dodo_subscriptions"("dodoSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "embedding_cache_contentHash_key" ON "embedding_cache"("contentHash");

-- CreateIndex
CREATE INDEX "embedding_cache_contentHash_idx" ON "embedding_cache"("contentHash");

-- CreateIndex
CREATE INDEX "embedding_cache_model_provider_idx" ON "embedding_cache"("model", "provider");

-- CreateIndex
CREATE INDEX "game_analytics_events_eventType_timestamp_idx" ON "game_analytics_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_processed_timestamp_idx" ON "game_analytics_events"("processed", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_projectId_timestamp_idx" ON "game_analytics_events"("projectId", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_sessionId_timestamp_idx" ON "game_analytics_events"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_userId_timestamp_idx" ON "game_analytics_events"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "game_assets_projectId_assetType_idx" ON "game_assets"("projectId", "assetType");

-- CreateIndex
CREATE INDEX "game_assets_userId_assetType_idx" ON "game_assets"("userId", "assetType");

-- CreateIndex
CREATE INDEX "game_builds_priority_queuedAt_idx" ON "game_builds"("priority", "queuedAt");

-- CreateIndex
CREATE INDEX "game_builds_projectId_status_idx" ON "game_builds"("projectId", "status");

-- CreateIndex
CREATE INDEX "game_builds_status_queuedAt_idx" ON "game_builds"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "game_builds_userId_status_idx" ON "game_builds"("userId", "status");

-- CreateIndex
CREATE INDEX "game_match_players_matchId_team_idx" ON "game_match_players"("matchId", "team");

-- CreateIndex
CREATE INDEX "game_match_players_userId_skillAfter_idx" ON "game_match_players"("userId", "skillAfter");

-- CreateIndex
CREATE UNIQUE INDEX "game_match_players_userId_matchId_key" ON "game_match_players"("userId", "matchId");

-- CreateIndex
CREATE INDEX "game_matches_gameMode_status_idx" ON "game_matches"("gameMode", "status");

-- CreateIndex
CREATE INDEX "game_matches_startedAt_status_idx" ON "game_matches"("startedAt", "status");

-- CreateIndex
CREATE INDEX "game_matches_status_matchType_idx" ON "game_matches"("status", "matchType");

-- CreateIndex
CREATE INDEX "game_room_players_roomId_status_idx" ON "game_room_players"("roomId", "status");

-- CreateIndex
CREATE INDEX "game_room_players_userId_status_idx" ON "game_room_players"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_room_players_userId_roomId_key" ON "game_room_players"("userId", "roomId");

-- CreateIndex
CREATE INDEX "game_rooms_hostId_status_idx" ON "game_rooms"("hostId", "status");

-- CreateIndex
CREATE INDEX "game_rooms_projectId_status_idx" ON "game_rooms"("projectId", "status");

-- CreateIndex
CREATE INDEX "game_rooms_serverRegion_gameMode_idx" ON "game_rooms"("serverRegion", "gameMode");

-- CreateIndex
CREATE INDEX "game_rooms_status_gameMode_idx" ON "game_rooms"("status", "gameMode");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_sessionId_key" ON "game_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "game_sessions_isActive_startTime_idx" ON "game_sessions"("isActive", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_platform_startTime_idx" ON "game_sessions"("platform", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_projectId_startTime_idx" ON "game_sessions"("projectId", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_userId_startTime_idx" ON "game_sessions"("userId", "startTime");

-- CreateIndex
CREATE INDEX "matchmaking_queue_queuedAt_status_idx" ON "matchmaking_queue"("queuedAt", "status");

-- CreateIndex
CREATE INDEX "matchmaking_queue_skillLevel_gameMode_idx" ON "matchmaking_queue"("skillLevel", "gameMode");

-- CreateIndex
CREATE INDEX "matchmaking_queue_status_gameMode_idx" ON "matchmaking_queue"("status", "gameMode");

-- CreateIndex
CREATE INDEX "matchmaking_queue_userId_status_idx" ON "matchmaking_queue"("userId", "status");

-- CreateIndex
CREATE INDEX "mobile_analytics_event_platform_idx" ON "mobile_analytics"("event", "platform");

-- CreateIndex
CREATE INDEX "mobile_analytics_userId_timestamp_idx" ON "mobile_analytics"("userId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_sessions_sessionToken_key" ON "mobile_sessions"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "notification_settings_userId_key" ON "notification_settings"("userId");

-- CreateIndex
CREATE INDEX "notifications_type_createdAt_idx" ON "notifications"("type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_read_idx" ON "notifications"("userId", "read");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerId_key" ON "oauth_accounts"("provider", "providerId");

-- CreateIndex
CREATE UNIQUE INDEX "offline_actions_uuid_key" ON "offline_actions"("uuid");

-- CreateIndex
CREATE INDEX "offline_actions_deviceId_status_idx" ON "offline_actions"("deviceId", "status");

-- CreateIndex
CREATE INDEX "offline_actions_userId_status_idx" ON "offline_actions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_dodoCheckoutId_key" ON "payment_intents"("dodoCheckoutId");

-- CreateIndex
CREATE INDEX "payment_intents_paymentType_status_idx" ON "payment_intents"("paymentType", "status");

-- CreateIndex
CREATE INDEX "payment_intents_userId_status_idx" ON "payment_intents"("userId", "status");

-- CreateIndex
CREATE INDEX "platform_api_keys_userId_idx" ON "platform_api_keys"("userId");

-- CreateIndex
CREATE INDEX "platform_api_keys_provider_idx" ON "platform_api_keys"("provider");

-- CreateIndex
CREATE INDEX "platform_sessions_lastActivity_idx" ON "platform_sessions"("lastActivity");

-- CreateIndex
CREATE INDEX "platform_sessions_platform_isActive_idx" ON "platform_sessions"("platform", "isActive");

-- CreateIndex
CREATE INDEX "platform_sessions_userId_isActive_idx" ON "platform_sessions"("userId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "project_collaborators_projectId_userId_key" ON "project_collaborators"("projectId", "userId");

-- CreateIndex
CREATE INDEX "project_comments_createdAt_idx" ON "project_comments"("createdAt");

-- CreateIndex
CREATE INDEX "project_comments_projectId_idx" ON "project_comments"("projectId");

-- CreateIndex
CREATE INDEX "project_comments_userId_idx" ON "project_comments"("userId");

-- CreateIndex
CREATE INDEX "project_shares_platform_idx" ON "project_shares"("platform");

-- CreateIndex
CREATE INDEX "project_shares_userId_idx" ON "project_shares"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_shares_projectId_platform_key" ON "project_shares"("projectId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_cache_promptHash_key" ON "prompt_cache"("promptHash");

-- CreateIndex
CREATE INDEX "prompt_cache_expiresAt_idx" ON "prompt_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "prompt_cache_hitCount_idx" ON "prompt_cache"("hitCount");

-- CreateIndex
CREATE INDEX "prompt_cache_lastUsedAt_idx" ON "prompt_cache"("lastUsedAt");

-- CreateIndex
CREATE INDEX "prompt_cache_model_provider_idx" ON "prompt_cache"("model", "provider");

-- CreateIndex
CREATE INDEX "prompt_cache_promptHash_idx" ON "prompt_cache"("promptHash");

-- CreateIndex
CREATE INDEX "push_notifications_status_sentAt_idx" ON "push_notifications"("status", "sentAt");

-- CreateIndex
CREATE INDEX "push_notifications_userId_status_idx" ON "push_notifications"("userId", "status");

-- CreateIndex
CREATE INDEX "rag_interactions_sessionId_createdAt_idx" ON "rag_interactions"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "rag_sessions_userId_isActive_idx" ON "rag_sessions"("userId", "isActive");

-- CreateIndex
CREATE INDEX "remote_assistance_status_expiresAt_idx" ON "remote_assistance"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "remote_assistance_userId_idx" ON "remote_assistance"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "report_cache_cacheKey_key" ON "report_cache"("cacheKey");

-- CreateIndex
CREATE INDEX "report_cache_cacheKey_expiresAt_idx" ON "report_cache"("cacheKey", "expiresAt");

-- CreateIndex
CREATE INDEX "report_cache_expiresAt_idx" ON "report_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "report_cache_reportId_expiresAt_idx" ON "report_cache"("reportId", "expiresAt");

-- CreateIndex
CREATE INDEX "report_comments_parentId_threadDepth_idx" ON "report_comments"("parentId", "threadDepth");

-- CreateIndex
CREATE INDEX "report_comments_reportId_isDeleted_idx" ON "report_comments"("reportId", "isDeleted");

-- CreateIndex
CREATE INDEX "report_comments_shareId_isDeleted_idx" ON "report_comments"("shareId", "isDeleted");

-- CreateIndex
CREATE INDEX "report_comments_userId_createdAt_idx" ON "report_comments"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "report_executions_reportId_startedAt_idx" ON "report_executions"("reportId", "startedAt");

-- CreateIndex
CREATE INDEX "report_executions_scheduleId_status_idx" ON "report_executions"("scheduleId", "status");

-- CreateIndex
CREATE INDEX "report_executions_userId_status_idx" ON "report_executions"("userId", "status");

-- CreateIndex
CREATE INDEX "report_exports_reportId_format_idx" ON "report_exports"("reportId", "format");

-- CreateIndex
CREATE INDEX "report_exports_status_expiresAt_idx" ON "report_exports"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "report_exports_userId_createdAt_idx" ON "report_exports"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "report_schedules_isActive_nextRun_idx" ON "report_schedules"("isActive", "nextRun");

-- CreateIndex
CREATE INDEX "report_schedules_reportId_isActive_idx" ON "report_schedules"("reportId", "isActive");

-- CreateIndex
CREATE INDEX "report_schedules_userId_nextRun_idx" ON "report_schedules"("userId", "nextRun");

-- CreateIndex
CREATE INDEX "report_share_accesses_reportId_accessType_idx" ON "report_share_accesses"("reportId", "accessType");

-- CreateIndex
CREATE INDEX "report_share_accesses_shareId_accessedAt_idx" ON "report_share_accesses"("shareId", "accessedAt");

-- CreateIndex
CREATE INDEX "report_share_accesses_userId_accessedAt_idx" ON "report_share_accesses"("userId", "accessedAt");

-- CreateIndex
CREATE INDEX "report_share_recipients_recipientEmail_status_idx" ON "report_share_recipients"("recipientEmail", "status");

-- CreateIndex
CREATE INDEX "report_share_recipients_recipientId_status_idx" ON "report_share_recipients"("recipientId", "status");

-- CreateIndex
CREATE INDEX "report_share_recipients_shareId_status_idx" ON "report_share_recipients"("shareId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "report_shares_shareToken_key" ON "report_shares"("shareToken");

-- CreateIndex
CREATE INDEX "report_shares_reportId_isActive_idx" ON "report_shares"("reportId", "isActive");

-- CreateIndex
CREATE INDEX "report_shares_shareToken_isActive_idx" ON "report_shares"("shareToken", "isActive");

-- CreateIndex
CREATE INDEX "report_shares_sharedBy_shareType_idx" ON "report_shares"("sharedBy", "shareType");

-- CreateIndex
CREATE INDEX "responsive_configs_isDefault_isActive_idx" ON "responsive_configs"("isDefault", "isActive");

-- CreateIndex
CREATE INDEX "restore_jobs_backupId_createdAt_idx" ON "restore_jobs"("backupId", "createdAt");

-- CreateIndex
CREATE INDEX "restore_jobs_status_createdAt_idx" ON "restore_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "roles_type_isActive_idx" ON "roles"("type", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_tenantId_key" ON "roles"("name", "tenantId");

-- CreateIndex
CREATE INDEX "scheduled_executions_scheduleId_startedAt_idx" ON "scheduled_executions"("scheduleId", "startedAt");

-- CreateIndex
CREATE INDEX "scheduled_executions_status_startedAt_idx" ON "scheduled_executions"("status", "startedAt");

-- CreateIndex
CREATE INDEX "semantic_queries_knowledgeBaseId_queryType_idx" ON "semantic_queries"("knowledgeBaseId", "queryType");

-- CreateIndex
CREATE INDEX "semantic_queries_userId_createdAt_idx" ON "semantic_queries"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "semantic_search_results_queryId_rank_idx" ON "semantic_search_results"("queryId", "rank");

-- CreateIndex
CREATE INDEX "semantic_search_results_similarity_idx" ON "semantic_search_results"("similarity");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "smart_contracts_compiled_lastCompiledAt_idx" ON "smart_contracts"("compiled", "lastCompiledAt");

-- CreateIndex
CREATE INDEX "smart_contracts_projectId_contractType_idx" ON "smart_contracts"("projectId", "contractType");

-- CreateIndex
CREATE UNIQUE INDEX "smart_contracts_solidityProjectId_fileName_key" ON "smart_contracts"("solidityProjectId", "fileName");

-- CreateIndex
CREATE UNIQUE INDEX "solidity_projects_projectId_key" ON "solidity_projects"("projectId");

-- CreateIndex
CREATE INDEX "subscription_plan_features_planId_idx" ON "subscription_plan_features"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_limits_planId_key" ON "subscription_plan_limits"("planId");

-- CreateIndex
CREATE INDEX "subscription_plans_active_idx" ON "subscription_plans"("active");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_states_userId_dataType_key" ON "sync_states"("userId", "dataType");

-- CreateIndex
CREATE INDEX "tenant_usage_tenantId_date_idx" ON "tenant_usage"("tenantId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_usage_tenantId_metric_date_key" ON "tenant_usage"("tenantId", "metric", "date");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_users_tenantId_email_key" ON "tenant_users"("tenantId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_domain_key" ON "tenants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_customDomain_key" ON "tenants"("customDomain");

-- CreateIndex
CREATE INDEX "translations_key_approved_idx" ON "translations"("key", "approved");

-- CreateIndex
CREATE INDEX "translations_locale_category_idx" ON "translations"("locale", "category");

-- CreateIndex
CREATE UNIQUE INDEX "translations_key_locale_key" ON "translations"("key", "locale");

-- CreateIndex
CREATE INDEX "unreal_asset_references_assetPath_idx" ON "unreal_asset_references"("assetPath");

-- CreateIndex
CREATE INDEX "unreal_asset_references_assetType_assetClass_idx" ON "unreal_asset_references"("assetType", "assetClass");

-- CreateIndex
CREATE INDEX "unreal_asset_references_isUsed_usageCount_idx" ON "unreal_asset_references"("isUsed", "usageCount");

-- CreateIndex
CREATE INDEX "unreal_asset_references_unrealProjectId_assetType_idx" ON "unreal_asset_references"("unrealProjectId", "assetType");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_blueprintName_nodeType_idx" ON "unreal_blueprint_nodes"("blueprintName", "nodeType");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_nodeType_nodeClass_idx" ON "unreal_blueprint_nodes"("nodeType", "nodeClass");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_unrealProjectId_blueprintPath_idx" ON "unreal_blueprint_nodes"("unrealProjectId", "blueprintPath");

-- CreateIndex
CREATE INDEX "unreal_build_configs_buildStatus_lastBuildTime_idx" ON "unreal_build_configs"("buildStatus", "lastBuildTime");

-- CreateIndex
CREATE INDEX "unreal_build_configs_platform_configName_idx" ON "unreal_build_configs"("platform", "configName");

-- CreateIndex
CREATE UNIQUE INDEX "unreal_build_configs_unrealProjectId_configName_platform_key" ON "unreal_build_configs"("unrealProjectId", "configName", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "unreal_projects_projectId_key" ON "unreal_projects"("projectId");

-- CreateIndex
CREATE INDEX "unreal_projects_cppSupport_idx" ON "unreal_projects"("cppSupport");

-- CreateIndex
CREATE INDEX "unreal_projects_engineVersion_idx" ON "unreal_projects"("engineVersion");

-- CreateIndex
CREATE INDEX "usage_analytics_platform_timestamp_idx" ON "usage_analytics"("platform", "timestamp");

-- CreateIndex
CREATE INDEX "usage_analytics_provider_timestamp_idx" ON "usage_analytics"("provider", "timestamp");

-- CreateIndex
CREATE INDEX "usage_analytics_userId_timestamp_idx" ON "usage_analytics"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "usage_events_timestamp_idx" ON "usage_events"("timestamp");

-- CreateIndex
CREATE INDEX "usage_events_userId_idx" ON "usage_events"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "user_api_keys_provider_idx" ON "user_api_keys"("provider");

-- CreateIndex
CREATE INDEX "user_api_keys_userId_idx" ON "user_api_keys"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_userId_deviceId_key" ON "user_devices"("userId", "deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "user_pricing_history_calculatedAt_idx" ON "user_pricing_history"("calculatedAt");

-- CreateIndex
CREATE INDEX "user_pricing_history_tierId_idx" ON "user_pricing_history"("tierId");

-- CreateIndex
CREATE INDEX "user_pricing_history_userId_idx" ON "user_pricing_history"("userId");

-- CreateIndex
CREATE INDEX "user_roles_userId_tenantId_idx" ON "user_roles"("userId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_userId_roleId_tenantId_key" ON "user_roles"("userId", "roleId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_apiKey_key" ON "users"("apiKey");

-- CreateIndex
CREATE UNIQUE INDEX "user_quota_userId_key" ON "user_quota"("userId");

-- CreateIndex
CREATE INDEX "user_quota_userId_idx" ON "user_quota"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "vector_embeddings_chunkId_key" ON "vector_embeddings"("chunkId");

-- CreateIndex
CREATE INDEX "vector_embeddings_contentHash_idx" ON "vector_embeddings"("contentHash");

-- CreateIndex
CREATE INDEX "vector_embeddings_knowledgeBaseId_idx" ON "vector_embeddings"("knowledgeBaseId");

-- CreateIndex
CREATE INDEX "visual_scripts_engine_language_idx" ON "visual_scripts"("engine", "language");

-- CreateIndex
CREATE INDEX "visual_scripts_projectId_scriptType_idx" ON "visual_scripts"("projectId", "scriptType");

-- CreateIndex
CREATE INDEX "visual_scripts_userId_createdAt_idx" ON "visual_scripts"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_externalId_key" ON "webhook_events"("externalId");

-- CreateIndex
CREATE INDEX "webhook_events_processed_createdAt_idx" ON "webhook_events"("processed", "createdAt");

-- CreateIndex
CREATE INDEX "webhook_events_provider_eventType_idx" ON "webhook_events"("provider", "eventType");

-- CreateIndex
CREATE INDEX "MCPServer_userId_idx" ON "MCPServer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MCPServer_userId_serverId_key" ON "MCPServer"("userId", "serverId");

-- CreateIndex
CREATE INDEX "MCPToolCall_userId_idx" ON "MCPToolCall"("userId");

-- CreateIndex
CREATE INDEX "MCPToolCall_serverId_idx" ON "MCPToolCall"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_sessions_urlId_key" ON "chat_sessions"("urlId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_idx" ON "chat_sessions"("userId");

-- CreateIndex
CREATE INDEX "chat_sessions_anonymousId_idx" ON "chat_sessions"("anonymousId");

-- CreateIndex
CREATE INDEX "chat_sessions_urlId_idx" ON "chat_sessions"("urlId");

-- CreateIndex
CREATE INDEX "chat_sessions_updatedAt_idx" ON "chat_sessions"("updatedAt");

-- CreateIndex
CREATE INDEX "chat_sessions_projectId_idx" ON "chat_sessions"("projectId");

-- CreateIndex
CREATE INDEX "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

-- CreateIndex
CREATE INDEX "chat_messages_createdAt_idx" ON "chat_messages"("createdAt");

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agents" ADD CONSTRAINT "agents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_generated_projects" ADD CONSTRAINT "ai_generated_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_reports" ADD CONSTRAINT "analytics_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cli_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_access" ADD CONSTRAINT "backup_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "backup_validations" ADD CONSTRAINT "backup_validations_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_requests" ADD CONSTRAINT "batch_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "batch_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_requests" ADD CONSTRAINT "batch_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blockchain_networks" ADD CONSTRAINT "blockchain_networks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthCode" ADD CONSTRAINT "AuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceCode" ADD CONSTRAINT "DeviceCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_sessions" ADD CONSTRAINT "cli_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_usage" ADD CONSTRAINT "cli_usage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "cli_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_usage" ADD CONSTRAINT "cli_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_chunks" ADD CONSTRAINT "code_chunks_vectorId_fkey" FOREIGN KEY ("vectorId") REFERENCES "vector_embeddings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_generations" ADD CONSTRAINT "code_generations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "code_generations" ADD CONSTRAINT "code_generations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codebase_knowledge" ADD CONSTRAINT "codebase_knowledge_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "codebase_knowledge" ADD CONSTRAINT "codebase_knowledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compilation_results" ADD CONSTRAINT "compilation_results_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_dependencies" ADD CONSTRAINT "contract_dependencies_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deployments" ADD CONSTRAINT "contract_deployments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deployments" ADD CONSTRAINT "contract_deployments_deployedBy_fkey" FOREIGN KEY ("deployedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deployments" ADD CONSTRAINT "contract_deployments_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "blockchain_networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deployments" ADD CONSTRAINT "contract_deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_deployments" ADD CONSTRAINT "contract_deployments_solidityProjectId_fkey" FOREIGN KEY ("solidityProjectId") REFERENCES "solidity_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dodo_charges" ADD CONSTRAINT "dodo_charges_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "dodo_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dodo_subscriptions" ADD CONSTRAINT "dodo_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dodo_usage" ADD CONSTRAINT "dodo_usage_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "dodo_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dodo_usage" ADD CONSTRAINT "dodo_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analytics_events" ADD CONSTRAINT "game_analytics_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analytics_events" ADD CONSTRAINT "game_analytics_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "game_sessions"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_analytics_events" ADD CONSTRAINT "game_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_assets" ADD CONSTRAINT "game_assets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_assets" ADD CONSTRAINT "game_assets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_builds" ADD CONSTRAINT "game_builds_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_builds" ADD CONSTRAINT "game_builds_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_match_players" ADD CONSTRAINT "game_match_players_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "game_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_match_players" ADD CONSTRAINT "game_match_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_matches" ADD CONSTRAINT "game_matches_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_matches" ADD CONSTRAINT "game_matches_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "game_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_room_players" ADD CONSTRAINT "game_room_players_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "game_rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_room_players" ADD CONSTRAINT "game_room_players_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rooms" ADD CONSTRAINT "game_rooms_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_rooms" ADD CONSTRAINT "game_rooms_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "game_rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_analytics" ADD CONSTRAINT "mobile_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_sessions" ADD CONSTRAINT "mobile_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_settings" ADD CONSTRAINT "notification_settings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offline_actions" ADD CONSTRAINT "offline_actions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_api_keys" ADD CONSTRAINT "platform_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_sessions" ADD CONSTRAINT "platform_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_collaborators" ADD CONSTRAINT "project_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_shares" ADD CONSTRAINT "project_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_notifications" ADD CONSTRAINT "push_notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_interactions" ADD CONSTRAINT "rag_interactions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "rag_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_sessions" ADD CONSTRAINT "rag_sessions_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "codebase_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rag_sessions" ADD CONSTRAINT "rag_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "remote_assistance" ADD CONSTRAINT "remote_assistance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_cache" ADD CONSTRAINT "report_cache_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_moderatedBy_fkey" FOREIGN KEY ("moderatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "report_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "report_shares"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_comments" ADD CONSTRAINT "report_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "report_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_executions" ADD CONSTRAINT "report_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_exports" ADD CONSTRAINT "report_exports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_accesses" ADD CONSTRAINT "report_share_accesses_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_accesses" ADD CONSTRAINT "report_share_accesses_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "report_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_accesses" ADD CONSTRAINT "report_share_accesses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_recipients" ADD CONSTRAINT "report_share_recipients_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_share_recipients" ADD CONSTRAINT "report_share_recipients_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "report_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_sharedBy_fkey" FOREIGN KEY ("sharedBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_jobs" ADD CONSTRAINT "restore_jobs_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "backup_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restore_jobs" ADD CONSTRAINT "restore_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_executions" ADD CONSTRAINT "scheduled_executions_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "analytics_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_executions" ADD CONSTRAINT "scheduled_executions_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "report_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_executions" ADD CONSTRAINT "scheduled_executions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_queries" ADD CONSTRAINT "semantic_queries_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_queries" ADD CONSTRAINT "semantic_queries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_search_results" ADD CONSTRAINT "semantic_search_results_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "code_chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_search_results" ADD CONSTRAINT "semantic_search_results_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "semantic_queries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "semantic_search_results" ADD CONSTRAINT "semantic_search_results_vectorId_fkey" FOREIGN KEY ("vectorId") REFERENCES "vector_embeddings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_contracts" ADD CONSTRAINT "smart_contracts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_contracts" ADD CONSTRAINT "smart_contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "smart_contracts" ADD CONSTRAINT "smart_contracts_solidityProjectId_fkey" FOREIGN KEY ("solidityProjectId") REFERENCES "solidity_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solidity_projects" ADD CONSTRAINT "solidity_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_features" ADD CONSTRAINT "subscription_plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_plan_limits" ADD CONSTRAINT "subscription_plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "payment_methods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_states" ADD CONSTRAINT "sync_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_usage" ADD CONSTRAINT "tenant_usage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_users" ADD CONSTRAINT "tenant_users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "translations" ADD CONSTRAINT "translations_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unreal_asset_references" ADD CONSTRAINT "unreal_asset_references_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unreal_blueprint_nodes" ADD CONSTRAINT "unreal_blueprint_nodes_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unreal_build_configs" ADD CONSTRAINT "unreal_build_configs_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "unreal_projects" ADD CONSTRAINT "unreal_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_analytics" ADD CONSTRAINT "usage_analytics_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_analytics" ADD CONSTRAINT "usage_analytics_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_api_keys" ADD CONSTRAINT "user_api_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_pricing_history" ADD CONSTRAINT "user_pricing_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vector_embeddings" ADD CONSTRAINT "vector_embeddings_knowledgeBaseId_fkey" FOREIGN KEY ("knowledgeBaseId") REFERENCES "codebase_knowledge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_scripts" ADD CONSTRAINT "visual_scripts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visual_scripts" ADD CONSTRAINT "visual_scripts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "webhooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "webhooks" ADD CONSTRAINT "webhooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCPServer" ADD CONSTRAINT "MCPServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCPToolCall" ADD CONSTRAINT "MCPToolCall_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
