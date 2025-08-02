/**
 * Express Cache Middleware
 * Automatic caching for API responses with intelligent invalidation
 */

import { Request, Response, NextFunction } from 'express';
import { RedisCache, redisCache } from '../caching/redis-cache';
import crypto from 'crypto';

export interface CacheMiddlewareOptions {
  ttl?: number;
  keyGenerator?: (req: Request) => string;
  conditionalCache?: (req: Request, res: Response) => boolean;
  skipCache?: (req: Request) => boolean;
  tags?: string[] | ((req: Request) => string[]);
  varyBy?: string[];
  compressResponse?: boolean;
  cachePrivate?: boolean;
  invalidateOnMethods?: string[];
  customHeaders?: Record<string, string>;
}

export interface CacheableRequest extends Request {
  cacheKey?: string;
  skipCache?: boolean;
  cacheTags?: string[];
}

export class CacheMiddleware {
  constructor(private cache: RedisCache = redisCache) {}

  /**
   * Create cache middleware with options
   */
  create(options: CacheMiddlewareOptions = {}) {
    return async (req: CacheableRequest, res: Response, next: NextFunction) => {
      // Skip caching for non-GET requests by default
      if (req.method !== 'GET' && !options.invalidateOnMethods?.includes(req.method)) {
        return next();
      }

      // Skip cache if condition not met
      if (options.skipCache && options.skipCache(req)) {
        return next();
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(req, options.keyGenerator);
      req.cacheKey = cacheKey;

      // Get tags for this request
      const tags = this.getTags(req, options.tags);
      req.cacheTags = tags;

      // Handle cache invalidation for mutating methods
      if (options.invalidateOnMethods?.includes(req.method)) {
        await this.invalidateRelatedCache(req, tags);
        return next();
      }

      try {
        // Try to get from cache
        const cached = await this.cache.get(cacheKey);
        
        if (cached) {
          // Set cache headers
          this.setCacheHeaders(res, cached, true);
          
          // Return cached response
          return res.json(cached.data);
        }

        // Cache miss - intercept response
        this.interceptResponse(req, res, options, next);
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Intercept and cache response
   */
  private interceptResponse(
    req: CacheableRequest, 
    res: Response, 
    options: CacheMiddlewareOptions,
    next: NextFunction
  ) {
    const originalSend = res.send;
    const originalJson = res.json;
    
    // Override res.json to cache the response
    res.json = function(body: any) {
      // Only cache successful responses
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const shouldCache = !options.conditionalCache || options.conditionalCache(req, res);
        
        if (shouldCache && req.cacheKey) {
          const ttl = options.ttl || 300; // Default 5 minutes
          const tags = req.cacheTags || [];
          
          // Cache the response asynchronously
          setImmediate(async () => {
            try {
              await redisCache.set(req.cacheKey!, {
                data: body,
                headers: res.getHeaders(),
                statusCode: res.statusCode
              }, {
                ttl,
                tags,
                compress: options.compressResponse,
                metadata: {
                  url: req.originalUrl,
                  method: req.method,
                  userAgent: req.get('User-Agent'),
                  timestamp: new Date().toISOString()
                }
              });
            } catch (error) {
              console.error('Failed to cache response:', error);
            }
          });
        }
      }

      // Set cache headers for response
      setCacheHeaders(res, body, false, options);
      
      return originalJson.call(this, body);
    };

    // Override res.send as fallback
    res.send = function(body: any) {
      if (res.statusCode >= 200 && res.statusCode < 300 && req.cacheKey) {
        // Handle non-JSON responses
        const shouldCache = !options.conditionalCache || options.conditionalCache(req, res);
        
        if (shouldCache) {
          const ttl = options.ttl || 300;
          const tags = req.cacheTags || [];
          
          setImmediate(async () => {
            try {
              await redisCache.set(req.cacheKey!, {
                data: body,
                headers: res.getHeaders(),
                statusCode: res.statusCode
              }, { ttl, tags, compress: options.compressResponse });
            } catch (error) {
              console.error('Failed to cache response:', error);
            }
          });
        }
      }

      setCacheHeaders(res, body, false, options);
      return originalSend.call(this, body);
    };

    next();
  }

  /**
   * Generate cache key for request
   */
  private generateCacheKey(req: Request, keyGenerator?: (req: Request) => string): string {
    if (keyGenerator) {
      return keyGenerator(req);
    }

    // Default key generation
    const parts = [
      'api',
      req.method,
      req.route?.path || req.path,
      req.query ? JSON.stringify(req.query) : '',
      req.get('Accept') || '',
      req.get('Authorization') ? 'auth' : 'noauth'
    ].filter(Boolean);

    return RedisCache.generateKey('response', ...parts);
  }

  /**
   * Get tags for request
   */
  private getTags(req: Request, tags?: string[] | ((req: Request) => string[])): string[] {
    if (typeof tags === 'function') {
      return tags(req);
    }
    
    if (Array.isArray(tags)) {
      return tags;
    }

    // Default tags based on route
    const defaultTags = ['api'];
    
    if (req.route?.path) {
      defaultTags.push(`route:${req.route.path.split('/')[1]}`);
    }
    
    if (req.user?.id) {
      defaultTags.push(`user:${req.user.id}`);
    }

    return defaultTags;
  }

  /**
   * Invalidate related cache entries
   */
  private async invalidateRelatedCache(req: Request, tags: string[]): Promise<void> {
    try {
      // Invalidate by tags
      await this.cache.invalidateByTags(tags);
      
      // Invalidate specific patterns for this resource
      if (req.route?.path) {
        const basePath = req.route.path.split('/')[1];
        await this.cache.deleteByPattern(`api:*:${basePath}:*`);
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  /**
   * Set appropriate cache headers
   */
  private setCacheHeaders(
    res: Response, 
    cached: any, 
    isFromCache: boolean, 
    options?: CacheMiddlewareOptions
  ): void {
    if (isFromCache) {
      res.set('X-Cache', 'HIT');
      res.set('X-Cache-Key', res.req.cacheKey || 'unknown');
    } else {
      res.set('X-Cache', 'MISS');
    }

    // Set standard cache headers
    if (!options?.cachePrivate) {
      res.set('Cache-Control', `public, max-age=${options?.ttl || 300}`);
    } else {
      res.set('Cache-Control', 'private, no-cache');
    }

    // Add custom headers
    if (options?.customHeaders) {
      Object.entries(options.customHeaders).forEach(([key, value]) => {
        res.set(key, value);
      });
    }

    // Add Vary headers for different cache variations
    if (options?.varyBy) {
      res.set('Vary', options.varyBy.join(', '));
    }
  }
}

// Helper function for setting cache headers
function setCacheHeaders(
  res: Response, 
  body: any, 
  isFromCache: boolean, 
  options?: CacheMiddlewareOptions
): void {
  if (isFromCache) {
    res.set('X-Cache', 'HIT');
  } else {
    res.set('X-Cache', 'MISS');
  }

  if (!options?.cachePrivate) {
    res.set('Cache-Control', `public, max-age=${options?.ttl || 300}`);
  }

  if (options?.varyBy) {
    res.set('Vary', options.varyBy.join(', '));
  }
}

// Create singleton middleware instance
export const cacheMiddleware = new CacheMiddleware();

// Predefined middleware configurations
export const middlewarePresets = {
  /**
   * Fast caching for static data (1 hour)
   */
  static: (customOptions: Partial<CacheMiddlewareOptions> = {}) => 
    cacheMiddleware.create({
      ttl: 3600,
      tags: ['static'],
      compressResponse: true,
      varyBy: ['Accept-Encoding'],
      ...customOptions
    }),

  /**
   * Medium caching for API responses (5 minutes)
   */
  api: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 300,
      tags: ['api'],
      compressResponse: true,
      invalidateOnMethods: ['POST', 'PUT', 'DELETE', 'PATCH'],
      ...customOptions
    }),

  /**
   * Short caching for dynamic content (1 minute)
   */
  dynamic: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 60,
      tags: ['dynamic'],
      conditionalCache: (req, res) => res.statusCode === 200,
      ...customOptions
    }),

  /**
   * User-specific caching (10 minutes)
   */
  userSpecific: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 600,
      keyGenerator: (req) => {
        const userId = req.user?.id || 'anonymous';
        return RedisCache.generateKey('user', userId, req.originalUrl, req.query);
      },
      tags: (req) => ['user', `user:${req.user?.id || 'anonymous'}`],
      cachePrivate: true,
      ...customOptions
    }),

  /**
   * Analytics data caching (15 minutes)
   */
  analytics: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 900,
      tags: ['analytics'],
      compressResponse: true,
      keyGenerator: (req) => {
        const timeRange = req.query.timeRange || 'day';
        const userId = req.query.userId || 'all';
        return RedisCache.generateKey('analytics', req.path, timeRange, userId);
      },
      ...customOptions
    }),

  /**
   * AI model responses caching (1 hour)
   */
  aiResponses: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 3600,
      tags: ['ai', 'model'],
      compressResponse: true,
      keyGenerator: (req) => {
        // Create deterministic key from prompt and model
        const prompt = JSON.stringify(req.body?.messages || req.body?.prompt || '');
        const model = req.body?.model || 'default';
        const hash = crypto.createHash('sha256').update(prompt).digest('hex');
        return RedisCache.generateKey('ai', model, hash.substring(0, 16));
      },
      conditionalCache: (req, res) => {
        // Only cache successful AI responses
        return res.statusCode === 200 && req.body?.messages;
      },
      invalidateOnMethods: ['DELETE'],
      ...customOptions
    }),

  /**
   * Security scan results caching (30 minutes)
   */
  security: (customOptions: Partial<CacheMiddlewareOptions> = {}) =>
    cacheMiddleware.create({
      ttl: 1800,
      tags: ['security', 'scan'],
      compressResponse: true,
      keyGenerator: (req) => {
        const target = req.body?.target || req.query.target || 'default';
        const scanType = req.query.type || 'basic';
        return RedisCache.generateKey('security', scanType, target);
      },
      ...customOptions
    })
};

export default cacheMiddleware;