// PostgreSQL Database Optimization
// Enterprise-grade connection pooling, query optimization, and performance monitoring

import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';

// Pool library (dynamically imported)
let Pool: any = null;
let DatabasePool: any = null;

try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (error) {
  logger.warn('pg module not available, using Prisma only');
}

interface DatabaseConfig {
  // Connection pooling
  maxConnections: number;
  minConnections: number;
  acquireTimeoutMs: number;
  createTimeoutMs: number;
  destroyTimeoutMs: number;
  idleTimeoutMs: number;
  reapIntervalMs: number;
  
  // Performance tuning
  statementTimeoutMs: number;
  queryTimeoutMs: number;
  connectionTimeoutMs: number;
  
  // Read replica configuration
  enableReadReplicas: boolean;
  readReplicaUrls: string[];
  readWriteRatio: number; // 0.8 means 80% reads go to replicas
  
  // Monitoring
  enableSlowQueryLog: boolean;
  slowQueryThresholdMs: number;
  enableQueryPlan: boolean;
  enableMetrics: boolean;
}

interface QueryMetrics {
  totalQueries: number;
  slowQueries: number;
  averageExecutionTime: number;
  queriesPerSecond: number;
  connectionPoolUtilization: number;
  cacheHitRate: number;
  errorRate: number;
  lastUpdated: Date;
}

interface SlowQuery {
  query: string;
  executionTime: number;
  timestamp: Date;
  userId?: string;
  endpoint?: string;
  stackTrace?: string;
}

interface ConnectionHealth {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  maxConnections: number;
  utilizationPercentage: number;
  averageWaitTime: number;
  errorCount: number;
  lastError?: Date;
}

export class DatabaseOptimizationService extends EventEmitter {
  private prisma!: PrismaClient;
  private readPool: any = null;
  private writePool: any = null;
  private readReplicaPools: any[] = [];
  
  private config: DatabaseConfig;
  private metrics: QueryMetrics;
  private slowQueries: SlowQuery[] = [];
  private metricsInterval: NodeJS.Timeout | null = null;
  
  // Query preparation cache
  private preparedStatements: Map<string, any> = new Map();
  private queryCache: Map<string, any> = new Map();
  
  constructor(config?: Partial<DatabaseConfig>) {
    super();
    
    this.config = {
      // Connection pooling defaults
      maxConnections: 100,
      minConnections: 10,
      acquireTimeoutMs: 60000,
      createTimeoutMs: 30000,
      destroyTimeoutMs: 5000,
      idleTimeoutMs: 300000, // 5 minutes
      reapIntervalMs: 1000,
      
      // Performance defaults
      statementTimeoutMs: 30000,
      queryTimeoutMs: 30000,
      connectionTimeoutMs: 10000,
      
      // Read replica defaults
      enableReadReplicas: false,
      readReplicaUrls: [],
      readWriteRatio: 0.8,
      
      // Monitoring defaults
      enableSlowQueryLog: true,
      slowQueryThresholdMs: 1000,
      enableQueryPlan: true,
      enableMetrics: true,
      
      ...config
    };

    this.metrics = {
      totalQueries: 0,
      slowQueries: 0,
      averageExecutionTime: 0,
      queriesPerSecond: 0,
      connectionPoolUtilization: 0,
      cacheHitRate: 0,
      errorRate: 0,
      lastUpdated: new Date()
    };

    // Defer initialization to avoid blocking module initialization (DISABLED to prevent hanging)
    setTimeout(() => {
      try {
        logger.info('Database optimization temporarily disabled to prevent startup delays');
        // this.initializePrisma();
        // this.initializeConnectionPools();
        // this.startMetricsCollection();
      } catch (error) {
        logger.error('Database optimization initialization failed:', error);
        // Continue without optimization features - server should still start
      }
    }, 200); // Delay to ensure module loading completes first
  }

  /**
   * Initialize Prisma with optimized configuration
   */
  private initializePrisma(): void {
    this.prisma = new PrismaClient({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'warn' },
        { emit: 'stdout', level: 'info' }
      ],
      datasources: {
        db: {
          url: this.buildOptimizedConnectionString()
        }
      }
    });

    // Query event logging (disabled due to type incompatibility)
    // this.prisma.$on('query', (e) => {
    //   this.handleQueryEvent(e);
    // });

    // this.prisma.$on('error', (e) => {
    //   this.handleErrorEvent(e);
    // });

    logger.info('Prisma initialized with optimized configuration');
  }

  /**
   * Initialize connection pools for read/write separation
   */
  private async initializeConnectionPools(): Promise<void> {
    if (!Pool) return;

    try {
      // Main write pool
      this.writePool = new Pool({
        connectionString: process.env.DATABASE_URL,
        max: this.config.maxConnections,
        min: this.config.minConnections,
        acquireTimeoutMs: this.config.acquireTimeoutMs,
        createTimeoutMs: this.config.createTimeoutMs,
        destroyTimeoutMs: this.config.destroyTimeoutMs,
        idleTimeoutMs: this.config.idleTimeoutMs,
        reapIntervalMs: this.config.reapIntervalMs,
        
        // PostgreSQL specific optimizations
        statement_timeout: this.config.statementTimeoutMs,
        query_timeout: this.config.queryTimeoutMs,
        connection_timeout: this.config.connectionTimeoutMs,
        
        // Performance tuning
        application_name: 'recoder-api',
        
        // Connection validation
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
      });

      // Read replica pools
      if (this.config.enableReadReplicas && this.config.readReplicaUrls.length > 0) {
        for (const replicaUrl of this.config.readReplicaUrls) {
          const replicaPool = new Pool({
            connectionString: replicaUrl,
            max: Math.floor(this.config.maxConnections * 0.6), // 60% of max for replicas
            min: Math.floor(this.config.minConnections * 0.6),
            acquireTimeoutMs: this.config.acquireTimeoutMs,
            createTimeoutMs: this.config.createTimeoutMs,
            destroyTimeoutMs: this.config.destroyTimeoutMs,
            idleTimeoutMs: this.config.idleTimeoutMs,
            reapIntervalMs: this.config.reapIntervalMs,
            
            // Read-only optimizations
            default_transaction_isolation: 'read committed',
            application_name: 'recoder-api-readonly'
          });

          this.readReplicaPools.push(replicaPool);
        }

        logger.info('Read replica pools initialized', { 
          replicas: this.config.readReplicaUrls.length 
        });
      }

      // Pool event handlers
      this.setupPoolEventHandlers();

      logger.info('Database connection pools initialized successfully');

    } catch (error) {
      logger.error('Failed to initialize connection pools:', error);
    }
  }

  /**
   * Build optimized connection string
   */
  private buildOptimizedConnectionString(): string {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) return '';

    const url = new URL(baseUrl);
    
    // Add performance optimizations to connection string
    const optimizations = [
      'pool_timeout=10',
      'connection_timeout=10',
      'statement_timeout=30000',
      'idle_in_transaction_session_timeout=60000',
      'tcp_keepalives_idle=300',
      'tcp_keepalives_interval=30',
      'tcp_keepalives_count=3',
      'application_name=recoder-prisma'
    ];

    // Append optimizations
    const existingParams = url.search;
    const newParams = existingParams ? 
      `${existingParams}&${optimizations.join('&')}` : 
      `?${optimizations.join('&')}`;
    
    return url.origin + url.pathname + newParams;
  }

  /**
   * Setup pool event handlers for monitoring
   */
  private setupPoolEventHandlers(): void {
    if (this.writePool) {
      this.writePool.on('connect', () => {
        logger.debug('New client connected to write pool');
      });

      this.writePool.on('error', (err: any) => {
        logger.error('Write pool error:', err);
        this.emit('poolError', { type: 'write', error: err });
      });

      this.writePool.on('remove', () => {
        logger.debug('Client removed from write pool');
      });
    }

    // Similar handlers for read replica pools
    this.readReplicaPools.forEach((pool, index) => {
      pool.on('error', (err: any) => {
        logger.error(`Read replica pool ${index} error:`, err);
        this.emit('poolError', { type: 'read', replica: index, error: err });
      });
    });
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    if (!this.config.enableMetrics) return;

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, 60000); // Collect every minute

    logger.info('Database metrics collection started');
  }

  /**
   * Execute optimized query with automatic read/write routing
   */
  async executeQuery<T = any>(
    query: string, 
    params: any[] = [], 
    options: {
      readOnly?: boolean;
      useCache?: boolean;
      cacheTtl?: number;
      userId?: string;
      endpoint?: string;
      prepared?: boolean;
    } = {}
  ): Promise<T> {
    const startTime = Date.now();
    const queryHash = this.generateQueryHash(query, params);

    try {
      // Check cache first
      if (options.useCache) {
        const cached = this.queryCache.get(queryHash);
        if (cached && cached.expiresAt > Date.now()) {
          this.updateCacheMetrics(true);
          return cached.result;
        }
      }

      // Route to appropriate pool
      const pool = this.selectPool(options.readOnly);
      let result: T;

      if (options.prepared && !this.preparedStatements.has(queryHash)) {
        // Prepare statement for reuse
        await this.prepareStatement(query, queryHash, pool);
      }

      // Execute query
      if (pool === this.prisma) {
        // Use Prisma for complex queries
        result = await this.executePrismaQuery(query, params);
      } else {
        // Use raw pool for performance-critical queries
        const client = await pool.connect();
        try {
          const queryResult = await client.query(query, params);
          result = queryResult.rows;
        } finally {
          client.release();
        }
      }

      // Cache result if enabled
      if (options.useCache && result) {
        this.cacheQueryResult(queryHash, result, options.cacheTtl || 300);
        this.updateCacheMetrics(false);
      }

      // Record metrics
      const executionTime = Date.now() - startTime;
      this.recordQueryMetrics(query, executionTime, true, options);

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.recordQueryMetrics(query, executionTime, false, options);
      
      logger.error('Query execution failed:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        query: query.substring(0, 100),
        executionTime,
        userId: options.userId,
        endpoint: options.endpoint
      });

      throw error;
    }
  }

  /**
   * Select appropriate connection pool
   */
  private selectPool(readOnly: boolean = false): any {
    // For writes, always use write pool or Prisma
    if (!readOnly) {
      return this.writePool || this.prisma;
    }

    // For reads, use replica if available and configured
    if (this.config.enableReadReplicas && this.readReplicaPools.length > 0) {
      if (Math.random() < this.config.readWriteRatio) {
        // Select random read replica for load balancing
        const replicaIndex = Math.floor(Math.random() * this.readReplicaPools.length);
        return this.readReplicaPools[replicaIndex];
      }
    }

    // Fallback to write pool or Prisma
    return this.writePool || this.prisma;
  }

  /**
   * Execute query through Prisma
   */
  private async executePrismaQuery<T>(query: string, params: any[]): Promise<T> {
    // This is a simplified implementation
    // In practice, you'd need to parse the query and route to appropriate Prisma method
    return await this.prisma.$queryRawUnsafe(query, ...params) as T;
  }

  /**
   * Prepare statement for reuse
   */
  private async prepareStatement(query: string, hash: string, pool: any): Promise<void> {
    if (pool === this.prisma) return; // Prisma handles this internally

    try {
      const client = await pool.connect();
      try {
        await client.query(`PREPARE stmt_${hash} AS ${query}`);
        this.preparedStatements.set(hash, true);
      } finally {
        client.release();
      }
    } catch (error) {
      logger.warn('Failed to prepare statement:', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Handle query events for monitoring
   */
  private handleQueryEvent(event: any): void {
    const executionTime = event.duration;
    
    // Log slow queries
    if (this.config.enableSlowQueryLog && executionTime >= this.config.slowQueryThresholdMs) {
      const slowQuery: SlowQuery = {
        query: event.query,
        executionTime,
        timestamp: new Date(),
        userId: event.params?.userId,
        endpoint: event.params?.endpoint
      };

      this.slowQueries.push(slowQuery);
      
      // Keep only last 100 slow queries
      if (this.slowQueries.length > 100) {
        this.slowQueries.shift();
      }

      logger.warn('Slow query detected', {
        query: event.query.substring(0, 100),
        executionTime,
        params: event.params
      });

      this.emit('slowQuery', slowQuery);
    }
  }

  /**
   * Handle error events
   */
  private handleErrorEvent(event: any): void {
    logger.error('Database error:', event);
    this.emit('databaseError', event);
  }

  /**
   * Record query metrics
   */
  private recordQueryMetrics(
    query: string, 
    executionTime: number, 
    success: boolean, 
    options: any
  ): void {
    this.metrics.totalQueries++;
    
    if (executionTime >= this.config.slowQueryThresholdMs) {
      this.metrics.slowQueries++;
    }

    if (!success) {
      this.metrics.errorRate = ((this.metrics.errorRate * (this.metrics.totalQueries - 1)) + 1) / this.metrics.totalQueries;
    }

    // Update average execution time (exponential moving average)
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * 0.95) + (executionTime * 0.05);
  }

  /**
   * Cache query result
   */
  private cacheQueryResult(hash: string, result: any, ttlSeconds: number): void {
    this.queryCache.set(hash, {
      result,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });

    // Clean up expired cache entries
    this.cleanupQueryCache();
  }

  /**
   * Update cache metrics
   */
  private updateCacheMetrics(hit: boolean): void {
    const total = this.metrics.totalQueries;
    if (hit) {
      this.metrics.cacheHitRate = ((this.metrics.cacheHitRate * (total - 1)) + 1) / total;
    } else {
      this.metrics.cacheHitRate = (this.metrics.cacheHitRate * (total - 1)) / total;
    }
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupQueryCache(): void {
    const now = Date.now();
    for (const [key, value] of this.queryCache) {
      if (value.expiresAt <= now) {
        this.queryCache.delete(key);
      }
    }

    // Limit cache size
    if (this.queryCache.size > 1000) {
      const entries = Array.from(this.queryCache.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      
      const toRemove = entries.slice(0, this.queryCache.size - 800);
      for (const [key] of toRemove) {
        this.queryCache.delete(key);
      }
    }
  }

  /**
   * Collect comprehensive metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      // Connection pool metrics
      if (this.writePool) {
        const poolInfo = {
          totalCount: this.writePool.totalCount,
          idleCount: this.writePool.idleCount,
          waitingCount: this.writePool.waitingCount
        };

        this.metrics.connectionPoolUtilization = 
          ((poolInfo.totalCount - poolInfo.idleCount) / this.config.maxConnections) * 100;
      }

      // Calculate queries per second
      const now = Date.now();
      const timeWindow = 60000; // 1 minute
      this.metrics.queriesPerSecond = this.metrics.totalQueries / (timeWindow / 1000);

      this.metrics.lastUpdated = new Date();

      this.emit('metricsCollected', this.metrics);

    } catch (error) {
      logger.error('Failed to collect metrics:', error);
    }
  }

  /**
   * Generate hash for query caching
   */
  private generateQueryHash(query: string, params: any[]): string {
    const combined = query + JSON.stringify(params);
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Database optimization methods
   */

  /**
   * Analyze and optimize database schema
   */
  async analyzePerformance(): Promise<{
    slowQueries: SlowQuery[];
    indexRecommendations: Array<{ table: string; columns: string[]; reason: string }>;
    connectionHealth: ConnectionHealth;
    tableStats: Array<{ table: string; size: string; rowCount: number }>;
  }> {
    try {
      // Get slow queries
      const slowQueries = [...this.slowQueries];

      // Analyze index usage
      const indexRecommendations = await this.analyzeIndexUsage();

      // Get connection health
      const connectionHealth = await this.getConnectionHealth();

      // Get table statistics
      const tableStats = await this.getTableStatistics();

      return {
        slowQueries,
        indexRecommendations,
        connectionHealth,
        tableStats
      };

    } catch (error) {
      logger.error('Performance analysis failed:', error);
      throw error;
    }
  }

  /**
   * Analyze index usage and recommend optimizations
   */
  private async analyzeIndexUsage(): Promise<Array<{ table: string; columns: string[]; reason: string }>> {
    const recommendations: any[] = [];

    try {
      // Query to find missing indexes
      const missingIndexQuery = `
        SELECT 
          schemaname,
          tablename,
          attname,
          n_distinct,
          correlation
        FROM pg_stats 
        WHERE schemaname = 'public'
        AND n_distinct > 10
        ORDER BY n_distinct DESC
        LIMIT 20
      `;

      const result = await this.executeQuery(missingIndexQuery, [], { readOnly: true });

      for (const row of result as any[]) {
        if (row.n_distinct > 100 && Math.abs(row.correlation) < 0.3) {
          recommendations.push({
            table: row.tablename,
            columns: [row.attname],
            reason: `High cardinality column (${row.n_distinct} distinct values) with low correlation`
          });
        }
      }

    } catch (error) {
      logger.warn('Index analysis failed:', error);
    }

    return recommendations;
  }

  /**
   * Get connection health status
   */
  private async getConnectionHealth(): Promise<ConnectionHealth> {
    try {
      let health: ConnectionHealth = {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: this.config.maxConnections,
        utilizationPercentage: 0,
        averageWaitTime: 0,
        errorCount: 0
      };

      if (this.writePool) {
        health.activeConnections = this.writePool.totalCount - this.writePool.idleCount;
        health.idleConnections = this.writePool.idleCount;
        health.totalConnections = this.writePool.totalCount;
        health.utilizationPercentage = (health.activeConnections / this.config.maxConnections) * 100;
      }

      return health;

    } catch (error) {
      logger.error('Failed to get connection health:', error);
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: this.config.maxConnections,
        utilizationPercentage: 0,
        averageWaitTime: 0,
        errorCount: 1
      };
    }
  }

  /**
   * Get table statistics
   */
  private async getTableStatistics(): Promise<Array<{ table: string; size: string; rowCount: number }>> {
    try {
      const query = `
        SELECT 
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_stat_get_tuples_returned(c.oid) as row_count
        FROM pg_tables pt
        JOIN pg_class c ON c.relname = pt.tablename
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 20
      `;

      const result = await this.executeQuery(query, [], { readOnly: true });
      
      return (result as any[]).map(row => ({
        table: row.tablename,
        size: row.size,
        rowCount: parseInt(row.row_count) || 0
      }));

    } catch (error) {
      logger.warn('Table statistics query failed:', error);
      return [];
    }
  }

  /**
   * Health check for database system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    prisma: boolean;
    writePool: boolean;
    readPools: boolean[];
    latency: number;
    connectionUtilization: number;
  }> {
    const startTime = Date.now();

    try {
      // Test Prisma connection
      let prismaHealthy = false;
      try {
        await this.prisma.$queryRaw`SELECT 1`;
        prismaHealthy = true;
      } catch (error) {
        logger.warn('Prisma health check failed:', error);
      }

      // Test write pool
      let writePoolHealthy = false;
      if (this.writePool) {
        try {
          const client = await this.writePool.connect();
          await client.query('SELECT 1');
          client.release();
          writePoolHealthy = true;
        } catch (error) {
          logger.warn('Write pool health check failed:', error);
        }
      }

      // Test read pools
      const readPoolHealth: any[] = [];
      for (const pool of this.readReplicaPools) {
        try {
          const client = await pool.connect();
          await client.query('SELECT 1');
          client.release();
          readPoolHealth.push(true);
        } catch (error) {
          readPoolHealth.push(false);
        }
      }

      const latency = Date.now() - startTime;
      const connectionUtilization = this.metrics.connectionPoolUtilization;

      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (!prismaHealthy && !writePoolHealthy) {
        status = 'unhealthy';
      } else if (connectionUtilization > 90 || latency > 1000) {
        status = 'degraded';
      }

      return {
        status,
        prisma: prismaHealthy,
        writePool: writePoolHealthy,
        readPools: readPoolHealth,
        latency,
        connectionUtilization
      };

    } catch (error) {
      logger.error('Database health check failed:', error);
      return {
        status: 'unhealthy',
        prisma: false,
        writePool: false,
        readPools: [],
        latency: Date.now() - startTime,
        connectionUtilization: 0
      };
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): QueryMetrics {
    return { ...this.metrics };
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 50): SlowQuery[] {
    return this.slowQueries.slice(-limit);
  }

  /**
   * Clear query cache
   */
  clearQueryCache(): void {
    this.queryCache.clear();
    logger.info('Query cache cleared');
  }

  /**
   * Optimize database settings
   */
  async optimizeSettings(): Promise<void> {
    try {
      // Apply session-level PostgreSQL optimizations (cloud database compatible)
      const sessionOptimizations = [
        "SET work_mem = '4MB'",
        "SET maintenance_work_mem = '64MB'",
        "SET random_page_cost = 1.1",
        "SET effective_io_concurrency = 200",
        "SET default_statistics_target = 100",
        "SET statement_timeout = '30s'",
        "SET lock_timeout = '10s'",
        "SET idle_in_transaction_session_timeout = '60s'"
      ];

      for (const optimization of sessionOptimizations) {
        try {
          await this.executeQuery(optimization);
          logger.debug('Applied database optimization:', optimization);
        } catch (error) {
          logger.warn('Session optimization setting failed:', {
            setting: optimization,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      logger.info('Database session optimization settings applied');

    } catch (error) {
      logger.error('Database optimization failed:', error);
    }
  }

  /**
   * Cleanup and shutdown
   */
  async close(): Promise<void> {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Close Prisma
    await this.prisma.$disconnect();

    // Close connection pools
    if (this.writePool) {
      await this.writePool.end();
    }

    for (const pool of this.readReplicaPools) {
      await pool.end();
    }

    this.queryCache.clear();
    this.preparedStatements.clear();

    logger.info('Database optimization service closed');
  }
}

// Export singleton instance
export const databaseOptimization = new DatabaseOptimizationService({
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '100'),
  minConnections: parseInt(process.env.DB_MIN_CONNECTIONS || '10'),
  enableReadReplicas: process.env.DB_READ_REPLICAS === 'true',
  readReplicaUrls: process.env.DB_READ_REPLICA_URLS?.split(',') || [],
  slowQueryThresholdMs: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '1000')
});