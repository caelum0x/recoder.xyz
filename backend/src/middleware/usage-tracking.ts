/**
 * Usage Tracking Middleware
 * Automatically tracks API usage and enforces quotas
 */

import { Request, Response, NextFunction } from 'express';
import { usageTrackingService } from '../services/usage-tracking-service';
import { logger } from '../utils/logger';

/**
 * Middleware to check quota before processing request
 */
export async function checkQuotaMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Skip quota check if user is not authenticated
    if (!req.user) {
      return next();
    }

    const userId = req.user.id;
    
    // Estimate tokens based on request (rough estimate)
    const estimatedTokens = estimateTokensFromRequest(req);

    // Check quota
    const quotaCheck = await usageTrackingService.checkQuota(userId, estimatedTokens);

    if (!quotaCheck.allowed) {
      logger.warn('Quota exceeded', {
        userId,
        reason: quotaCheck.reason,
        path: req.path
      });

      return res.status(429).json({
        success: false,
        error: 'Quota exceeded',
        message: getQuotaErrorMessage(quotaCheck.reason),
        code: quotaCheck.reason,
        remaining: quotaCheck.remaining,
        limits: quotaCheck.limits,
        upgradeUrl: process.env.NEXT_PUBLIC_WEB_URL + '/pricing'
      }) as any;
    }

    // Store quota info in request for later use
    req.quotaInfo = {
      remaining: quotaCheck.remaining,
      limits: quotaCheck.limits
    };

    next();
  } catch (error) {
    logger.error('Quota check middleware error', {
      error,
      userId: req.user?.id,
      path: req.path
    });
    // Fail open - allow request to proceed
    next();
  }
}

/**
 * Middleware to track usage after request completes
 */
export function trackUsageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip if user is not authenticated
  if (!req.user) {
    return next();
  }

  const userId = req.user.id;
  const startTime = Date.now();

  // Store original send function
  const originalSend = res.send;
  const originalJson = res.json;

  // Track usage after response is sent
  const trackAfterResponse = async (body: any) => {
    try {
      const duration = Date.now() - startTime;
      const tokensUsed = extractTokensFromResponse(body) || estimateTokensFromRequest(req);
      const cost = extractCostFromResponse(body) || estimateCost(tokensUsed);

      await usageTrackingService.trackUsage({
        userId,
        sessionId: req.headers['x-session-id'] as string,
        requestType: getRequestType(req),
        endpoint: req.path,
        method: req.method,
        statusCode: res.statusCode,
        tokensUsed,
        cost,
        modelUsed: extractModelFromRequest(req) || undefined,
        providerUsed: extractProviderFromRequest(req) || undefined,
        duration,
        success: res.statusCode < 400,
        errorMessage: res.statusCode >= 400 ? getErrorMessage(body) : undefined,
        metadata: {
          userAgent: req.headers['user-agent'],
          ip: req.ip,
          platform: req.headers['x-platform'],
          version: req.headers['x-version']
        }
      });
    } catch (error) {
      logger.error('Failed to track usage in middleware', {
        error,
        userId,
        path: req.path
      });
    }
  };

  // Override send function
  res.send = function (body: any): Response {
    trackAfterResponse(body);
    return originalSend.call(this, body);
  };

  // Override json function
  res.json = function (body: any): Response {
    trackAfterResponse(body);
    return originalJson.call(this, body);
  };

  next();
}

/**
 * Estimate tokens from request (rough heuristic)
 */
function estimateTokensFromRequest(req: Request): number {
  try {
    const body = req.body;
    
    if (!body) return 100; // Default minimum

    // If there's a prompt or input, estimate based on length
    const text = body.prompt || body.input || body.message || JSON.stringify(body);
    
    // Rough estimate: 1 token ≈ 4 characters
    const estimatedTokens = Math.ceil(text.length / 4);
    
    // Add buffer for response tokens (assume response is ~2x input)
    return Math.min(estimatedTokens * 3, 10000); // Cap at 10k for safety
  } catch (error) {
    return 100; // Default on error
  }
}

/**
 * Extract actual tokens used from response
 */
function extractTokensFromResponse(body: any): number | null {
  try {
    if (!body) return null;
    
    // Parse body if it's a string
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    
    // Check various response formats
    if (data.usage?.total_tokens) return data.usage.total_tokens;
    if (data.tokens) return data.tokens;
    if (data.data?.tokens) return data.data.tokens;
    if (data.tokensUsed) return data.tokensUsed;
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract cost from response
 */
function extractCostFromResponse(body: any): number | null {
  try {
    if (!body) return null;
    
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    
    if (data.cost) return data.cost;
    if (data.data?.cost) return data.data.cost;
    if (data.usage?.cost) return data.usage.cost;
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Estimate cost based on tokens
 */
function estimateCost(tokens: number): number {
  // Average cost: $0.02 per 1000 tokens (rough estimate)
  return (tokens / 1000) * 0.02;
}

/**
 * Get request type from request
 */
function getRequestType(req: Request): 'cli' | 'api' | 'web' | 'router' {
  const userAgent = (req.headers['user-agent'] || '').toString().toLowerCase();
  const platform = (req.headers['x-platform'] || '').toString().toLowerCase();
  
  if (platform === 'cli' || userAgent.includes('recoder-cli')) return 'cli';
  if (platform === 'router' || req.path.includes('/router')) return 'router';
  if (platform === 'web' || req.headers.referer?.includes('recoder.xyz')) return 'web';
  
  return 'api';
}

/**
 * Extract model name from request
 */
function extractModelFromRequest(req: Request): string | null {
  try {
    const body = req.body;
    if (!body) return null;
    
    return body.model || body.modelName || body.ai_model || null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract provider from request
 */
function extractProviderFromRequest(req: Request): string | null {
  try {
    const body = req.body;
    if (!body) return null;
    
    return body.provider || body.aiProvider || body.ai_provider || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get error message from response body
 */
function getErrorMessage(body: any): string | undefined {
  try {
    if (!body) return undefined;
    
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    
    return data.error?.message || data.message || data.error || undefined;
  } catch (error) {
    return undefined;
  }
}

/**
 * Get user-friendly quota error message
 */
function getQuotaErrorMessage(reason?: string): string {
  switch (reason) {
    case 'REQUEST_LIMIT_EXCEEDED':
      return 'You have exceeded your request limit for this period. Please upgrade your plan or wait for the next billing cycle.';
    
    case 'TOKEN_LIMIT_EXCEEDED':
      return 'You have exceeded your token limit for this period. Please upgrade your plan or wait for the next billing cycle.';
    
    case 'SUBSCRIPTION_INACTIVE':
      return 'Your subscription is inactive. Please update your payment method or contact support.';
    
    case 'USER_NOT_FOUND':
      return 'User account not found. Please contact support.';
    
    default:
      return 'You have exceeded your usage quota. Please upgrade your plan or wait for the next billing cycle.';
  }
}

/**
 * Combined middleware for quota check and usage tracking
 */
export function usageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  checkQuotaMiddleware(req, res, (err?: any) => {
    if (err) return next(err);
    trackUsageMiddleware(req, res, next);
  });
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      quotaInfo?: {
        remaining?: {
          requests: number;
          tokens: bigint;
        };
        limits?: {
          requests: number;
          tokens: bigint;
        };
      };
    }
  }
}
