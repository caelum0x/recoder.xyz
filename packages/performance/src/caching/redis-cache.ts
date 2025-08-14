/**
 * Production Redis Cache Implementation for Recoder.xyz
 * High-performance caching with Redis, fallback mechanisms, and monitoring
 */

import { EventEmitter } from 'events';

// Interface for both redis and ioredis compatibility
interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: string, duration?: number): Promise<string | null>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
  ttl(key: string): Promise<number>;
  flushdb(): Promise<string>;
  quit(): Promise<string>;
  ping(): Promise<string>;
  info(section?: string): Promise<string>;
}

export interface CacheOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;
  enableFallback?: boolean;
  maxMemoryPolicy?: string;
  connectTimeout?: number;
  retryDelayOnFailover?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  operations: number;
  errors: number;
  connected: boolean;
  memoryUsage?: number;
  keyCount?: number;
  lastUpdate: Date;
}

export interface CacheEntry<T = any> {
  value: T;
  ttl?: number;
  tags?: string[];
  compressed?: boolean;
}

export class RedisCache extends EventEmitter {
  private client: RedisClient | null = null;
  private isConnected = false;
  private fallbackCache = new Map<string, { value: any; expires: number }>();
  private stats: CacheStats;
  private config: Required<CacheOptions>;

  constructor(url?: string, options: CacheOptions = {}) {
    super();
    
    this.config = {
      url: url || 'redis://localhost:6379',
      host: 'localhost',
      port: 6379,
      password: '',
      db: 0,
      keyPrefix: 'recoder:',
      defaultTTL: 3600, // 1 hour
      enableFallback: true,
      maxMemoryPolicy: 'allkeys-lru',
      connectTimeout: 5000,
      retryDelayOnFailover: 1000,
      ...options
    };

    this.stats = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      operations: 0,
      errors: 0,
      connected: false,
      lastUpdate: new Date()
    };
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    try {
      // Try to load ioredis first, then fall back to redis
      let Redis;
      try {
        Redis = require('ioredis');
        this.client = new Redis(this.config.url, {
          connectTimeout: this.config.connectTimeout,
          retryDelayOnFailover: this.config.retryDelayOnFailover,
          maxRetriesPerRequest: 3,
          keyPrefix: this.config.keyPrefix
        });
      } catch (ioredisError) {
        // Fallback to redis package
        try {
          const redis = require('redis');
          this.client = redis.createClient({
            url: this.config.url,
            socket: {
              connectTimeout: this.config.connectTimeout
            }
          });
          await (this.client as any).connect();
        } catch (redisError) {
          throw new Error(`Failed to load Redis clients: ${ioredisError}, ${redisError}`);
        }
      }

      // Test connection
      if (this.client) {
        await this.client.ping();
      }
      this.isConnected = true;
      this.stats.connected = true;

      console.log('✅ Redis Cache connected successfully');
      this.emit('connected');

      // Set up error handling
      this.setupErrorHandling();

    } catch (error) {
      console.warn('⚠️ Redis connection failed, using fallback cache:', error);
      
      if (this.config.enableFallback) {
        this.isConnected = false;
        this.stats.connected = false;
        this.emit('fallback', error);
      } else {
        throw error;
      }
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    try {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
      this.stats.connected = false;
      
      console.log('✅ Redis Cache disconnected');
      this.emit('disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting from Redis:', error);
      this.stats.errors++;
    }
  }

  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    this.stats.operations++;

    try {
      let value: string | null = null;

      if (this.isConnected && this.client) {
        value = await this.client.get(this.formatKey(key));
      } else if (this.config.enableFallback) {
        value = this.getFallback(key);
      }

      if (value !== null) {
        this.stats.hits++;
        try {
          const parsed = JSON.parse(value);
          this.updateHitRate();
          return parsed.value;
        } catch (parseError) {
          // Return raw value if not JSON
          this.updateHitRate();
          return value as T;
        }
      } else {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      this.handleError('get', error, key);
      
      // Try fallback
      if (this.config.enableFallback) {
        const fallbackValue = this.getFallback(key);
        return fallbackValue ? JSON.parse(fallbackValue).value : null;
      }
      
      return null;
    }
  }

  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<boolean> {
    this.stats.operations++;

    try {
      const entry: CacheEntry<T> = { value };
      const serialized = JSON.stringify(entry);
      const effectiveTTL = ttl ?? this.config.defaultTTL;

      if (this.isConnected && this.client) {
        const result = await this.client.set(
          this.formatKey(key),
          serialized,
          'EX',
          effectiveTTL
        );
        
        if (this.config.enableFallback) {
          this.setFallback(key, serialized, effectiveTTL);
        }
        
        return result === 'OK';
      } else if (this.config.enableFallback) {
        this.setFallback(key, serialized, effectiveTTL);
        return true;
      }

      return false;
    } catch (error) {
      this.stats.errors++;
      this.handleError('set', error, key);
      
      // Try fallback
      if (this.config.enableFallback) {
        const entry: CacheEntry<T> = { value };
        this.setFallback(key, JSON.stringify(entry), ttl ?? this.config.defaultTTL);
        return true;
      }
      
      return false;
    }
  }

  /**
   * Delete key from cache
   */
  async del(key: string): Promise<boolean> {
    this.stats.operations++;

    try {
      let deleted = 0;

      if (this.isConnected && this.client) {
        deleted = await this.client.del(this.formatKey(key));
      }
      
      if (this.config.enableFallback) {
        this.delFallback(key);
      }

      return deleted > 0;
    } catch (error) {
      this.stats.errors++;
      this.handleError('del', error, key);
      
      if (this.config.enableFallback) {
        this.delFallback(key);
        return true;
      }
      
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    this.stats.operations++;

    try {
      if (this.isConnected && this.client) {
        const result = await this.client.exists(this.formatKey(key));
        return result > 0;
      } else if (this.config.enableFallback) {
        return this.fallbackCache.has(key);
      }
      
      return false;
    } catch (error) {
      this.stats.errors++;
      this.handleError('exists', error, key);
      
      if (this.config.enableFallback) {
        return this.fallbackCache.has(key);
      }
      
      return false;
    }
  }

  /**
   * Set TTL for existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    this.stats.operations++;

    try {
      if (this.isConnected && this.client) {
        const result = await this.client.expire(this.formatKey(key), seconds);
        return result === 1;
      }
      
      return false;
    } catch (error) {
      this.stats.errors++;
      this.handleError('expire', error, key);
      return false;
    }
  }

  /**
   * Get TTL for key
   */
  async ttl(key: string): Promise<number> {
    this.stats.operations++;

    try {
      if (this.isConnected && this.client) {
        return await this.client.ttl(this.formatKey(key));
      }
      
      // Check fallback cache TTL
      const entry = this.fallbackCache.get(key);
      if (entry) {
        const remaining = entry.expires - Date.now();
        return Math.max(0, Math.floor(remaining / 1000));
      }
      
      return -1;
    } catch (error) {
      this.stats.errors++;
      this.handleError('ttl', error, key);
      return -1;
    }
  }

  /**
   * Clear all cache data
   */
  async clear(): Promise<boolean> {
    this.stats.operations++;

    try {
      if (this.isConnected && this.client) {
        await this.client.flushdb();
      }
      
      this.fallbackCache.clear();
      return true;
    } catch (error) {
      this.stats.errors++;
      this.handleError('clear', error);
      
      // Always clear fallback
      this.fallbackCache.clear();
      return true;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    this.updateHitRate();
    this.stats.lastUpdate = new Date();
    return { ...this.stats };
  }

  /**
   * Get health status
   */
  async getHealthStatus() {
    try {
      let connected = false;
      let responseTime = 0;

      if (this.client) {
        const start = Date.now();
        await this.client.ping();
        responseTime = Date.now() - start;
        connected = true;
      }

      const stats = this.getStats();
      
      return {
        connected,
        responseTime,
        hitRate: stats.hitRate,
        operations: stats.operations,
        errors: stats.errors,
        fallbackActive: !connected && this.config.enableFallback,
        fallbackSize: this.fallbackCache.size
      };
    } catch (error) {
      return {
        connected: false,
        responseTime: -1,
        hitRate: this.stats.hitRate,
        operations: this.stats.operations,
        errors: this.stats.errors + 1,
        fallbackActive: this.config.enableFallback,
        fallbackSize: this.fallbackCache.size
      };
    }
  }

  // Private methods

  private formatKey(key: string): string {
    return this.config.keyPrefix + key;
  }

  private getFallback(key: string): string | null {
    const entry = this.fallbackCache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expires) {
      this.fallbackCache.delete(key);
      return null;
    }
    
    return entry.value;
  }

  private setFallback(key: string, value: string, ttl: number): void {
    const expires = Date.now() + (ttl * 1000);
    this.fallbackCache.set(key, { value, expires });
    
    // Limit fallback cache size
    if (this.fallbackCache.size > 1000) {
      const firstKey = this.fallbackCache.keys().next().value;
      if (firstKey) {
        this.fallbackCache.delete(firstKey);
      }
    }
  }

  private delFallback(key: string): void {
    this.fallbackCache.delete(key);
  }

  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;
  }

  private handleError(operation: string, error: any, key?: string): void {
    console.error(`❌ Redis ${operation} error${key ? ` for key ${key}` : ''}:`, error);
    this.emit('error', { operation, error, key });
    
    // Try to reconnect on connection errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      this.attemptReconnect();
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isConnected) return;
    
    try {
      console.log('🔄 Attempting Redis reconnection...');
      await this.connect();
    } catch (error) {
      console.warn('⚠️ Redis reconnection failed:', error);
      
      // Retry after delay
      setTimeout(() => {
        this.attemptReconnect();
      }, this.config.retryDelayOnFailover);
    }
  }

  private setupErrorHandling(): void {
    if (!this.client) return;

    // Handle Redis errors
    (this.client as any).on?.('error', (error: any) => {
      this.handleError('connection', error);
      this.isConnected = false;
      this.stats.connected = false;
    });

    (this.client as any).on?.('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
      this.emit('reconnecting');
    });

    (this.client as any).on?.('ready', () => {
      console.log('✅ Redis ready');
      this.isConnected = true;
      this.stats.connected = true;
      this.emit('ready');
    });
  }

  // Cleanup expired fallback entries periodically
  private cleanupFallback(): void {
    const now = Date.now();
    for (const [key, entry] of this.fallbackCache.entries()) {
      if (now > entry.expires) {
        this.fallbackCache.delete(key);
      }
    }
  }
}