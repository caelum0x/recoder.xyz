// Rate Limiting Middleware
// API key based rate limiting with Redis cache

import { Request, Response, NextFunction } from 'express';
import { createClient } from 'redis';
import { ApiKeyService } from '../models/api-key';
import { logger } from '../utils/logger';

// Extend Request type to include API key info
declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        userId: string;
        permissions: string[];
        rateLimit: {
          requests: number;
          tokens: number;
          window: number;
        };
      };
    }
  }
}

class RateLimitService {
  private redis;
  
  constructor() {
    // Initialize Redis client
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.redis.on('error', (err) => {
      logger.error('Redis rate limit error:', err);
    });
    
    this.redis.connect();
  }

  /**
   * Check if request is within rate limits
   */
  async checkRateLimit(
    keyId: string,
    rateLimit: { requests: number; tokens: number; window: number },
    requestTokens: number = 1
  ): Promise<{
    allowed: boolean;
    remaining: { requests: number; tokens: number };
    resetTime: number;
  }> {
    const now = Date.now();
    const window = rateLimit.window * 1000; // convert to milliseconds
    const windowStart = Math.floor(now / window) * window;
    
    const requestKey = `rate_limit:requests:${keyId}:${windowStart}`;
    const tokenKey = `rate_limit:tokens:${keyId}:${windowStart}`;
    
    try {
      // Use Redis pipeline for atomic operations
      const pipeline = this.redis.multi();
      
      // Get current counts
      pipeline.get(requestKey);
      pipeline.get(tokenKey);
      
      const results = await pipeline.exec();
      const currentRequests = parseInt(results[0] as string || '0');
      const currentTokens = parseInt(results[1] as string || '0');
      
      // Check if limits would be exceeded
      const newRequests = currentRequests + 1;
      const newTokens = currentTokens + requestTokens;
      
      if (newRequests > rateLimit.requests || newTokens > rateLimit.tokens) {
        return {
          allowed: false,
          remaining: {
            requests: Math.max(0, rateLimit.requests - currentRequests),
            tokens: Math.max(0, rateLimit.tokens - currentTokens)
          },
          resetTime: windowStart + window
        };
      }
      
      // Increment counters
      const incrementPipeline = this.redis.multi();
      incrementPipeline.incr(requestKey);
      incrementPipeline.incrBy(tokenKey, requestTokens);
      incrementPipeline.expire(requestKey, rateLimit.window);
      incrementPipeline.expire(tokenKey, rateLimit.window);
      
      await incrementPipeline.exec();
      
      return {
        allowed: true,
        remaining: {
          requests: rateLimit.requests - newRequests,
          tokens: rateLimit.tokens - newTokens
        },
        resetTime: windowStart + window
      };
      
    } catch (error) {
      logger.error('Rate limit check failed', { error: error.message, keyId });
      
      // Fail open - allow request if Redis is down
      return {
        allowed: true,
        remaining: { requests: rateLimit.requests, tokens: rateLimit.tokens },
        resetTime: now + window
      };
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(
    keyId: string,
    rateLimit: { requests: number; tokens: number; window: number }
  ): Promise<{
    requests: { used: number; limit: number; remaining: number };
    tokens: { used: number; limit: number; remaining: number };
    resetTime: number;
  }> {
    const now = Date.now();
    const window = rateLimit.window * 1000;
    const windowStart = Math.floor(now / window) * window;
    
    const requestKey = `rate_limit:requests:${keyId}:${windowStart}`;
    const tokenKey = `rate_limit:tokens:${keyId}:${windowStart}`;
    
    try {
      const [requestCount, tokenCount] = await Promise.all([
        this.redis.get(requestKey),
        this.redis.get(tokenKey)
      ]);
      
      const usedRequests = parseInt(requestCount || '0');
      const usedTokens = parseInt(tokenCount || '0');
      
      return {
        requests: {
          used: usedRequests,
          limit: rateLimit.requests,
          remaining: Math.max(0, rateLimit.requests - usedRequests)
        },
        tokens: {
          used: usedTokens,
          limit: rateLimit.tokens,
          remaining: Math.max(0, rateLimit.tokens - usedTokens)
        },
        resetTime: windowStart + window
      };
      
    } catch (error) {
      logger.error('Failed to get rate limit status', { error: error.message, keyId });
      
      return {
        requests: { used: 0, limit: rateLimit.requests, remaining: rateLimit.requests },
        tokens: { used: 0, limit: rateLimit.tokens, remaining: rateLimit.tokens },
        resetTime: now + window
      };
    }
  }
}

const rateLimitService = new RateLimitService();

/**
 * Middleware to authenticate API key and check rate limits
 */
export const authenticateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Missing or invalid authorization header',
        code: 'INVALID_AUTH'
      });
      return;
    }
    
    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    // Validate API key
    const keyData = await ApiKeyService.validateApiKey(apiKey);
    
    if (!keyData) {
      res.status(401).json({
        error: 'Invalid API key',
        code: 'INVALID_API_KEY'
      });
      return;
    }
    
    // Store API key info in request
    req.apiKey = {
      id: keyData.id,
      userId: keyData.userId,
      permissions: keyData.permissions,
      rateLimit: keyData.rateLimit
    };
    
    logger.info('API key authenticated', {
      keyId: keyData.id,
      userId: keyData.userId,
      endpoint: req.path
    });
    
    next();
    
  } catch (error) {
    logger.error('API key authentication failed', {
      error: error.message,
      path: req.path,
      ip: req.ip
    });
    
    res.status(500).json({
      error: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

/**
 * Middleware to check rate limits for API key
 */
export const checkRateLimit = (estimatedTokens: number = 1000) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.apiKey) {
      res.status(401).json({
        error: 'API key required',
        code: 'API_KEY_REQUIRED'
      });
      return;
    }
    
    try {
      const rateLimitResult = await rateLimitService.checkRateLimit(
        req.apiKey.id,
        req.apiKey.rateLimit,
        estimatedTokens
      );
      
      // Set rate limit headers
      res.set({
        'X-RateLimit-Requests-Limit': req.apiKey.rateLimit.requests.toString(),
        'X-RateLimit-Requests-Remaining': rateLimitResult.remaining.requests.toString(),
        'X-RateLimit-Tokens-Limit': req.apiKey.rateLimit.tokens.toString(),
        'X-RateLimit-Tokens-Remaining': rateLimitResult.remaining.tokens.toString(),
        'X-RateLimit-Reset': Math.ceil(rateLimitResult.resetTime / 1000).toString()
      });
      
      if (!rateLimitResult.allowed) {
        logger.warn('Rate limit exceeded', {
          keyId: req.apiKey.id,
          userId: req.apiKey.userId,
          endpoint: req.path,
          remaining: rateLimitResult.remaining
        });
        
        res.status(429).json({
          error: 'Rate limit exceeded',
          code: 'RATE_LIMIT_EXCEEDED',
          details: {
            retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
            limits: req.apiKey.rateLimit,
            remaining: rateLimitResult.remaining
          }
        });
        return;
      }
      
      next();
      
    } catch (error) {
      logger.error('Rate limit check failed', {
        error: error.message,
        keyId: req.apiKey.id
      });
      
      // Fail open - continue processing
      next();
    }
  };
};

/**
 * Middleware to check API key permissions
 */
export const requirePermission = (permission: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        error: 'API key required',
        code: 'API_KEY_REQUIRED'
      });
      return;
    }
    
    if (!req.apiKey.permissions.includes(permission) && !req.apiKey.permissions.includes('admin')) {
      res.status(403).json({
        error: `Permission '${permission}' required`,
        code: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: permission,
        currentPermissions: req.apiKey.permissions
      });
      return;
    }
    
    next();
  };
};

/**
 * Get rate limit status for API key
 */
export const getRateLimitStatus = async (req: Request, res: Response): Promise<void> => {
  if (!req.apiKey) {
    res.status(401).json({
      error: 'API key required',
      code: 'API_KEY_REQUIRED'
    });
    return;
  }
  
  try {
    const status = await rateLimitService.getRateLimitStatus(
      req.apiKey.id,
      req.apiKey.rateLimit
    );
    
    res.json({
      success: true,
      rateLimit: {
        window: req.apiKey.rateLimit.window,
        requests: status.requests,
        tokens: status.tokens,
        resetTime: status.resetTime,
        resetIn: Math.max(0, Math.ceil((status.resetTime - Date.now()) / 1000))
      }
    });
    
  } catch (error) {
    logger.error('Failed to get rate limit status', {
      error: error.message,
      keyId: req.apiKey.id
    });
    
    res.status(500).json({
      error: 'Failed to get rate limit status',
      code: 'RATE_LIMIT_STATUS_ERROR'
    });
  }
};

export { rateLimitService };