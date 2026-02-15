/**
 * Identity API Routes
 *
 * Endpoints for identity token management:
 * - POST /v1/identity/token  - Generate an identity token (requires API key)
 * - POST /v1/identity/verify - Verify an identity token (requires app key)
 * - GET  /v1/identity/tokens - List active identity tokens (requires API key)
 * - DELETE /v1/identity/tokens/:id - Revoke an identity token (requires API key)
 */

import { Router } from 'express';
import type {
  CreateIdentityTokenRequest,
  VerifyIdentityRequest,
  VerifiedAgentInfo,
  ApiKeyTier,
  PublicApiErrorCode,
} from '../types.js';
import {
  type AuthenticatedApiRequest,
  sendApiSuccess,
  sendApiError,
  asyncApiHandler,
  requestIdMiddleware,
  requestLoggingMiddleware,
} from '../middleware.js';
import {
  createIdentityToken,
  verifyIdentityToken,
  listUserIdentityTokens,
  revokeIdentityToken,
} from '../identity-tokens.js';
import { validateAppKey } from '../app-keys.js';
import {
  validateAudience,
  validateScopes,
  validateIdentityTokenFormat,
  validateUUID,
  combineValidations,
} from '../validation.js';

// ==================== Types ====================

/**
 * Extended request with app key context
 */
interface AppKeyAuthenticatedRequest extends AuthenticatedApiRequest {
  appKeyId?: string;
  appKeyOwnerId?: string;
}

// ==================== Rate Limiting ====================

/**
 * Simple in-memory rate limiting for identity operations
 * In production, consider using Redis for distributed rate limiting
 */
const rateLimits = {
  generate: new Map<string, { count: number; resetAt: number }>(),
  verify: new Map<string, { count: number; resetAt: number }>(),
};

const RATE_LIMITS = {
  generate: { limit: 10, windowMs: 60 * 1000 }, // 10 per minute
  verify: { limit: 100, windowMs: 60 * 1000 },  // 100 per minute
};

function checkRateLimit(
  type: 'generate' | 'verify',
  key: string
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const config = RATE_LIMITS[type];
  const limits = rateLimits[type];

  let entry = limits.get(key);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + config.windowMs };
    limits.set(key, entry);
  }

  if (entry.count >= config.limit) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: config.limit - entry.count,
    resetAt: entry.resetAt,
  };
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.generate) {
    if (entry.resetAt <= now) rateLimits.generate.delete(key);
  }
  for (const [key, entry] of rateLimits.verify) {
    if (entry.resetAt <= now) rateLimits.verify.delete(key);
  }
}, 5 * 60 * 1000); // Every 5 minutes

// ==================== User Info Provider ====================

/**
 * This should be injected from the main server with actual user data
 * For now, we use a placeholder that can be overridden
 */
let getUserInfoProvider: (userId: string) => Promise<VerifiedAgentInfo | null> = async (userId) => {
  // Default implementation - returns basic info
  // In production, this should query actual user data
  return {
    id: userId,
    name: `User ${userId.slice(0, 8)}`,
    tier: 'free' as ApiKeyTier,
    stats: {
      totalProjects: 0,
      memberSince: Date.now(),
    },
  };
};

/**
 * Set the user info provider function
 */
export function setUserInfoProvider(
  provider: (userId: string) => Promise<VerifiedAgentInfo | null>
): void {
  getUserInfoProvider = provider;
}

// ==================== Audit Logging ====================

function logSecurityEvent(event: {
  type: string;
  userId?: string;
  appKeyId?: string;
  requestId: string;
  success: boolean;
  details?: Record<string, unknown>;
}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category: 'security',
    ...event,
  };

  if (event.success) {
    console.log('[Identity Security]', JSON.stringify(logEntry));
  } else {
    console.warn('[Identity Security]', JSON.stringify(logEntry));
  }
}

// ==================== Router ====================

const router = Router();

/**
 * POST /token - Generate an identity token
 *
 * Requires: API key authentication
 * Body: { audience?: string, scopes?: string[] }
 * Returns: { identity_token, expires_at, expires_in }
 */
router.post(
  '/token',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Rate limit check
    const rateLimit = checkRateLimit('generate', userId);
    res.setHeader('X-RateLimit-Limit', RATE_LIMITS.generate.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());

    if (!rateLimit.allowed) {
      logSecurityEvent({
        type: 'token_generation_rate_limited',
        userId,
        requestId,
        success: false,
      });
      sendApiError(res, {
        code: 'RATE_LIMIT_EXCEEDED' as PublicApiErrorCode,
        message: 'Identity token generation rate limit exceeded. Try again later.',
        statusCode: 429,
      }, requestId);
      return;
    }

    const body = req.body as CreateIdentityTokenRequest;

    // Validate inputs
    const validation = combineValidations(
      validateAudience(body.audience),
      validateScopes(body.scopes)
    );

    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid request',
        statusCode: 400,
      }, requestId);
      return;
    }

    try {
      const response = createIdentityToken(userId, body);

      logSecurityEvent({
        type: 'token_generated',
        userId,
        requestId,
        success: true,
        details: {
          audience: body.audience,
          scopes: body.scopes,
          expiresAt: response.expires_at,
        },
      });

      sendApiSuccess(res, response, requestId, 201);
    } catch (error) {
      logSecurityEvent({
        type: 'token_generation_failed',
        userId,
        requestId,
        success: false,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      sendApiError(res, {
        code: 'IDENTITY_TOKEN_CREATION_FAILED' as PublicApiErrorCode,
        message: 'Failed to create identity token',
        statusCode: 500,
      }, requestId);
    }
  })
);

/**
 * POST /verify - Verify an identity token
 *
 * Requires: App key authentication (X-App-Key header)
 * Body: { token, audience? }
 * Returns: { valid, agent?: { id, name, tier, stats }, error? }
 */
router.post(
  '/verify',
  requestIdMiddleware,
  requestLoggingMiddleware,
  asyncApiHandler(async (req: AppKeyAuthenticatedRequest, res) => {
    const requestId = req.requestId || 'unknown';

    // Authenticate with app key
    const appKeyHeader = req.headers['x-app-key'];
    if (!appKeyHeader || typeof appKeyHeader !== 'string') {
      sendApiError(res, {
        code: 'APP_KEY_INVALID' as PublicApiErrorCode,
        message: 'Missing X-App-Key header. App key required for token verification.',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Basic format check before validation
    if (!appKeyHeader.startsWith('app_')) {
      sendApiError(res, {
        code: 'APP_KEY_INVALID' as PublicApiErrorCode,
        message: 'Invalid app key format',
        statusCode: 401,
      }, requestId);
      return;
    }

    const appKey = validateAppKey(appKeyHeader);
    if (!appKey) {
      logSecurityEvent({
        type: 'app_key_validation_failed',
        requestId,
        success: false,
        details: { keyPrefix: appKeyHeader.slice(0, 12) },
      });
      sendApiError(res, {
        code: 'APP_KEY_INVALID' as PublicApiErrorCode,
        message: 'Invalid or revoked app key',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Rate limit check using app key ID
    const rateLimit = checkRateLimit('verify', appKey.id);
    res.setHeader('X-RateLimit-Limit', RATE_LIMITS.verify.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());

    if (!rateLimit.allowed) {
      logSecurityEvent({
        type: 'verification_rate_limited',
        appKeyId: appKey.id,
        requestId,
        success: false,
      });
      sendApiError(res, {
        code: 'RATE_LIMIT_EXCEEDED' as PublicApiErrorCode,
        message: 'Token verification rate limit exceeded. Try again later.',
        statusCode: 429,
      }, requestId);
      return;
    }

    const body = req.body as VerifyIdentityRequest;

    // Validate inputs
    const validation = combineValidations(
      validateIdentityTokenFormat(body.token),
      validateAudience(body.audience)
    );

    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid request',
        statusCode: 400,
      }, requestId);
      return;
    }

    const response = await verifyIdentityToken(body, getUserInfoProvider);

    logSecurityEvent({
      type: 'token_verified',
      appKeyId: appKey.id,
      requestId,
      success: response.valid,
      details: {
        audience: body.audience,
        agentId: response.agent?.id,
      },
    });

    sendApiSuccess(res, response, requestId);
  })
);

/**
 * GET /tokens - List active identity tokens for the authenticated user
 *
 * Requires: API key authentication
 * Returns: { tokens: [...] }
 */
router.get(
  '/tokens',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    const tokens = listUserIdentityTokens(userId);
    sendApiSuccess(res, { tokens }, requestId);
  })
);

/**
 * DELETE /tokens/:id - Revoke an identity token
 *
 * Requires: API key authentication
 * Returns: { revoked: true }
 */
router.delete(
  '/tokens/:id',
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const tokenId = req.params.id;

    if (!userId) {
      sendApiError(res, {
        code: 'INVALID_API_KEY' as PublicApiErrorCode,
        message: 'Authentication required',
        statusCode: 401,
      }, requestId);
      return;
    }

    // Validate token ID format
    const validation = validateUUID(tokenId, 'tokenId');
    if (!validation.valid) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid token ID',
        statusCode: 400,
      }, requestId);
      return;
    }

    const revoked = revokeIdentityToken(tokenId, userId);

    if (!revoked) {
      sendApiError(res, {
        code: 'IDENTITY_TOKEN_INVALID' as PublicApiErrorCode,
        message: 'Token not found or not owned by you',
        statusCode: 404,
      }, requestId);
      return;
    }

    logSecurityEvent({
      type: 'token_revoked',
      userId,
      requestId,
      success: true,
      details: { tokenId },
    });

    sendApiSuccess(res, { revoked: true }, requestId);
  })
);

export { router as identityRouter };
