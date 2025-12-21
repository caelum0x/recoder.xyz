/**
 * Production-Grade Rate Limiter
 * Prevents abuse and ensures fair usage
 */

interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Max requests per window
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = {
      message: 'Too many requests, please try again later',
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
      ...config,
    };

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Check if request should be rate limited
   */
  async check(identifier: string): Promise<{ limited: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();
    let entry = this.store.get(identifier);

    // Create new entry if doesn't exist or expired
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
      };
      this.store.set(identifier, entry);
    }

    const limited = entry.count >= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);

    return {
      limited,
      limit: this.config.maxRequests,
      remaining,
      reset: entry.resetTime,
    };
  }

  /**
   * Increment counter for identifier
   */
  async increment(identifier: string): Promise<void> {
    const entry = this.store.get(identifier);
    if (entry) {
      entry.count++;
    }
  }

  /**
   * Reset counter for identifier
   */
  async reset(identifier: string): Promise<void> {
    this.store.delete(identifier);
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get current stats
   */
  getStats() {
    return {
      totalEntries: this.store.size,
      config: {
        windowMs: this.config.windowMs,
        maxRequests: this.config.maxRequests,
      },
    };
  }
}

// Production rate limiters
export const chatRateLimiter = new RateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20, // 20 requests per minute
  message: 'Too many chat requests, please wait a moment',
});

export const heavyOperationLimiter = new RateLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  maxRequests: 50, // 50 heavy operations per 5 minutes
  message: 'Rate limit exceeded for heavy operations',
});

export const apiRateLimiter = new RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100, // 100 API calls per 15 minutes
  message: 'API rate limit exceeded',
});

/**
 * Get identifier from request (IP or user ID)
 */
export function getRequestIdentifier(request: Request): string {
  // Try to get user ID from headers (if authenticated)
  const userId = request.headers.get('x-user-id');
  if (userId) return `user:${userId}`;

  // Fall back to IP address
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() :
             request.headers.get('x-real-ip') ||
             'unknown';

  return `ip:${ip}`;
}

/**
 * Middleware function to apply rate limiting
 */
export async function applyRateLimit(
  request: Request,
  limiter: RateLimiter
): Promise<{ allowed: boolean; headers: Record<string, string>; error?: string }> {
  const identifier = getRequestIdentifier(request);
  const result = await limiter.check(identifier);

  const headers = {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': new Date(result.reset).toISOString(),
  };

  if (result.limited) {
    const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    return {
      allowed: false,
      headers: {
        ...headers,
        'Retry-After': retryAfter.toString(),
      },
      error: 'Rate limit exceeded',
    };
  }

  // Increment counter
  await limiter.increment(identifier);

  return {
    allowed: true,
    headers,
  };
}

/**
 * Create rate limit error response
 */
export function createRateLimitResponse(
  headers: Record<string, string>,
  message: string = 'Too many requests'
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      retryAfter: headers['Retry-After'],
    }),
    {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    }
  );
}
