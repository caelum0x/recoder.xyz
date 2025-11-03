/**
 * Rate Limiting Middleware
 * Prevents abuse and ensures fair usage using Redis
 */

import { json } from '@remix-run/cloudflare';
import { getCacheManager, CacheKeys } from '../cache/redis';

export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Maximum requests per window
  identifier: string;    // User ID, IP, or API key
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

/**
 * Check rate limit for a request
 */
export async function checkRateLimit(
  env: Env,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const cache = getCacheManager(env);

  if (!cache) {
    // No Redis, allow request but log warning
    console.warn('Rate limiting disabled: Redis not configured');
    return {
      allowed: true,
      limit: config.maxRequests,
      remaining: config.maxRequests,
      resetTime: Date.now() + config.windowMs,
    };
  }

  const windowKey = Math.floor(Date.now() / config.windowMs);
  const key = CacheKeys.rateLimit(config.identifier, windowKey.toString());

  // Get current count
  const count = await cache.increment(key, 1);

  // Set expiry on first request in window
  if (count === 1) {
    const expiryTime = Math.floor((Date.now() + config.windowMs) / 1000);
    await cache.setWithExpiry(key, count, expiryTime);
  }

  const remaining = Math.max(0, config.maxRequests - count);
  const resetTime = (windowKey + 1) * config.windowMs;
  const allowed = count <= config.maxRequests;

  return {
    allowed,
    limit: config.maxRequests,
    remaining,
    resetTime,
    retryAfter: allowed ? undefined : Math.ceil((resetTime - Date.now()) / 1000),
  };
}

/**
 * Rate limit middleware for API routes
 */
export async function rateLimitMiddleware(
  request: Request,
  env: Env,
  config: Partial<RateLimitConfig> = {}
): Promise<Response | null> {
  // Get identifier (user ID from header, or IP address)
  const userId = request.headers.get('x-user-id');
  const ip = request.headers.get('cf-connecting-ip') || 
             request.headers.get('x-forwarded-for') || 
             'unknown';
  
  const identifier = userId || ip;

  // Default config
  const rateLimitConfig: RateLimitConfig = {
    windowMs: config.windowMs || 60000, // 1 minute
    maxRequests: config.maxRequests || 60, // 60 requests per minute
    identifier,
    ...config,
  };

  const result = await checkRateLimit(env, rateLimitConfig);

  // Add rate limit headers to response
  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
  };

  if (!result.allowed) {
    return json(
      {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: result.retryAfter,
      },
      {
        status: 429,
        headers: {
          ...headers,
          'Retry-After': result.retryAfter?.toString() || '60',
        },
      }
    );
  }

  // Store headers to add to successful response
  (request as any).rateLimitHeaders = headers;

  return null; // Allow request to proceed
}

/**
 * Rate limit configurations for different endpoints
 */
export const RateLimits = {
  // API endpoints
  api: {
    windowMs: 60000,      // 1 minute
    maxRequests: 60,      // 60 requests per minute
  },

  // AI generation (more restrictive)
  generation: {
    windowMs: 60000,      // 1 minute
    maxRequests: 10,      // 10 generations per minute
  },

  // Authentication
  auth: {
    windowMs: 900000,     // 15 minutes
    maxRequests: 5,       // 5 attempts per 15 minutes
  },

  // Webhooks (very permissive)
  webhook: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,     // 100 webhooks per minute
  },

  // Free tier users
  freeTier: {
    windowMs: 3600000,    // 1 hour
    maxRequests: 20,      // 20 requests per hour
  },

  // Pro tier users
  proTier: {
    windowMs: 60000,      // 1 minute
    maxRequests: 100,     // 100 requests per minute
  },

  // Enterprise tier (least restrictive)
  enterprise: {
    windowMs: 60000,      // 1 minute
    maxRequests: 500,     // 500 requests per minute
  },
};

/**
 * Get rate limit config based on user tier
 */
export function getRateLimitForTier(tier: 'free' | 'pro' | 'team' | 'enterprise') {
  switch (tier) {
    case 'free':
      return RateLimits.freeTier;
    case 'pro':
    case 'team':
      return RateLimits.proTier;
    case 'enterprise':
      return RateLimits.enterprise;
    default:
      return RateLimits.freeTier;
  }
}

/**
 * Rate limit by IP for anonymous users
 */
export async function rateLimitByIP(
  request: Request,
  env: Env,
  maxRequests: number = 20
): Promise<Response | null> {
  const ip = request.headers.get('cf-connecting-ip') || 
             request.headers.get('x-forwarded-for') || 
             'unknown';

  return await rateLimitMiddleware(request, env, {
    identifier: `ip:${ip}`,
    maxRequests,
    windowMs: 60000, // 1 minute
  });
}

/**
 * Rate limit by user ID for authenticated users
 */
export async function rateLimitByUser(
  request: Request,
  env: Env,
  userId: string,
  tier: 'free' | 'pro' | 'team' | 'enterprise' = 'free'
): Promise<Response | null> {
  const config = getRateLimitForTier(tier);

  return await rateLimitMiddleware(request, env, {
    identifier: `user:${userId}`,
    ...config,
  });
}
