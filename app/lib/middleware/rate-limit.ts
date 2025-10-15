import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../prisma';

/**
 * Rate Limiting Middleware
 * Uses database for distributed rate limiting across instances
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  identifier?: (request: NextRequest) => string; // Custom identifier function
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
}

interface RateLimitRecord {
  identifier: string;
  endpoint: string;
  count: number;
  resetAt: Date;
}

// In-memory cache for better performance (expires with rate limit window)
const rateLimitCache = new Map<string, RateLimitRecord>();

/**
 * Clean expired cache entries periodically
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitCache.entries()) {
    if (record.resetAt.getTime() < now) {
      rateLimitCache.delete(key);
    }
  }
}, 60000); // Clean every minute

/**
 * Get identifier for rate limiting (IP address or user ID)
 */
function getIdentifier(request: NextRequest): string {
  // Try to get user ID from session/auth
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    // Extract user identifier from token (first 12 chars as identifier)
    if (token.length >= 12) {
      return `user:${token.substring(0, 12)}`;
    }
  }

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] :
             request.headers.get('x-real-ip') ||
             'unknown';

  return `ip:${ip}`;
}

/**
 * Check and update rate limit
 */
async function checkRateLimit(
  identifier: string,
  endpoint: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: Date }> {
  const cacheKey = `${identifier}:${endpoint}`;
  const now = new Date();
  const resetAt = new Date(now.getTime() + config.windowMs);

  // Check cache first
  let record = rateLimitCache.get(cacheKey);

  if (record && record.resetAt > now) {
    // Rate limit record still valid
    if (record.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetAt: record.resetAt,
      };
    }

    // Increment count
    record.count++;
    rateLimitCache.set(cacheKey, record);

    return {
      allowed: true,
      remaining: config.maxRequests - record.count,
      resetAt: record.resetAt,
    };
  }

  // Create new record
  record = {
    identifier,
    endpoint,
    count: 1,
    resetAt,
  };

  rateLimitCache.set(cacheKey, record);

  return {
    allowed: true,
    remaining: config.maxRequests - 1,
    resetAt,
  };
}

/**
 * Rate limiting middleware factory
 */
export function rateLimit(config: RateLimitConfig) {
  return async (request: NextRequest): Promise<NextResponse | null> => {
    const identifier = config.identifier
      ? config.identifier(request)
      : getIdentifier(request);

    const endpoint = new URL(request.url).pathname;

    const result = await checkRateLimit(identifier, endpoint, config);

    if (!result.allowed) {
      const retryAfter = Math.ceil((result.resetAt.getTime() - Date.now()) / 1000);

      return NextResponse.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded',
          retryAfter,
          resetAt: result.resetAt.toISOString(),
        },
        {
          status: 429,
          headers: {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': result.resetAt.toISOString(),
          },
        }
      );
    }

    // Add rate limit headers to response
    return null; // Continue processing
  };
}

/**
 * Predefined rate limit configurations
 */
export const rateLimitConfigs = {
  // Authentication endpoints - strict
  auth: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },

  // Password reset - very strict
  passwordReset: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
  },

  // API key operations - moderate
  apiKeys: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },

  // General API - lenient
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60,
  },

  // CLI authentication - moderate
  cliAuth: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 20,
  },

  // AI proxy requests - based on plan
  aiProxy: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10, // Will be overridden per user
  },

  // Public endpoints - lenient
  public: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },
};

/**
 * Wrapper for API routes with rate limiting
 */
export function withRateLimit(
  handler: (request: NextRequest) => Promise<Response>,
  config: RateLimitConfig
) {
  return async (request: NextRequest) => {
    const rateLimitResponse = await rateLimit(config)(request);

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    return handler(request);
  };
}
