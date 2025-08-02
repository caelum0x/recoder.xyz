/**
 * Redis Caching Layer
 * High-performance caching system for API responses, AI model outputs, and session data
 */

import Redis from 'ioredis';
import { EventEmitter } from 'events';
import crypto from 'crypto';

export interface CacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetries: number;
  retryDelayOnFailover: number;
  enableOfflineQueue: boolean;
  lazyConnect: boolean;
  connectTimeout: number;
  commandTimeout: number;
  maxRetriesPerRequest: number;
}

export interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  ttl: number;
  tags: string[];
  metadata: Record<string, any>;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  errors: number;
  hitRate: number;
  avgResponseTime: number;
  memoryUsage: number;
  keyCount: number;
}

export interface CachePattern {
  pattern: string;
  ttl: number;
  compress: boolean;
  tags: string[];
  invalidateOn: string[];
}

export class RedisCache extends EventEmitter {
  private client: Redis;
  private isConnected = false;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
    avgResponseTime: 0,
    memoryUsage: 0,
    keyCount: 0
  };
  private responseTimeBuffer: number[] = [];
  private patterns: Map<string, CachePattern> = new Map();

  constructor(private config: CacheConfig) {
    super();
    this.initializeClient();
    this.setupDefaultPatterns();
    this.startMetricsCollection();
  }

  /**
   * Initialize Redis client with clustering and failover support
   */
  private initializeClient(): void {
    this.client = new Redis({
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db || 0,
      keyPrefix: this.config.keyPrefix || 'recoder:',
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      retryDelayOnFailover: this.config.retryDelayOnFailover,
      enableOfflineQueue: this.config.enableOfflineQueue,
      lazyConnect: this.config.lazyConnect,
      connectTimeout: this.config.connectTimeout,
      commandTimeout: this.config.commandTimeout,
      family: 4,
      keepAlive: true,
      maxRetriesPerRequest: 3,
      reconnectOnError: (err) => {
        const targetError = 'READONLY';
        return err.message.includes(targetError);
      },
    });

    this.client.on('connect', () => {
      this.isConnected = true;
      this.emit('connected');
      console.log('✅ Redis cache connected');
    });

    this.client.on('error', (error) => {
      this.isConnected = false;
      this.metrics.errors++;
      this.emit('error', error);
      console.error('❌ Redis cache error:', error);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.emit('disconnected');
      console.log('🔌 Redis cache disconnected');
    });

    this.client.on('reconnecting', () => {
      console.log('🔄 Redis cache reconnecting...');
    });
  }

  /**
   * Setup default caching patterns for common use cases
   */
  private setupDefaultPatterns(): void {
    // AI Model Responses - Long TTL for stable outputs
    this.patterns.set('ai:*', {
      pattern: 'ai:*',
      ttl: 3600, // 1 hour
      compress: true,
      tags: ['ai', 'model'],
      invalidateOn: ['model-update', 'config-change']
    });

    // API Responses - Medium TTL
    this.patterns.set('api:*', {
      pattern: 'api:*',
      ttl: 300, // 5 minutes
      compress: true,
      tags: ['api', 'response'],
      invalidateOn: ['data-update']
    });

    // User Sessions - Long TTL
    this.patterns.set('session:*', {
      pattern: 'session:*',
      ttl: 86400, // 24 hours
      compress: false,
      tags: ['session', 'user'],
      invalidateOn: ['logout', 'security-change']
    });

    // Analytics Data - Medium TTL
    this.patterns.set('analytics:*', {
      pattern: 'analytics:*',
      ttl: 900, // 15 minutes
      compress: true,
      tags: ['analytics', 'metrics'],
      invalidateOn: ['data-refresh']
    });

    // Code Generation Results - Long TTL for expensive operations
    this.patterns.set('codegen:*', {
      pattern: 'codegen:*',
      ttl: 7200, // 2 hours
      compress: true,
      tags: ['codegen', 'ai'],
      invalidateOn: ['template-update']
    });

    // Database Query Results - Short TTL
    this.patterns.set('db:*', {
      pattern: 'db:*',
      ttl: 60, // 1 minute
      compress: true,
      tags: ['database', 'query'],
      invalidateOn: ['data-change']
    });
  }

  /**
   * Start metrics collection with periodic updates
   */
  private startMetricsCollection(): void {
    setInterval(async () => {
      try {
        await this.updateMetrics();
      } catch (error) {
        console.error('Failed to update cache metrics:', error);
      }
    }, 30000); // Update every 30 seconds
  }

  /**
   * Update internal metrics
   */
  private async updateMetrics(): Promise<void> {
    if (!this.isConnected) return;

    try {
      // Get memory info
      const memoryInfo = await this.client.memory('usage', 'samples', '1');
      this.metrics.memoryUsage = parseInt(memoryInfo.toString()) || 0;

      // Get key count
      const keyCount = await this.client.dbsize();
      this.metrics.keyCount = keyCount;

      // Calculate hit rate
      const total = this.metrics.hits + this.metrics.misses;
      this.metrics.hitRate = total > 0 ? (this.metrics.hits / total) * 100 : 0;

      // Calculate average response time
      if (this.responseTimeBuffer.length > 0) {
        const sum = this.responseTimeBuffer.reduce((a, b) => a + b, 0);
        this.metrics.avgResponseTime = sum / this.responseTimeBuffer.length;
        this.responseTimeBuffer = []; // Reset buffer
      }

      this.emit('metricsUpdated', this.metrics);
    } catch (error) {
      console.error('Failed to collect cache metrics:', error);
    }
  }

  /**
   * Get cache entry with performance tracking
   */
  async get<T = any>(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      if (!this.isConnected) {
        throw new Error('Redis cache not connected');
      }

      const result = await this.client.get(key);
      const responseTime = Date.now() - startTime;
      this.responseTimeBuffer.push(responseTime);

      if (result === null) {
        this.metrics.misses++;
        return null;
      }

      this.metrics.hits++;
      
      try {
        const entry: CacheEntry<T> = JSON.parse(result);
        
        // Check if entry has expired
        if (Date.now() > entry.timestamp + (entry.ttl * 1000)) {
          await this.delete(key);
          this.metrics.misses++;
          return null;
        }

        return entry.data;
      } catch (parseError) {
        // Handle non-JSON data
        return result as unknown as T;
      }
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set cache entry with automatic pattern detection
   */
  async set<T = any>(
    key: string, 
    data: T, 
    options: {
      ttl?: number;
      tags?: string[];
      metadata?: Record<string, any>;
      compress?: boolean;
    } = {}
  ): Promise<boolean> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis cache not connected');
      }

      // Find matching pattern
      const pattern = this.findPattern(key);
      const ttl = options.ttl || pattern?.ttl || 300; // Default 5 minutes
      const tags = options.tags || pattern?.tags || [];
      const compress = options.compress ?? pattern?.compress ?? false;

      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
        ttl,
        tags,
        metadata: options.metadata || {}
      };

      let serializedData = JSON.stringify(entry);

      // Compression for large payloads
      if (compress && serializedData.length > 1024) {
        const zlib = require('zlib');
        serializedData = zlib.gzipSync(serializedData).toString('base64');
        await this.client.setex(`${key}:compressed`, ttl, serializedData);
      } else {
        await this.client.setex(key, ttl, serializedData);
      }

      // Add to tags index for bulk invalidation
      for (const tag of tags) {
        await this.client.sadd(`tags:${tag}`, key);
        await this.client.expire(`tags:${tag}`, ttl + 300); // Tag index lives slightly longer
      }

      this.metrics.sets++;
      return true;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete cache entry
   */
  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.del(key);
      
      // Also try to delete compressed version
      await this.client.del(`${key}:compressed`);

      this.metrics.deletes++;
      return result > 0;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Bulk delete by pattern
   */
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(...keys);
      this.metrics.deletes += result;
      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache bulk delete error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      let totalDeleted = 0;
      
      for (const tag of tags) {
        const keys = await this.client.smembers(`tags:${tag}`);
        if (keys.length > 0) {
          const deleted = await this.client.del(...keys);
          totalDeleted += deleted;
        }
        
        // Clean up tag index
        await this.client.del(`tags:${tag}`);
      }

      this.metrics.deletes += totalDeleted;
      return totalDeleted;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache tag invalidation error:`, error);
      return 0;
    }
  }

  /**
   * Get or set pattern - useful for expensive operations
   */
  async getOrSet<T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options: {
      ttl?: number;
      tags?: string[];
      metadata?: Record<string, any>;
    } = {}
  ): Promise<T> {
    const cached = await this.get<T>(key);
    
    if (cached !== null) {
      return cached;
    }

    try {
      const data = await fetcher();
      await this.set(key, data, options);
      return data;
    } catch (error) {
      console.error(`Cache getOrSet error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Increment atomic counter
   */
  async increment(key: string, value: number = 1, ttl?: number): Promise<number> {
    try {
      if (!this.isConnected) {
        throw new Error('Redis cache not connected');
      }

      const result = await this.client.incrby(key, value);
      
      if (ttl && result === value) {
        // First time setting, apply TTL
        await this.client.expire(key, ttl);
      }

      return result;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache increment error for key ${key}:`, error);
      throw error;
    }
  }

  /**
   * Set with expiration using Unix timestamp
   */
  async setWithExpireAt(key: string, data: any, expireAt: Date): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const serializedData = JSON.stringify(data);
      const result = await this.client.set(key, serializedData, 'EXAT', Math.floor(expireAt.getTime() / 1000));
      
      this.metrics.sets++;
      return result === 'OK';
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache setWithExpireAt error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL for a key
   */
  async getTTL(key: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return -1;
      }

      return await this.client.ttl(key);
    } catch (error) {
      this.metrics.errors++;
      console.error(`Cache getTTL error for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Flush all cache data
   */
  async flush(): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      await this.client.flushdb();
      this.resetMetrics();
      return true;
    } catch (error) {
      this.metrics.errors++;
      console.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
      avgResponseTime: 0,
      memoryUsage: 0,
      keyCount: 0
    };
  }

  /**
   * Get cache health status
   */
  async getHealthStatus(): Promise<{
    connected: boolean;
    latency: number;
    memoryUsage: number;
    keyCount: number;
    hitRate: number;
    errors: number;
  }> {
    const startTime = Date.now();
    
    try {
      await this.client.ping();
      const latency = Date.now() - startTime;
      
      return {
        connected: this.isConnected,
        latency,
        memoryUsage: this.metrics.memoryUsage,
        keyCount: this.metrics.keyCount,
        hitRate: this.metrics.hitRate,
        errors: this.metrics.errors
      };
    } catch (error) {
      return {
        connected: false,
        latency: -1,
        memoryUsage: 0,
        keyCount: 0,
        hitRate: 0,
        errors: this.metrics.errors
      };
    }
  }

  /**
   * Find matching pattern for key
   */
  private findPattern(key: string): CachePattern | undefined {
    for (const [, pattern] of this.patterns) {
      const regex = new RegExp(pattern.pattern.replace(/\*/g, '.*'));
      if (regex.test(key)) {
        return pattern;
      }
    }
    return undefined;
  }

  /**
   * Add custom caching pattern
   */
  addPattern(name: string, pattern: CachePattern): void {
    this.patterns.set(name, pattern);
  }

  /**
   * Generate cache key with consistent hashing
   */
  static generateKey(prefix: string, ...parts: (string | number | object)[]): string {
    const keyParts = parts.map(part => 
      typeof part === 'object' ? JSON.stringify(part) : String(part)
    );
    
    const fullKey = [prefix, ...keyParts].join(':');
    
    // Hash long keys to prevent Redis key length issues
    if (fullKey.length > 250) {
      const hash = crypto.createHash('sha256').update(fullKey).digest('hex');
      return `${prefix}:${hash}`;
    }
    
    return fullKey;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.client.quit();
      this.isConnected = false;
      this.emit('closed');
    } catch (error) {
      console.error('Error closing Redis connection:', error);
    }
  }
}

// Default cache configuration
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB || '0'),
  keyPrefix: process.env.REDIS_PREFIX || 'recoder:',
  maxRetries: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  lazyConnect: true,
  connectTimeout: 10000,
  commandTimeout: 5000,
  maxRetriesPerRequest: 3
};

// Create singleton cache instance
export const redisCache = new RedisCache(DEFAULT_CACHE_CONFIG);

export default redisCache;