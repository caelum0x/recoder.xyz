// Redis Caching Layer
// Enterprise-grade caching for sub-100ms API responses and AI model optimization

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// Redis client (dynamically imported to avoid dependency issues)
let Redis: any = null;
let redisClient: any = null;

try {
  Redis = require('ioredis');
} catch (error) {
  logger.warn('Redis not available, using in-memory cache fallback');
}

interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache invalidation tags
  compress?: boolean; // Gzip compression for large values
  serialize?: boolean; // Custom serialization
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsage: number;
  avgResponseTime: number;
}

interface CacheEntry {
  value: any;
  createdAt: number;
  expiresAt: number;
  tags: string[];
  compressed: boolean;
  accessCount: number;
  lastAccessedAt: number;
}

export class RedisCacheService extends EventEmitter {
  private redis: any = null;
  private fallbackCache: Map<string, CacheEntry> = new Map();
  private isConnected: boolean = false;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalKeys: 0,
    memoryUsage: 0,
    avgResponseTime: 0
  };

  // Cache namespaces for different types of data
  private readonly namespaces = {
    API_RESPONSES: 'api:responses:',
    AI_RESULTS: 'ai:results:',
    EMBEDDINGS: 'embeddings:',
    SESSIONS: 'sessions:',
    RATE_LIMITS: 'rate:',
    ANALYTICS: 'analytics:',
    RAG_CONTEXT: 'rag:context:',
    CODE_ANALYSIS: 'code:analysis:',
    HEALTH_CHECKS: 'health:',
    USER_DATA: 'user:',
    VECTOR_QUERIES: 'vector:queries:'
  };
  getHealthStatus: any;

  constructor() {
    super();
    this.initializeRedis();
  }

  /**
   * Initialize Redis connection with fallback
   */
  private async initializeRedis(): Promise<void> {
    if (!Redis) {
      logger.warn('Redis not available, using in-memory fallback');
      return;
    }

    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD,
        db: parseInt(process.env.REDIS_DB || '0'),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableAutoPipelining: true,
        maxMemoryPolicy: 'allkeys-lru', // Evict least recently used keys
        keyPrefix: 'recoder:',
        compression: 'gzip' // Enable compression for large values
      });

      // Connection event handlers
      this.redis.on('connect', () => {
        this.isConnected = true;
        logger.info('Redis connected successfully');
        this.emit('connected');
      });

      this.redis.on('error', (error: any) => {
        this.isConnected = false;
        logger.error('Redis connection error:', error);
        this.emit('error', error);
      });

      this.redis.on('ready', () => {
        this.isConnected = true;
        logger.info('Redis ready for operations');
        this.configureRedis();
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        logger.warn('Redis connection closed');
        this.emit('disconnected');
      });

      // Connect to Redis
      await this.redis.connect();

    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Configure Redis for optimal performance
   */
  private async configureRedis(): Promise<void> {
    if (!this.redis) return;

    try {
      // Set Redis configuration for optimal performance
      await this.redis.config('SET', 'maxmemory-policy', 'allkeys-lru');
      await this.redis.config('SET', 'tcp-keepalive', '60');
      await this.redis.config('SET', 'timeout', '0');

      // Set up key expiration notifications
      await this.redis.config('SET', 'notify-keyspace-events', 'Ex');

      logger.info('Redis configured for optimal performance');

    } catch (error) {
      logger.warn('Failed to configure Redis:', error);
    }
  }

  /**
   * Get value from cache with performance tracking
   */
  async get<T = any>(key: string, namespace?: string): Promise<T | null> {
    const startTime = Date.now();
    const fullKey = this.buildKey(key, namespace);

    try {
      let result = null;

      if (this.redis && this.isConnected) {
        // Get from Redis
        const cached = await this.redis.get(fullKey);
        if (cached) {
          result = this.deserialize(cached);
        }
      } else {
        // Fallback to in-memory cache
        const entry = this.fallbackCache.get(fullKey);
        if (entry && entry.expiresAt > Date.now()) {
          entry.accessCount++;
          entry.lastAccessedAt = Date.now();
          result = entry.value;
        } else if (entry) {
          this.fallbackCache.delete(fullKey);
        }
      }

      // Update statistics
      this.updateStats(startTime, result !== null);

      if (result !== null) {
        this.emit('cacheHit', { key: fullKey, namespace });
      } else {
        this.emit('cacheMiss', { key: fullKey, namespace });
      }

      return result;

    } catch (error) {
      logger.error('Cache get error:', error);
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache with advanced options
   */
  async set(key: string, value: any, options: CacheOptions = {}, namespace?: string): Promise<boolean> {
    const startTime = Date.now();
    const fullKey = this.buildKey(key, namespace);
    const ttl = options.ttl || 3600; // Default 1 hour

    try {
      const serializedValue = this.serialize(value, options.compress);

      if (this.redis && this.isConnected) {
        // Set in Redis with TTL
        await this.redis.setex(fullKey, ttl, serializedValue);

        // Set tags for cache invalidation
        if (options.tags && options.tags.length > 0) {
          await this.setTags(fullKey, options.tags);
        }

      } else {
        // Fallback to in-memory cache
        const entry: CacheEntry = {
          value,
          createdAt: Date.now(),
          expiresAt: Date.now() + (ttl * 1000),
          tags: options.tags || [],
          compressed: options.compress || false,
          accessCount: 0,
          lastAccessedAt: Date.now()
        };

        this.fallbackCache.set(fullKey, entry);

        // Clean up expired entries periodically
        this.cleanupFallbackCache();
      }

      this.emit('cacheSet', { 
        key: fullKey, 
        namespace, 
        ttl, 
        size: this.getValueSize(serializedValue) 
      });

      logger.debug('Cache set successful', { 
        key: fullKey, 
        ttl, 
        time: Date.now() - startTime 
      });

      return true;

    } catch (error) {
      logger.error('Cache set error:', error);
      return false;
    }
  }

  /**
   * Delete from cache
   */
  async del(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(key, namespace);

    try {
      if (this.redis && this.isConnected) {
        await this.redis.del(fullKey);
        await this.removeTags(fullKey);
      } else {
        this.fallbackCache.delete(fullKey);
      }

      this.emit('cacheDelete', { key: fullKey, namespace });
      return true;

    } catch (error) {
      logger.error('Cache delete error:', error);
      return false;
    }
  }

  /**
   * Check if key exists in cache
   */
  async exists(key: string, namespace?: string): Promise<boolean> {
    const fullKey = this.buildKey(key, namespace);

    try {
      if (this.redis && this.isConnected) {
        const result = await this.redis.exists(fullKey);
        return result === 1;
      } else {
        const entry = this.fallbackCache.get(fullKey);
        return entry !== undefined && entry.expiresAt > Date.now();
      }
    } catch (error) {
      logger.error('Cache exists error:', error);
      return false;
    }
  }

  /**
   * Increment counter (useful for rate limiting)
   */
  async incr(key: string, namespace?: string, ttl?: number): Promise<number> {
    const fullKey = this.buildKey(key, namespace);

    try {
      if (this.redis && this.isConnected) {
        const result = await this.redis.incr(fullKey);
        if (ttl && result === 1) {
          await this.redis.expire(fullKey, ttl);
        }
        return result;
      } else {
        // Fallback implementation
        const entry = this.fallbackCache.get(fullKey);
        const currentValue = entry ? (entry.value as number) : 0;
        const newValue = currentValue + 1;
        
        await this.set(key, newValue, { ttl: ttl || 3600 }, namespace);
        return newValue;
      }
    } catch (error) {
      logger.error('Cache incr error:', error);
      return 0;
    }
  }

  /**
   * Get multiple keys at once (pipeline operation)
   */
  async mget(keys: string[], namespace?: string): Promise<Array<any | null>> {
    const fullKeys = keys.map(key => this.buildKey(key, namespace));

    try {
      if (this.redis && this.isConnected) {
        const results = await this.redis.mget(fullKeys);
        return results.map((result: string | null) => 
          result ? this.deserialize(result) : null
        );
      } else {
        // Fallback implementation
        return fullKeys.map(fullKey => {
          const entry = this.fallbackCache.get(fullKey);
          if (entry && entry.expiresAt > Date.now()) {
            entry.accessCount++;
            entry.lastAccessedAt = Date.now();
            return entry.value;
          }
          return null;
        });
      }
    } catch (error) {
      logger.error('Cache mget error:', error);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple keys at once (pipeline operation)
   */
  async mset(keyValuePairs: Array<{ key: string; value: any; options?: CacheOptions }>, namespace?: string): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        const pipeline = this.redis.pipeline();
        
        for (const { key, value, options = {} } of keyValuePairs) {
          const fullKey = this.buildKey(key, namespace);
          const serializedValue = this.serialize(value, options.compress);
          const ttl = options.ttl || 3600;
          
          pipeline.setex(fullKey, ttl, serializedValue);
        }
        
        await pipeline.exec();
      } else {
        // Fallback implementation
        for (const { key, value, options = {} } of keyValuePairs) {
          await this.set(key, value, options, namespace);
        }
      }

      this.emit('cacheMSet', { count: keyValuePairs.length, namespace });
      return true;

    } catch (error) {
      logger.error('Cache mset error:', error);
      return false;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    let invalidatedCount = 0;

    try {
      if (this.redis && this.isConnected) {
        for (const tag of tags) {
          const tagKey = `tags:${tag}`;
          const keys = await this.redis.smembers(tagKey);
          
          if (keys.length > 0) {
            await this.redis.del(...keys);
            await this.redis.del(tagKey);
            invalidatedCount += keys.length;
          }
        }
      } else {
        // Fallback implementation
        for (const [key, entry] of this.fallbackCache) {
          if (entry.tags.some(tag => tags.includes(tag))) {
            this.fallbackCache.delete(key);
            invalidatedCount++;
          }
        }
      }

      this.emit('cacheInvalidated', { tags, count: invalidatedCount });
      logger.info('Cache invalidated by tags', { tags, count: invalidatedCount });

    } catch (error) {
      logger.error('Cache invalidation error:', error);
    }

    return invalidatedCount;
  }

  /**
   * Flush entire cache namespace
   */
  async flush(namespace?: string): Promise<boolean> {
    try {
      if (this.redis && this.isConnected) {
        if (namespace) {
          const pattern = this.buildKey('*', namespace);
          const keys = await this.redis.keys(pattern);
          if (keys.length > 0) {
            await this.redis.del(...keys);
          }
        } else {
          await this.redis.flushdb();
        }
      } else {
        if (namespace) {
          const prefix = this.buildKey('', namespace);
          for (const key of this.fallbackCache.keys()) {
            if (key.startsWith(prefix)) {
              this.fallbackCache.delete(key);
            }
          }
        } else {
          this.fallbackCache.clear();
        }
      }

      this.emit('cacheFlush', { namespace });
      logger.info('Cache flushed', { namespace });
      return true;

    } catch (error) {
      logger.error('Cache flush error:', error);
      return false;
    }
  }

  /**
   * Get cache statistics and performance metrics
   */
  async getStats(): Promise<CacheStats> {
    try {
      if (this.redis && this.isConnected) {
        const info = await this.redis.info('memory');
        const keyspace = await this.redis.info('keyspace');
        
        // Parse Redis info
        const memoryMatch = info.match(/used_memory:(\d+)/);
        const memoryUsage = memoryMatch ? parseInt(memoryMatch[1]) : 0;
        
        const keyspaceMatch = keyspace.match(/keys=(\d+)/);
        const totalKeys = keyspaceMatch ? parseInt(keyspaceMatch[1]) : 0;

        this.stats.memoryUsage = memoryUsage;
        this.stats.totalKeys = totalKeys;
        this.stats.hitRate = this.stats.hits / Math.max(this.stats.hits + this.stats.misses, 1) * 100;

      } else {
        // Fallback stats
        this.stats.totalKeys = this.fallbackCache.size;
        this.stats.memoryUsage = this.estimateFallbackMemoryUsage();
        this.stats.hitRate = this.stats.hits / Math.max(this.stats.hits + this.stats.misses, 1) * 100;
      }

      return { ...this.stats };

    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return this.stats;
    }
  }

  /**
   * Health check for cache system
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    redis: boolean;
    fallback: boolean;
    latency: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Test Redis connection
      let redisHealthy = false;
      if (this.redis && this.isConnected) {
        await this.redis.ping();
        redisHealthy = true;
      }

      // Test fallback cache
      const testKey = 'health:check:' + Date.now();
      await this.set(testKey, 'ok', { ttl: 10 });
      const testValue = await this.get(testKey);
      const fallbackHealthy = testValue === 'ok';
      await this.del(testKey);

      const latency = Date.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (!redisHealthy && !fallbackHealthy) {
        status = 'unhealthy';
      } else if (!redisHealthy) {
        status = 'degraded';
      }

      return {
        status,
        redis: redisHealthy,
        fallback: fallbackHealthy,
        latency
      };

    } catch (error) {
      logger.error('Cache health check failed:', error);
      return {
        status: 'unhealthy',
        redis: false,
        fallback: false,
        latency: Date.now() - startTime
      };
    }
  }

  /**
   * Cache warming for frequently accessed data
   */
  async warmCache(entries: Array<{ key: string; value: any; options?: CacheOptions; namespace?: string }>): Promise<void> {
    logger.info('Starting cache warm-up', { entries: entries.length });

    const promises = entries.map(({ key, value, options, namespace }) =>
      this.set(key, value, options, namespace)
    );

    await Promise.allSettled(promises);
    
    this.emit('cacheWarmed', { count: entries.length });
    logger.info('Cache warm-up completed');
  }

  /**
   * Private helper methods
   */
  private buildKey(key: string, namespace?: string): string {
    const ns = namespace ? this.namespaces[namespace as keyof typeof this.namespaces] || namespace + ':' : '';
    return ns + key;
  }

  private serialize(value: any, compress: boolean = false): string {
    try {
      let serialized = JSON.stringify(value);
      
      if (compress && serialized.length > 1024) {
        // Use compression for large values (would need zlib)
        // For now, just return serialized string
      }
      
      return serialized;
    } catch (error) {
      logger.error('Serialization error:', error);
      return '{}';
    }
  }

  private deserialize(value: string): any {
    try {
      return JSON.parse(value);
    } catch (error) {
      logger.error('Deserialization error:', error);
      return null;
    }
  }

  private getValueSize(value: string): number {
    return Buffer.byteLength(value, 'utf8');
  }

  private updateStats(startTime: number, hit: boolean): void {
    const responseTime = Date.now() - startTime;
    
    if (hit) {
      this.stats.hits++;
    } else {
      this.stats.misses++;
    }

    // Calculate rolling average response time
    this.stats.avgResponseTime = (this.stats.avgResponseTime * 0.9) + (responseTime * 0.1);
  }

  private async setTags(key: string, tags: string[]): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    for (const tag of tags) {
      await this.redis.sadd(`tags:${tag}`, key);
    }
  }

  private async removeTags(key: string): Promise<void> {
    if (!this.redis || !this.isConnected) return;

    // This is a simplified implementation
    // In production, you'd want to track which tags belong to which keys
  }

  private cleanupFallbackCache(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.fallbackCache) {
      if (entry.expiresAt <= now) {
        this.fallbackCache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired cache entries', { count: cleaned });
    }

    // Limit memory usage - remove least recently used items if cache is too large
    if (this.fallbackCache.size > 10000) {
      const entries = Array.from(this.fallbackCache.entries())
        .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
      
      const toRemove = entries.slice(0, this.fallbackCache.size - 8000);
      for (const [key] of toRemove) {
        this.fallbackCache.delete(key);
      }
    }
  }

  private estimateFallbackMemoryUsage(): number {
    let total = 0;
    for (const [key, entry] of this.fallbackCache) {
      total += key.length * 2; // UTF-16 encoding
      total += JSON.stringify(entry.value).length * 2;
      total += 200; // Estimated overhead per entry
    }
    return total;
  }

  /**
   * Specialized caching methods for different data types
   */

  // API Response Caching
  async cacheApiResponse(endpoint: string, params: any, response: any, ttl: number = 300): Promise<void> {
    const key = this.generateApiCacheKey(endpoint, params);
    await this.set(key, response, { ttl, tags: ['api', endpoint] }, 'API_RESPONSES');
  }

  async getCachedApiResponse(endpoint: string, params: any): Promise<any> {
    const key = this.generateApiCacheKey(endpoint, params);
    return await this.get(key, 'API_RESPONSES');
  }

  // AI Results Caching
  async cacheAiResult(prompt: string, provider: string, model: string, result: any, ttl: number = 3600): Promise<void> {
    const key = this.generateAiCacheKey(prompt, provider, model);
    await this.set(key, result, { ttl, tags: ['ai', provider, model] }, 'AI_RESULTS');
  }

  async getCachedAiResult(prompt: string, provider: string, model: string): Promise<any> {
    const key = this.generateAiCacheKey(prompt, provider, model);
    return await this.get(key, 'AI_RESULTS');
  }

  // Embedding Caching
  async cacheEmbedding(content: string, model: string, embedding: number[], ttl: number = 86400): Promise<void> {
    const key = this.generateEmbeddingCacheKey(content, model);
    await this.set(key, embedding, { ttl, tags: ['embeddings', model], compress: true }, 'EMBEDDINGS');
  }

  async getCachedEmbedding(content: string, model: string): Promise<number[] | null> {
    const key = this.generateEmbeddingCacheKey(content, model);
    return await this.get(key, 'EMBEDDINGS');
  }

  // Session Caching
  async cacheSession(sessionId: string, sessionData: any, ttl: number = 3600): Promise<void> {
    await this.set(sessionId, sessionData, { ttl, tags: ['session'] }, 'SESSIONS');
  }

  async getCachedSession(sessionId: string): Promise<any> {
    return await this.get(sessionId, 'SESSIONS');
  }

  // Rate Limiting
  async incrementRateLimit(identifier: string, windowSeconds: number): Promise<number> {
    return await this.incr(identifier, 'RATE_LIMITS', windowSeconds);
  }

  async getRateLimit(identifier: string): Promise<number> {
    const count = await this.get(identifier, 'RATE_LIMITS');
    return count || 0;
  }

  /**
   * Cache key generators
   */
  private generateApiCacheKey(endpoint: string, params: any): string {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    return `${endpoint}:${this.hashString(paramString)}`;
  }

  private generateAiCacheKey(prompt: string, provider: string, model: string): string {
    const combined = `${provider}:${model}:${prompt}`;
    return this.hashString(combined);
  }

  private generateEmbeddingCacheKey(content: string, model: string): string {
    return `${model}:${this.hashString(content)}`;
  }

  private hashString(str: string): string {
    // Simple hash function for cache keys
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Cleanup and shutdown
   */
  async close(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
    this.fallbackCache.clear();
    logger.info('Redis cache service closed');
  }
}

// Export singleton instance
export const redisCache = new RedisCacheService();