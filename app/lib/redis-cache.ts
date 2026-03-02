/**
 * Redis Caching Layer
 * Performance optimization for analytics and usage data
 * Gracefully degrades when Redis is unavailable
 */

import { Redis } from 'ioredis';
import { logger } from '@/lib/logger';

let redis: Redis | null = null;
let redisAvailable = false;

try {
  redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  redis.on('connect', () => {
    redisAvailable = true;
    logger.info('Redis connected');
  });

  redis.on('error', (err) => {
    if (redisAvailable) {
      logger.warn('Redis connection lost', { error: String(err) });
    }
    redisAvailable = false;
  });

  redis.on('close', () => {
    redisAvailable = false;
  });

  // Attempt initial connection
  redis.connect().catch(() => {
    logger.warn('Redis not available — caching disabled');
    redisAvailable = false;
  });
} catch {
  logger.warn('Redis initialization failed — caching disabled');
}

export class CacheService {
  private static TTL = {
    ANALYTICS: 300, // 5 minutes
    USAGE_STATS: 60,  // 1 minute
    USER_QUOTA: 30,   // 30 seconds
  };

  static isAvailable(): boolean {
    return redisAvailable && redis !== null;
  }

  static async get<T>(key: string): Promise<T | null> {
    if (!this.isAvailable()) return null;
    try {
      const data = await redis!.get(key);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  }

  static async set(key: string, data: any, ttl: number): Promise<void> {
    if (!this.isAvailable()) return;
    try {
      await redis!.setex(key, ttl, JSON.stringify(data));
    } catch (error) {
      logger.error('Cache set error', { error: String(error) });
    }
  }

  static async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached) return cached;

    const data = await fetcher();
    await this.set(key, data, ttl);
    return data;
  }

  // Analytics caching
  static async getAnalytics(userId: string, timeRange: string, model?: string) {
    const key = `analytics:${userId}:${timeRange}:${model || 'all'}`;
    return this.get(key);
  }

  static async setAnalytics(userId: string, timeRange: string, data: any, model?: string) {
    const key = `analytics:${userId}:${timeRange}:${model || 'all'}`;
    return this.set(key, data, this.TTL.ANALYTICS);
  }

  // Usage stats caching
  static async getUserStats(userId: string) {
    return this.getOrSet(
      `stats:${userId}`,
      () => this.fetchUserStats(userId),
      this.TTL.USAGE_STATS
    );
  }

  private static async fetchUserStats(userId: string) {
    // This would be implemented with actual database queries
    return { requests: 0, tokens: 0, cost: 0 };
  }
}
