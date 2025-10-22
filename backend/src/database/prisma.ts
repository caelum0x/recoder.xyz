// Prisma Database Client
// Centralized database connection management with enterprise optimization

const { PrismaClient } = require('@prisma/client');
const { logger } = require('../utils/logger');
// const { databaseOptimization } = require('../services/database-optimization');
// Lazy load redisCache to avoid circular dependency
let redisCache: any = null;
setImmediate(() => {
  try {
    redisCache = require('../services/redis-cache').redisCache;
  } catch (err) {
    logger.warn('Could not load redis cache in prisma.ts');
  }
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Safe Prisma configuration for startup
const createPrismaClient = () => {
  return new PrismaClient({
    log: [
      // Minimal logging for startup
      { emit: 'stdout', level: 'error' },
      { emit: 'stdout', level: 'warn' }
    ],
    datasources: {
      db: {
        url: process.env.DATABASE_URL + '?connection_limit=5&pool_timeout=10&statement_timeout=10000&connect_timeout=3'
      }
    }
  });
};

// Create base Prisma client with CommonJS export
const basePrisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma;

// Enhanced Prisma client with caching and optimization
class EnhancedPrismaClient {
  private client: PrismaClient;

  constructor(client: PrismaClient) {
    this.client = client;
    this.setupEventListeners();
  }

  private setupEventListeners() {
    // Note: Prisma client event listeners temporarily disabled due to type issues
    // TODO: Re-enable with proper event types when Prisma client is stable
    /*
    this.client.$on('query', (e) => {
      if (e.duration > 1000) {
        logger.warn('Slow query detected', {
          query: e.query.substring(0, 100),
          duration: e.duration,
          params: e.params
        });
      }
    });

    this.client.$on('error', (e) => {
      logger.error('Database error:', e);
    });
    */
  }

  // Core Prisma models - only including models that exist in schema
  get user() { return this.client.users; }
  get users() { return this.client.users; } // Alias for compatibility
  get project() { return this.client.project; }
  get template() { return this.client.template; }
  get agent() { return this.client.agent; }
  get usageRecord() { return this.client.usageRecord; }
  get subscription() { return this.client.subscription; }
  get invoice() { return this.client.invoice; }
  get paymentMethod() { return this.client.paymentMethod; }
  get integration() { return this.client.integration; }
  get apiKey() { return this.client.apiKey; }
  get auditLog() { return this.client.auditLog; }
  get configuration() { return this.client.configuration; }
  get notificationSettings() { return this.client.notificationSettings; }
  get fileUpload() { return this.client.fileUpload; }
  get webhook() { return this.client.webhook; }
  get webhookDelivery() { return this.client.webhookDelivery; }
  get oAuthAccount() { return this.client.oAuthAccount; }
  get userDevice() { return this.client.userDevice; }
  get syncState() { return this.client.syncState; }
  get aIProviderStatus() { return this.client.aIProviderStatus; }
  get usageAnalytics() { return this.client.usageAnalytics; }
  get dodoSubscription() { return this.client.dodoSubscription; }
  get dodoUsage() { return this.client.dodoUsage; }
  get dodoCharge() { return this.client.dodoCharge; }
  get dodoWebhookEvent() { return this.client.dodoWebhookEvent; }
  get codebaseKnowledge() { return this.client.codebaseKnowledge; }
  get codeChunk() { return this.client.codeChunk; }
  get vectorEmbedding() { return this.client.vectorEmbedding; }
  get semanticQuery() { return this.client.semanticQuery; }
  get semanticSearchResult() { return this.client.semanticSearchResult; }
  get embeddingCache() { return this.client.embeddingCache; }
  get rAGSession() { return this.client.rAGSession; }
  get rAGInteraction() { return this.client.rAGInteraction; }
  get backupJob() { return this.client.backupJob; }
  get restoreJob() { return this.client.restoreJob; }
  get backupValidation() { return this.client.backupValidation; }
  get backupSchedule() { return this.client.backupSchedule; }
  get backupStorage() { return this.client.backupStorage; }
  get backupAccess() { return this.client.backupAccess; }
  get userPreferences() { return this.client.userPreferences; }
  get responsiveConfig() { return this.client.responsiveConfig; }
  get deviceAnalytics() { return this.client.deviceAnalytics; }
  get translation() { return this.client.translation; }
  get tenant() { return this.client.tenant; }
  get tenantUser() { return this.client.tenantUser; }
  get tenantUsage() { return this.client.tenantUsage; }
  get role() { return this.client.role; }
  get userRole() { return this.client.userRole; }

  // Game development models
  get codeGeneration() { return this.client.codeGeneration; }
  get gameBuild() { return this.client.gameBuild; }
  get gameAsset() { return this.client.gameAsset; }
  get visualScript() { return this.client.visualScript; }
  get gameRoom() { return this.client.gameRoom; }
  get gameRoomPlayer() { return this.client.gameRoomPlayer; }
  get matchmakingQueue() { return this.client.matchmakingQueue; }
  get gameMatch() { return this.client.gameMatch; }
  get gameMatchPlayer() { return this.client.gameMatchPlayer; }

  // Unreal Engine models
  get unrealProject() { return this.client.unrealProject; }
  get unrealBlueprintNode() { return this.client.unrealBlueprintNode; }
  get unrealAssetReference() { return this.client.unrealAssetReference; }
  get unrealBuildConfig() { return this.client.unrealBuildConfig; }

  // Blockchain models
  get solidityProject() { return this.client.solidityProject; }
  get smartContract() { return this.client.smartContract; }
  get blockchainNetwork() { return this.client.blockchainNetwork; }

  // CLI Authentication
  get cli_sessions() { return this.client.cli_sessions; }
  get cLISession() { return this.client.cli_sessions; } // Alias for compatibility
  get contractDeployment() { return this.client.contractDeployment; }
  get contractDependency() { return this.client.contractDependency; }
  get compilationResult() { return this.client.compilationResult; }

  // Analytics and reporting models
  get analyticsReport() { return this.client.analyticsReport; }
  get reportExecution() { return this.client.reportExecution; }
  get reportExport() { return this.client.reportExport; }
  get reportSchedule() { return this.client.reportSchedule; }
  get scheduledExecution() { return this.client.scheduledExecution; }
  get reportShare() { return this.client.reportShare; }
  get reportShareRecipient() { return this.client.reportShareRecipient; }
  get reportShareAccess() { return this.client.reportShareAccess; }
  get reportComment() { return this.client.reportComment; }
  get reportCache() { return this.client.reportCache; }

  // Mobile models
  get mobileSession() { return this.client.mobileSession; }
  get mobileAnalytics() { return this.client.mobileAnalytics; }
  get pushNotification() { return this.client.pushNotification; }
  get offlineAction() { return this.client.offlineAction; }

  // Cost optimization models
  get promptCache() { return this.client.promptCache; }
  get componentTemplate() { return this.client.componentTemplate; }
  get batchRequest() { return this.client.batchRequest; }
  get batchExecution() { return this.client.batchExecution; }

  // Expose Prisma methods
  get $connect() { return this.client.$connect.bind(this.client); }
  get $disconnect() { return this.client.$disconnect.bind(this.client); }
  get $executeRaw() { return this.client.$executeRaw.bind(this.client); }
  get $executeRawUnsafe() { return this.client.$executeRawUnsafe.bind(this.client); }
  get $queryRaw() { return this.client.$queryRaw.bind(this.client); }
  get $queryRawUnsafe() { return this.client.$queryRawUnsafe.bind(this.client); }
  get $transaction() { return this.client.$transaction.bind(this.client); }
  get $on() { return this.client.$on.bind(this.client); }

  // Enhanced cached query method
  async cachedQuery<T>(
    query: string,
    params: any[] = [],
    cacheKey?: string,
    cacheTtl: number = 300
  ): Promise<T> {
    const finalCacheKey = cacheKey || `query:${this.hashQuery(query, params)}`;
    
    // Try cache first
    try {
      const cached = await redisCache.get<T>(finalCacheKey, 'API_RESPONSES');
      if (cached) {
        return cached;
      }
    } catch (error) {
      logger.warn('Cache lookup failed:', error);
    }

    // Execute query directly (optimization service temporarily disabled)
    const result = await this.client.$queryRawUnsafe(query, ...params) as T;

    // Cache the result
    try {
      await redisCache.set(finalCacheKey, result, { ttl: cacheTtl }, 'API_RESPONSES');
    } catch (error) {
      logger.warn('Cache storage failed:', error);
    }

    return result;
  }

  // Read-optimized query (optimization service temporarily disabled)
  async readQuery<T>(query: string, params: any[] = []): Promise<T> {
    return await this.client.$queryRawUnsafe(query, ...params) as T;
  }

  // Write-optimized query (optimization service temporarily disabled)
  async writeQuery<T>(query: string, params: any[] = []): Promise<T> {
    // Invalidate related cache entries
    try {
      await this.invalidateQueryCache(query);
    } catch (error) {
      logger.warn('Cache invalidation failed:', error);
    }
    
    return await this.client.$queryRawUnsafe(query, ...params) as T;
  }

  // Cached find operations
  async cachedFindMany<T>(
    model: string,
    args: any,
    cacheKey?: string,
    cacheTtl: number = 300
  ): Promise<T> {
    const key = cacheKey || `find:${model}:${this.hashObject(args)}`;
    
    try {
      const cached = await redisCache.get<T>(key, 'API_RESPONSES');
      if (cached) return cached;
    } catch (error) {
      logger.warn('Cache lookup failed for findMany:', error);
    }

    // Execute the actual query
    const modelClient = (this.client as any)[model];
    const result = await modelClient.findMany(args);

    try {
      await redisCache.set(key, result, { ttl: cacheTtl, tags: [model] }, 'API_RESPONSES');
    } catch (error) {
      logger.warn('Cache storage failed for findMany:', error);
    }
    
    return result;
  }

  async cachedFindUnique<T>(
    model: string,
    args: any,
    cacheKey?: string,
    cacheTtl: number = 600
  ): Promise<T> {
    const key = cacheKey || `findUnique:${model}:${this.hashObject(args)}`;
    
    try {
      const cached = await redisCache.get<T>(key, 'API_RESPONSES');
      if (cached) return cached;
    } catch (error) {
      logger.warn('Cache lookup failed for findUnique:', error);
    }

    const modelClient = (this.client as any)[model];
    const result = await modelClient.findUnique(args);

    try {
      await redisCache.set(key, result, { ttl: cacheTtl, tags: [model] }, 'API_RESPONSES');
    } catch (error) {
      logger.warn('Cache storage failed for findUnique:', error);
    }
    
    return result;
  }

  // Invalidate cache for write operations
  async invalidateCache(model: string, id?: string): Promise<void> {
    try {
      if (id) {
        await redisCache.invalidateByTags([model, `${model}:${id}`]);
      } else {
        await redisCache.invalidateByTags([model]);
      }
    } catch (error) {
      logger.warn('Cache invalidation failed:', error);
    }
  }

  private hashQuery(query: string, params: any[]): string {
    const combined = query + JSON.stringify(params);
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    return this.hashQuery(str, []);
  }

  private async invalidateQueryCache(query: string): Promise<void> {
    try {
      // Extract table names from query and invalidate related caches
      const tableMatches = query.match(/(?:FROM|INTO|UPDATE|JOIN)\s+(\w+)/gi);
      if (tableMatches) {
        const tables = tableMatches.map(match => match.split(/\s+/)[1]);
        await redisCache.invalidateByTags(tables);
      }
    } catch (error) {
      logger.warn('Query cache invalidation failed:', error);
    }
  }
}

// Enhanced Prisma client with proper async initialization
const enhancedPrisma = new EnhancedPrismaClient(basePrisma);

// Re-enable Enhanced Prisma client
const prisma = enhancedPrisma;

// Database connection handler - connection will happen lazily on first query

// Graceful shutdown with cleanup
process.on('beforeExit', async () => {
  try {
    const promises = [basePrisma.$disconnect().catch(() => {})];
    if (redisCache && typeof redisCache.close === 'function') {
      promises.push(redisCache.close().catch(() => {}));
    }
    await Promise.allSettled(promises);
    logger.info('Database connections closed gracefully');
  } catch (error) {
    logger.warn('Cleanup warning:', error);
  }
});

// CommonJS exports
module.exports = { 
  prisma, 
  basePrisma, 
  enhancedPrisma, 
  EnhancedPrismaClient 
};
module.exports.default = prisma;