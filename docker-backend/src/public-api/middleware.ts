/**
 * Public API Middleware
 *
 * Express middleware for:
 * - API key authentication
 * - Rate limiting
 * - Usage tracking
 * - Request logging
 * - Scope validation
 */

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import {
  validateApiKey,
  hasScope,
  hasAnyScope,
  isIpAllowed,
  getApiKey,
} from './api-keys.js';
import {
  checkRateLimit,
  consumeRateLimit,
  getRateLimitHeaders,
  checkSandboxLimit,
} from './rate-limiter.js';
import type { ApiKey, ApiKeyScope, PublicApiErrorCode } from './types.js';

// ==================== Types ====================

/**
 * Extended request with API key context
 */
export interface AuthenticatedApiRequest extends Request {
  /** The validated API key */
  apiKey?: ApiKey;

  /** API key ID */
  apiKeyId?: string;

  /** User ID who owns the key */
  userId?: string;

  /** Request ID for tracing */
  requestId?: string;

  /** Request start time */
  startTime?: number;
}

/**
 * API error response helper
 */
interface ApiErrorOptions {
  code: PublicApiErrorCode | string;
  message: string;
  details?: Record<string, unknown>;
  statusCode?: number;
}

// ==================== Error Helpers ====================

/**
 * Send standardized API error response
 */
export function sendApiError(
  res: Response,
  options: ApiErrorOptions,
  requestId?: string
): void {
  const statusCode = options.statusCode || getStatusCodeForError(options.code);

  res.status(statusCode).json({
    success: false,
    error: {
      code: options.code,
      message: options.message,
      details: options.details,
    },
    requestId: requestId || 'unknown',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send standardized API success response
 */
export function sendApiSuccess<T>(
  res: Response,
  data: T,
  requestId: string,
  statusCode: number = 200
): void {
  res.status(statusCode).json({
    success: true,
    data,
    requestId,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Map error codes to HTTP status codes
 */
function getStatusCodeForError(code: string): number {
  const statusMap: Record<string, number> = {
    INVALID_API_KEY: 401,
    API_KEY_EXPIRED: 401,
    API_KEY_REVOKED: 401,
    INSUFFICIENT_SCOPE: 403,
    IP_NOT_ALLOWED: 403,
    RATE_LIMIT_EXCEEDED: 429,
    QUOTA_EXCEEDED: 429,
    CONCURRENT_LIMIT_EXCEEDED: 429,
    SANDBOX_NOT_FOUND: 404,
    SANDBOX_NOT_RUNNING: 503,
    SANDBOX_CREATION_FAILED: 500,
    SANDBOX_LIMIT_EXCEEDED: 429,
    FILE_NOT_FOUND: 404,
    FILE_TOO_LARGE: 413,
    INVALID_FILE_PATH: 400,
    FILE_OPERATION_FAILED: 500,
    COMMAND_TIMEOUT: 504,
    COMMAND_FAILED: 500,
    COMMAND_NOT_ALLOWED: 403,
    VALIDATION_ERROR: 400,
    INVALID_REQUEST: 400,
    MISSING_REQUIRED_FIELD: 400,
    INTERNAL_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  };

  return statusMap[code] || 500;
}

// ==================== Middleware: Request ID ====================

/**
 * Generate unique request ID for tracing
 */
let requestCounter = 0;

export function requestIdMiddleware(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const timestamp = Date.now().toString(36);
  const counter = (requestCounter++).toString(36);
  const random = crypto.randomBytes(4).toString('hex');

  const requestId = `api-${timestamp}-${counter}-${random}`;

  req.requestId = requestId;
  req.startTime = Date.now();

  res.setHeader('X-Request-ID', requestId);

  next();
}

// ==================== Middleware: API Key Authentication ====================

/**
 * Authenticate requests using API key
 *
 * Expects: Authorization: Bearer sk_xxx_xxx
 */
export function authenticateApiKey(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  // Get API key from header
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    sendApiError(res, {
      code: 'INVALID_API_KEY',
      message: 'Missing Authorization header. Expected: Bearer sk_xxx_xxx',
    }, requestId);
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    sendApiError(res, {
      code: 'INVALID_API_KEY',
      message: 'Invalid Authorization format. Expected: Bearer sk_xxx_xxx',
    }, requestId);
    return;
  }

  const apiKeyString = authHeader.slice(7); // Remove 'Bearer '

  // Validate key format
  if (!apiKeyString.startsWith('sk_')) {
    sendApiError(res, {
      code: 'INVALID_API_KEY',
      message: 'Invalid API key format. Keys must start with sk_',
    }, requestId);
    return;
  }

  // Validate key
  const apiKey = validateApiKey(apiKeyString);

  if (!apiKey) {
    sendApiError(res, {
      code: 'INVALID_API_KEY',
      message: 'Invalid or expired API key',
    }, requestId);
    return;
  }

  // Check IP allowlist
  const clientIp = getClientIp(req);
  if (!isIpAllowed(apiKey, clientIp)) {
    sendApiError(res, {
      code: 'IP_NOT_ALLOWED',
      message: 'Request from this IP address is not allowed',
      details: { ip: clientIp },
    }, requestId);
    return;
  }

  // Attach key to request
  req.apiKey = apiKey;
  req.apiKeyId = apiKey.id;
  req.userId = apiKey.userId;

  next();
}

// ==================== Middleware: Rate Limiting ====================

/**
 * Apply rate limiting based on API key tier
 */
export function rateLimitMiddleware(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';
  const apiKey = req.apiKey;

  if (!apiKey) {
    // Should not happen if auth middleware ran first
    sendApiError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Authentication required before rate limiting',
    }, requestId);
    return;
  }

  // Check rate limit
  const result = checkRateLimit(apiKey);

  // Set rate limit headers
  const headers = getRateLimitHeaders(result);
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  if (!result.allowed) {
    // Add Retry-After header
    if (result.retryAfterSeconds) {
      res.setHeader('Retry-After', result.retryAfterSeconds.toString());
    }

    sendApiError(res, {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Try again in ${result.retryAfterSeconds} seconds.`,
      details: {
        limit: result.limit,
        window: result.window,
        retryAfter: result.retryAfterSeconds,
      },
      statusCode: 429,
    }, requestId);
    return;
  }

  // Consume rate limit token
  consumeRateLimit(apiKey);

  next();
}

/**
 * Check sandbox creation limit
 */
export function sandboxLimitMiddleware(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';
  const apiKey = req.apiKey;

  if (!apiKey) {
    sendApiError(res, {
      code: 'INTERNAL_ERROR',
      message: 'Authentication required',
    }, requestId);
    return;
  }

  const result = checkSandboxLimit(apiKey);

  if (!result.allowed) {
    sendApiError(res, {
      code: 'SANDBOX_LIMIT_EXCEEDED',
      message: `Maximum concurrent sandboxes (${result.limit}) reached. Delete unused sandboxes to create new ones.`,
      details: {
        limit: result.limit,
        current: result.limit - result.remaining,
      },
      statusCode: 429,
    }, requestId);
    return;
  }

  next();
}

// ==================== Middleware: Scope Validation ====================

/**
 * Create middleware to require specific scope(s)
 *
 * @param requiredScopes - Scopes required (any one of them)
 * @returns Express middleware
 */
export function requireScope(...requiredScopes: ApiKeyScope[]) {
  return (
    req: AuthenticatedApiRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const requestId = req.requestId || 'unknown';
    const apiKey = req.apiKey;

    if (!apiKey) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Authentication required',
      }, requestId);
      return;
    }

    if (!hasAnyScope(apiKey, requiredScopes)) {
      sendApiError(res, {
        code: 'INSUFFICIENT_SCOPE',
        message: `This operation requires one of the following scopes: ${requiredScopes.join(', ')}`,
        details: {
          required: requiredScopes,
          current: apiKey.scopes,
        },
        statusCode: 403,
      }, requestId);
      return;
    }

    next();
  };
}

/**
 * Create middleware to require ALL specified scopes
 */
export function requireAllScopes(...requiredScopes: ApiKeyScope[]) {
  return (
    req: AuthenticatedApiRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const requestId = req.requestId || 'unknown';
    const apiKey = req.apiKey;

    if (!apiKey) {
      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'Authentication required',
      }, requestId);
      return;
    }

    // Admin has all permissions
    if (apiKey.scopes.includes('admin')) {
      next();
      return;
    }

    const missingScopes = requiredScopes.filter(
      scope => !apiKey.scopes.includes(scope)
    );

    if (missingScopes.length > 0) {
      sendApiError(res, {
        code: 'INSUFFICIENT_SCOPE',
        message: `This operation requires the following scopes: ${requiredScopes.join(', ')}`,
        details: {
          required: requiredScopes,
          missing: missingScopes,
          current: apiKey.scopes,
        },
        statusCode: 403,
      }, requestId);
      return;
    }

    next();
  };
}

// ==================== Middleware: Request Logging ====================

/**
 * Log API requests
 */
export function requestLoggingMiddleware(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const startTime = req.startTime || Date.now();

  // Log on response finish
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      requestId: req.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      apiKeyId: req.apiKeyId,
      userId: req.userId,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };

    // Log to console (in production, send to logging service)
    if (res.statusCode >= 400) {
      console.error('[Public API]', JSON.stringify(logEntry));
    } else if (duration > 5000) {
      console.warn('[Public API] Slow request:', JSON.stringify(logEntry));
    } else {
      console.log('[Public API]', JSON.stringify(logEntry));
    }
  });

  next();
}

// ==================== Middleware: Validation ====================

/**
 * Validate request body exists and is JSON
 */
export function requireJsonBody(
  req: AuthenticatedApiRequest,
  res: Response,
  next: NextFunction
): void {
  const requestId = req.requestId || 'unknown';

  if (!req.body || Object.keys(req.body).length === 0) {
    sendApiError(res, {
      code: 'INVALID_REQUEST',
      message: 'Request body is required',
    }, requestId);
    return;
  }

  next();
}

/**
 * Create middleware to validate required fields
 */
export function requireFields(...fields: string[]) {
  return (
    req: AuthenticatedApiRequest,
    res: Response,
    next: NextFunction
  ): void => {
    const requestId = req.requestId || 'unknown';
    const missingFields: string[] = [];

    for (const field of fields) {
      if (req.body[field] === undefined || req.body[field] === null) {
        missingFields.push(field);
      }
    }

    if (missingFields.length > 0) {
      sendApiError(res, {
        code: 'MISSING_REQUIRED_FIELD',
        message: `Missing required fields: ${missingFields.join(', ')}`,
        details: { missingFields },
      }, requestId);
      return;
    }

    next();
  };
}

// ==================== Utility Functions ====================

/**
 * Get client IP address from request
 */
export function getClientIp(req: Request): string {
  // Check common proxy headers
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    return ips.trim();
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp) {
    return Array.isArray(realIp) ? realIp[0] : realIp;
  }

  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Async handler wrapper for route handlers
 */
export function asyncApiHandler<T extends AuthenticatedApiRequest = AuthenticatedApiRequest>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch((error: Error) => {
      const requestId = req.requestId || 'unknown';

      console.error('[Public API] Unhandled error:', {
        requestId,
        error: error.message,
        stack: error.stack,
      });

      sendApiError(res, {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: process.env.NODE_ENV !== 'production'
          ? { error: error.message }
          : undefined,
      }, requestId);
    });
  };
}

// ==================== Combined Middleware ====================

/**
 * Standard middleware stack for public API routes
 * Apply in order: requestId -> auth -> rateLimit -> logging
 */
export const standardMiddleware = [
  requestIdMiddleware,
  authenticateApiKey,
  rateLimitMiddleware,
  requestLoggingMiddleware,
];

/**
 * Middleware for sandbox creation (includes sandbox limit check)
 */
export const sandboxCreationMiddleware = [
  requestIdMiddleware,
  authenticateApiKey,
  rateLimitMiddleware,
  sandboxLimitMiddleware,
  requestLoggingMiddleware,
  requireScope('sandboxes:write', 'admin'),
];
