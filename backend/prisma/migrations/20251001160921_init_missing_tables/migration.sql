-- AlterTable
ALTER TABLE "public"."game_assets" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."game_builds" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."mobile_sessions" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."notification_settings" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."report_comments" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."report_schedules" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."report_shares" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."responsive_configs" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "backupCodes" TEXT,
ADD COLUMN     "backupCodesTemp" TEXT,
ADD COLUMN     "totpSecret" TEXT,
ADD COLUMN     "totpSecretTemp" TEXT,
ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorEnabledAt" TIMESTAMP(3),
ADD COLUMN     "twoFactorSetupAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "public"."visual_scripts" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "public"."game_analytics_events" (
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
CREATE TABLE "public"."game_sessions" (
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
CREATE TABLE "public"."unreal_projects" (
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
CREATE TABLE "public"."unreal_blueprint_nodes" (
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
CREATE TABLE "public"."unreal_asset_references" (
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
CREATE TABLE "public"."unreal_build_configs" (
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
CREATE TABLE "public"."solidity_projects" (
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
CREATE TABLE "public"."smart_contracts" (
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
CREATE TABLE "public"."blockchain_networks" (
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
CREATE TABLE "public"."contract_deployments" (
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
CREATE TABLE "public"."contract_dependencies" (
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
CREATE TABLE "public"."compilation_results" (
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
CREATE TABLE "public"."subscription_plans" (
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
CREATE TABLE "public"."subscription_plan_features" (
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
CREATE TABLE "public"."subscription_plan_limits" (
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
CREATE TABLE "public"."usage_events" (
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
CREATE TABLE "public"."ai_generated_projects" (
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
CREATE TABLE "public"."project_collaborators" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'viewer',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "project_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."project_comments" (
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
CREATE TABLE "public"."webhook_events" (
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
CREATE TABLE "public"."platform_sessions" (
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
CREATE TABLE "public"."project_shares" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sharedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."remote_assistance" (
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
CREATE TABLE "public"."user_pricing_history" (
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
CREATE TABLE "public"."batch_requests" (
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
CREATE TABLE "public"."batch_executions" (
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
CREATE TABLE "public"."prompt_cache" (
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
CREATE TABLE "public"."component_templates" (
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

-- CreateIndex
CREATE INDEX "game_analytics_events_eventType_timestamp_idx" ON "public"."game_analytics_events"("eventType", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_userId_timestamp_idx" ON "public"."game_analytics_events"("userId", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_projectId_timestamp_idx" ON "public"."game_analytics_events"("projectId", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_sessionId_timestamp_idx" ON "public"."game_analytics_events"("sessionId", "timestamp");

-- CreateIndex
CREATE INDEX "game_analytics_events_processed_timestamp_idx" ON "public"."game_analytics_events"("processed", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_sessionId_key" ON "public"."game_sessions"("sessionId");

-- CreateIndex
CREATE INDEX "game_sessions_userId_startTime_idx" ON "public"."game_sessions"("userId", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_projectId_startTime_idx" ON "public"."game_sessions"("projectId", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_platform_startTime_idx" ON "public"."game_sessions"("platform", "startTime");

-- CreateIndex
CREATE INDEX "game_sessions_isActive_startTime_idx" ON "public"."game_sessions"("isActive", "startTime");

-- CreateIndex
CREATE UNIQUE INDEX "unreal_projects_projectId_key" ON "public"."unreal_projects"("projectId");

-- CreateIndex
CREATE INDEX "unreal_projects_engineVersion_idx" ON "public"."unreal_projects"("engineVersion");

-- CreateIndex
CREATE INDEX "unreal_projects_cppSupport_idx" ON "public"."unreal_projects"("cppSupport");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_unrealProjectId_blueprintPath_idx" ON "public"."unreal_blueprint_nodes"("unrealProjectId", "blueprintPath");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_nodeType_nodeClass_idx" ON "public"."unreal_blueprint_nodes"("nodeType", "nodeClass");

-- CreateIndex
CREATE INDEX "unreal_blueprint_nodes_blueprintName_nodeType_idx" ON "public"."unreal_blueprint_nodes"("blueprintName", "nodeType");

-- CreateIndex
CREATE INDEX "unreal_asset_references_unrealProjectId_assetType_idx" ON "public"."unreal_asset_references"("unrealProjectId", "assetType");

-- CreateIndex
CREATE INDEX "unreal_asset_references_assetPath_idx" ON "public"."unreal_asset_references"("assetPath");

-- CreateIndex
CREATE INDEX "unreal_asset_references_assetType_assetClass_idx" ON "public"."unreal_asset_references"("assetType", "assetClass");

-- CreateIndex
CREATE INDEX "unreal_asset_references_isUsed_usageCount_idx" ON "public"."unreal_asset_references"("isUsed", "usageCount");

-- CreateIndex
CREATE INDEX "unreal_build_configs_platform_configName_idx" ON "public"."unreal_build_configs"("platform", "configName");

-- CreateIndex
CREATE INDEX "unreal_build_configs_buildStatus_lastBuildTime_idx" ON "public"."unreal_build_configs"("buildStatus", "lastBuildTime");

-- CreateIndex
CREATE UNIQUE INDEX "unreal_build_configs_unrealProjectId_configName_platform_key" ON "public"."unreal_build_configs"("unrealProjectId", "configName", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "solidity_projects_projectId_key" ON "public"."solidity_projects"("projectId");

-- CreateIndex
CREATE INDEX "smart_contracts_projectId_contractType_idx" ON "public"."smart_contracts"("projectId", "contractType");

-- CreateIndex
CREATE INDEX "smart_contracts_compiled_lastCompiledAt_idx" ON "public"."smart_contracts"("compiled", "lastCompiledAt");

-- CreateIndex
CREATE UNIQUE INDEX "smart_contracts_solidityProjectId_fileName_key" ON "public"."smart_contracts"("solidityProjectId", "fileName");

-- CreateIndex
CREATE UNIQUE INDEX "blockchain_networks_chainId_key" ON "public"."blockchain_networks"("chainId");

-- CreateIndex
CREATE INDEX "blockchain_networks_chainId_isActive_idx" ON "public"."blockchain_networks"("chainId", "isActive");

-- CreateIndex
CREATE INDEX "blockchain_networks_isMainnet_isTestnet_idx" ON "public"."blockchain_networks"("isMainnet", "isTestnet");

-- CreateIndex
CREATE INDEX "contract_deployments_projectId_status_idx" ON "public"."contract_deployments"("projectId", "status");

-- CreateIndex
CREATE INDEX "contract_deployments_networkId_isActive_idx" ON "public"."contract_deployments"("networkId", "isActive");

-- CreateIndex
CREATE INDEX "contract_deployments_deployerAddress_createdAt_idx" ON "public"."contract_deployments"("deployerAddress", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "contract_deployments_contractAddress_chainId_key" ON "public"."contract_deployments"("contractAddress", "chainId");

-- CreateIndex
CREATE INDEX "contract_dependencies_dependencyType_version_idx" ON "public"."contract_dependencies"("dependencyType", "version");

-- CreateIndex
CREATE UNIQUE INDEX "contract_dependencies_contractId_importPath_key" ON "public"."contract_dependencies"("contractId", "importPath");

-- CreateIndex
CREATE INDEX "compilation_results_contractId_success_idx" ON "public"."compilation_results"("contractId", "success");

-- CreateIndex
CREATE INDEX "compilation_results_solcVersion_createdAt_idx" ON "public"."compilation_results"("solcVersion", "createdAt");

-- CreateIndex
CREATE INDEX "subscription_plans_active_idx" ON "public"."subscription_plans"("active");

-- CreateIndex
CREATE INDEX "subscription_plan_features_planId_idx" ON "public"."subscription_plan_features"("planId");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plan_limits_planId_key" ON "public"."subscription_plan_limits"("planId");

-- CreateIndex
CREATE INDEX "usage_events_userId_idx" ON "public"."usage_events"("userId");

-- CreateIndex
CREATE INDEX "usage_events_timestamp_idx" ON "public"."usage_events"("timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "ai_generated_projects_sessionId_key" ON "public"."ai_generated_projects"("sessionId");

-- CreateIndex
CREATE INDEX "ai_generated_projects_userId_idx" ON "public"."ai_generated_projects"("userId");

-- CreateIndex
CREATE INDEX "ai_generated_projects_framework_idx" ON "public"."ai_generated_projects"("framework");

-- CreateIndex
CREATE INDEX "ai_generated_projects_isPublic_stars_idx" ON "public"."ai_generated_projects"("isPublic", "stars");

-- CreateIndex
CREATE INDEX "ai_generated_projects_createdAt_idx" ON "public"."ai_generated_projects"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_collaborators_projectId_userId_key" ON "public"."project_collaborators"("projectId", "userId");

-- CreateIndex
CREATE INDEX "project_comments_projectId_idx" ON "public"."project_comments"("projectId");

-- CreateIndex
CREATE INDEX "project_comments_userId_idx" ON "public"."project_comments"("userId");

-- CreateIndex
CREATE INDEX "project_comments_createdAt_idx" ON "public"."project_comments"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_externalId_key" ON "public"."webhook_events"("externalId");

-- CreateIndex
CREATE INDEX "webhook_events_provider_eventType_idx" ON "public"."webhook_events"("provider", "eventType");

-- CreateIndex
CREATE INDEX "webhook_events_processed_createdAt_idx" ON "public"."webhook_events"("processed", "createdAt");

-- CreateIndex
CREATE INDEX "platform_sessions_userId_isActive_idx" ON "public"."platform_sessions"("userId", "isActive");

-- CreateIndex
CREATE INDEX "platform_sessions_platform_isActive_idx" ON "public"."platform_sessions"("platform", "isActive");

-- CreateIndex
CREATE INDEX "platform_sessions_lastActivity_idx" ON "public"."platform_sessions"("lastActivity");

-- CreateIndex
CREATE INDEX "project_shares_userId_idx" ON "public"."project_shares"("userId");

-- CreateIndex
CREATE INDEX "project_shares_platform_idx" ON "public"."project_shares"("platform");

-- CreateIndex
CREATE UNIQUE INDEX "project_shares_projectId_platform_key" ON "public"."project_shares"("projectId", "platform");

-- CreateIndex
CREATE INDEX "remote_assistance_userId_idx" ON "public"."remote_assistance"("userId");

-- CreateIndex
CREATE INDEX "remote_assistance_status_expiresAt_idx" ON "public"."remote_assistance"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "user_pricing_history_userId_idx" ON "public"."user_pricing_history"("userId");

-- CreateIndex
CREATE INDEX "user_pricing_history_tierId_idx" ON "public"."user_pricing_history"("tierId");

-- CreateIndex
CREATE INDEX "user_pricing_history_calculatedAt_idx" ON "public"."user_pricing_history"("calculatedAt");

-- CreateIndex
CREATE INDEX "batch_requests_userId_idx" ON "public"."batch_requests"("userId");

-- CreateIndex
CREATE INDEX "batch_requests_type_idx" ON "public"."batch_requests"("type");

-- CreateIndex
CREATE INDEX "batch_requests_status_idx" ON "public"."batch_requests"("status");

-- CreateIndex
CREATE INDEX "batch_requests_timestamp_idx" ON "public"."batch_requests"("timestamp");

-- CreateIndex
CREATE INDEX "batch_requests_batchId_idx" ON "public"."batch_requests"("batchId");

-- CreateIndex
CREATE INDEX "batch_executions_type_idx" ON "public"."batch_executions"("type");

-- CreateIndex
CREATE INDEX "batch_executions_status_idx" ON "public"."batch_executions"("status");

-- CreateIndex
CREATE INDEX "batch_executions_createdAt_idx" ON "public"."batch_executions"("createdAt");

-- CreateIndex
CREATE INDEX "batch_executions_completedAt_idx" ON "public"."batch_executions"("completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_cache_promptHash_key" ON "public"."prompt_cache"("promptHash");

-- CreateIndex
CREATE INDEX "prompt_cache_promptHash_idx" ON "public"."prompt_cache"("promptHash");

-- CreateIndex
CREATE INDEX "prompt_cache_model_provider_idx" ON "public"."prompt_cache"("model", "provider");

-- CreateIndex
CREATE INDEX "prompt_cache_expiresAt_idx" ON "public"."prompt_cache"("expiresAt");

-- CreateIndex
CREATE INDEX "prompt_cache_hitCount_idx" ON "public"."prompt_cache"("hitCount");

-- CreateIndex
CREATE INDEX "prompt_cache_lastUsedAt_idx" ON "public"."prompt_cache"("lastUsedAt");

-- CreateIndex
CREATE INDEX "component_templates_category_framework_idx" ON "public"."component_templates"("category", "framework");

-- CreateIndex
CREATE INDEX "component_templates_type_category_idx" ON "public"."component_templates"("type", "category");

-- CreateIndex
CREATE INDEX "component_templates_usageCount_idx" ON "public"."component_templates"("usageCount");

-- CreateIndex
CREATE INDEX "component_templates_quality_idx" ON "public"."component_templates"("quality");

-- CreateIndex
CREATE INDEX "component_templates_lastUsedAt_idx" ON "public"."component_templates"("lastUsedAt");

-- CreateIndex
CREATE INDEX "component_templates_tags_idx" ON "public"."component_templates"("tags");

-- CreateIndex
CREATE INDEX "component_templates_name_idx" ON "public"."component_templates"("name");

-- CreateIndex
CREATE INDEX "component_templates_description_idx" ON "public"."component_templates"("description");

-- AddForeignKey
ALTER TABLE "public"."game_analytics_events" ADD CONSTRAINT "game_analytics_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_analytics_events" ADD CONSTRAINT "game_analytics_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."game_sessions"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_analytics_events" ADD CONSTRAINT "game_analytics_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_sessions" ADD CONSTRAINT "game_sessions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."game_sessions" ADD CONSTRAINT "game_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unreal_projects" ADD CONSTRAINT "unreal_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unreal_blueprint_nodes" ADD CONSTRAINT "unreal_blueprint_nodes_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "public"."unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unreal_asset_references" ADD CONSTRAINT "unreal_asset_references_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "public"."unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."unreal_build_configs" ADD CONSTRAINT "unreal_build_configs_unrealProjectId_fkey" FOREIGN KEY ("unrealProjectId") REFERENCES "public"."unreal_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."solidity_projects" ADD CONSTRAINT "solidity_projects_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."smart_contracts" ADD CONSTRAINT "smart_contracts_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."smart_contracts" ADD CONSTRAINT "smart_contracts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."smart_contracts" ADD CONSTRAINT "smart_contracts_solidityProjectId_fkey" FOREIGN KEY ("solidityProjectId") REFERENCES "public"."solidity_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blockchain_networks" ADD CONSTRAINT "blockchain_networks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_deployments" ADD CONSTRAINT "contract_deployments_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_deployments" ADD CONSTRAINT "contract_deployments_deployedBy_fkey" FOREIGN KEY ("deployedBy") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_deployments" ADD CONSTRAINT "contract_deployments_networkId_fkey" FOREIGN KEY ("networkId") REFERENCES "public"."blockchain_networks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_deployments" ADD CONSTRAINT "contract_deployments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_deployments" ADD CONSTRAINT "contract_deployments_solidityProjectId_fkey" FOREIGN KEY ("solidityProjectId") REFERENCES "public"."solidity_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contract_dependencies" ADD CONSTRAINT "contract_dependencies_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."compilation_results" ADD CONSTRAINT "compilation_results_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "public"."smart_contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payment_intents" ADD CONSTRAINT "payment_intents_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscription_plan_features" ADD CONSTRAINT "subscription_plan_features_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."subscription_plan_limits" ADD CONSTRAINT "subscription_plan_limits_planId_fkey" FOREIGN KEY ("planId") REFERENCES "public"."subscription_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."usage_events" ADD CONSTRAINT "usage_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ai_generated_projects" ADD CONSTRAINT "ai_generated_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_collaborators" ADD CONSTRAINT "project_collaborators_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_collaborators" ADD CONSTRAINT "project_collaborators_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_comments" ADD CONSTRAINT "project_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."project_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_comments" ADD CONSTRAINT "project_comments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_comments" ADD CONSTRAINT "project_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."platform_sessions" ADD CONSTRAINT "platform_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_shares" ADD CONSTRAINT "project_shares_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."ai_generated_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."project_shares" ADD CONSTRAINT "project_shares_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."remote_assistance" ADD CONSTRAINT "remote_assistance_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_pricing_history" ADD CONSTRAINT "user_pricing_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batch_requests" ADD CONSTRAINT "batch_requests_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."batch_executions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."batch_requests" ADD CONSTRAINT "batch_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
