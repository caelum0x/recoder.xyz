/**
 * Rate Limiting Middleware for recoder-web
 * Provides in-memory rate limiting for Express/Remix applications
 */

import type { Request, Response, NextFunction } from 'express';
import type { RateLimitConfig, RateLimitEntry, ExtendedRequest, MiddlewareHandler } from './types';
import { CommonErrors } from './error-handler';

/**
 * In-memory rate limit store
 * Note: This is suitable for single-instance deployments
 * For distributed deployments, use Redis or a similar distributed store
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Clean up expired entries periodically
 */
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

function startCleanup(): void {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
      }
    }
  }, 60000); // Clean up every minute

  // Don't prevent process exit
  cleanupInterval.unref();
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: ExtendedRequest): string {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.toString().split(',')[0].trim() ||
    req.headers['x-real-ip']?.toString() ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

/**
 * Create rate limiting middleware
 */
export function createRateLimitMiddleware(config: RateLimitConfig): MiddlewareHandler {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    message = 'Too many requests, please try again later.',
  } = config;

  // Start cleanup process
  startCleanup();

  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;
    const key = keyGenerator(extendedReq);
    const now = Date.now();

    let entry = rateLimitStore.get(key);

    // Create new entry if doesn't exist or window has expired
    if (!entry || entry.resetTime < now) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
      rateLimitStore.set(key, entry);
    }

    // Increment count
    entry.count++;

    // Calculate remaining requests
    const remaining = Math.max(0, maxRequests - entry.count);
    const resetSeconds = Math.ceil((entry.resetTime - now) / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(entry.resetTime / 1000)));

    // Check if rate limit exceeded
    if (entry.count > maxRequests) {
      res.setHeader('Retry-After', String(resetSeconds));

      // Use the original response end to track status
      const originalEnd = res.end.bind(res);
      res.end = function (this: Response, ...args: any[]): Response {
        // If we're skipping based on status, decrement the count
        if (skipSuccessfulRequests && res.statusCode < 400) {
          entry!.count--;
        }
        if (skipFailedRequests && res.statusCode >= 400) {
          entry!.count--;
        }
        return originalEnd(...args);
      };

      throw CommonErrors.rateLimited(message, resetSeconds);
    }

    // Track for skipSuccessfulRequests/skipFailedRequests
    if (skipSuccessfulRequests || skipFailedRequests) {
      const originalEnd = res.end.bind(res);
      res.end = function (this: Response, ...args: any[]): Response {
        if (skipSuccessfulRequests && res.statusCode < 400) {
          entry!.count--;
        }
        if (skipFailedRequests && res.statusCode >= 400) {
          entry!.count--;
        }
        return originalEnd(...args);
      };
    }

    next();
  };
}

/**
 * Create general-purpose rate limiting with sensible defaults
 */
export function createDefaultRateLimitMiddleware(): MiddlewareHandler {
  return createRateLimitMiddleware({
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    message: 'Rate limit exceeded. Please try again later.',
  });
}

/**
 * Create upload-specific rate limiting middleware
 * More restrictive for file upload endpoints
 */
export function createUploadRateLimitMiddleware(): MiddlewareHandler {
  return createRateLimitMiddleware({
    windowMs: 60000, // 1 minute
    maxRequests: 10,
    message: 'Upload rate limit exceeded. Please wait before uploading more files.',
  });
}

/**
 * Create authentication-specific rate limiting middleware
 * Strict limiting for login/auth endpoints
 */
export function createAuthRateLimitMiddleware(): MiddlewareHandler {
  return createRateLimitMiddleware({
    windowMs: 900000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts. Please try again later.',
    skipSuccessfulRequests: true, // Don't count successful logins
  });
}

/**
 * Create user-specific rate limiting middleware
 * Uses user ID from session for rate limiting
 */
export function createUserRateLimitMiddleware(config?: Partial<RateLimitConfig>): MiddlewareHandler {
  const userKeyGenerator = (req: ExtendedRequest): string => {
    if (req.userSession?.userId) {
      return `user:${req.userSession.userId}`;
    }
    // Fallback to IP-based limiting for unauthenticated users
    return defaultKeyGenerator(req);
  };

  return createRateLimitMiddleware({
    windowMs: 60000, // 1 minute
    maxRequests: 60,
    keyGenerator: userKeyGenerator,
    message: 'Rate limit exceeded for your account.',
    ...config,
  });
}

/**
 * Create endpoint-specific rate limiting middleware
 * Uses combination of IP and endpoint for rate limiting
 */
export function createEndpointRateLimitMiddleware(
  endpoint: string,
  config?: Partial<RateLimitConfig>
): MiddlewareHandler {
  const endpointKeyGenerator = (req: ExtendedRequest): string => {
    const ip = defaultKeyGenerator(req);
    return `${endpoint}:${ip}`;
  };

  return createRateLimitMiddleware({
    windowMs: 60000, // 1 minute
    maxRequests: 30,
    keyGenerator: endpointKeyGenerator,
    message: `Rate limit exceeded for ${endpoint}.`,
    ...config,
  });
}

/**
 * Rate limiting presets for common use cases
 */
export const RateLimitPresets = {
  // Very strict - for sensitive operations
  strict: {
    windowMs: 60000, // 1 minute
    maxRequests: 5,
    message: 'Too many requests for this sensitive operation.',
  },

  // Moderate - for API endpoints
  moderate: {
    windowMs: 60000, // 1 minute
    maxRequests: 60,
    message: 'API rate limit exceeded.',
  },

  // Lenient - for public endpoints
  lenient: {
    windowMs: 60000, // 1 minute
    maxRequests: 200,
    message: 'Rate limit exceeded.',
  },

  // Upload specific - for file uploads
  upload: {
    windowMs: 60000, // 1 minute
    maxRequests: 10,
    message: 'Upload rate limit exceeded.',
  },

  // Authentication - for login attempts
  auth: {
    windowMs: 900000, // 15 minutes
    maxRequests: 5,
    message: 'Too many authentication attempts.',
    skipSuccessfulRequests: true,
  },

  // AI/Chat - for AI API calls
  ai: {
    windowMs: 60000, // 1 minute
    maxRequests: 20,
    message: 'AI request rate limit exceeded. Please slow down.',
  },
} as const;

/**
 * Sliding window rate limiter (more accurate but slightly more expensive)
 */
interface SlidingWindowEntry {
  timestamps: number[];
}

const slidingWindowStore = new Map<string, SlidingWindowEntry>();

export function createSlidingWindowRateLimitMiddleware(
  config: Omit<RateLimitConfig, 'skipSuccessfulRequests' | 'skipFailedRequests'>
): MiddlewareHandler {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    message = 'Too many requests, please try again later.',
  } = config;

  return (req: Request, res: Response, next: NextFunction): void => {
    const extendedReq = req as ExtendedRequest;
    const key = keyGenerator(extendedReq);
    const now = Date.now();
    const windowStart = now - windowMs;

    let entry = slidingWindowStore.get(key);

    if (!entry) {
      entry = { timestamps: [] };
      slidingWindowStore.set(key, entry);
    }

    // Remove timestamps outside the window
    entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

    // Check if rate limit exceeded
    if (entry.timestamps.length >= maxRequests) {
      const oldestTimestamp = entry.timestamps[0];
      const resetTime = oldestTimestamp + windowMs;
      const resetSeconds = Math.ceil((resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', String(maxRequests));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));
      res.setHeader('Retry-After', String(resetSeconds));

      throw CommonErrors.rateLimited(message, resetSeconds);
    }

    // Add current timestamp
    entry.timestamps.push(now);

    // Set rate limit headers
    const remaining = maxRequests - entry.timestamps.length;
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    next();
  };
}
