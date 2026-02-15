/**
 * Moltbook Authentication Routes
 *
 * Endpoints for authenticating with Moltbook identity:
 * - POST /v1/auth/moltbook - Authenticate with a Moltbook identity token
 * - GET  /v1/auth/moltbook/status - Check if agent has linked account
 */

import { Router } from 'express';
import type {
  MoltbookAuthRequest,
  MoltbookAuthResponse,
  MoltbookAgentInfo,
  ApiKeyScope,
  PublicApiErrorCode,
} from '../types.js';
import {
  type AuthenticatedApiRequest,
  sendApiSuccess,
  sendApiError,
  asyncApiHandler,
  requestIdMiddleware,
  requestLoggingMiddleware,
  getClientIp,
} from '../middleware.js';
import { createApiKey } from '../api-keys.js';
import {
  getOrCreateRecoderAccount,
  findRecoderIdByExternalId,
  updateExternalIdentityMetadata,
} from '../external-identities.js';
import { validateMoltbookToken } from '../validation.js';

// ==================== Configuration ====================

/**
 * Moltbook verification endpoint
 */
const MOLTBOOK_VERIFY_URL = process.env.MOLTBOOK_VERIFY_URL || 'https://api.moltbook.com/v1/identity/verify';

/**
 * App key for Moltbook verification
 */
const MOLTBOOK_APP_KEY = process.env.MOLTBOOK_APP_KEY;

/**
 * Whether to allow test tokens (only in non-production)
 */
const ALLOW_TEST_TOKENS = process.env.NODE_ENV !== 'production';

/**
 * Verification timeout in milliseconds
 */
const VERIFICATION_TIMEOUT_MS = 10000;

// ==================== Rate Limiting ====================

const authAttempts = new Map<string, { count: number; resetAt: number; blocked: boolean }>();

const RATE_LIMIT = {
  limit: 5,             // 5 attempts
  windowMs: 60 * 1000,  // per minute
  blockDuration: 15 * 60 * 1000, // 15 minute block after exceeded
};

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number; blocked: boolean } {
  const now = Date.now();
  let entry = authAttempts.get(ip);

  // Check if blocked
  if (entry?.blocked && entry.resetAt > now) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blocked: true,
    };
  }

  // Reset if window expired
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + RATE_LIMIT.windowMs, blocked: false };
    authAttempts.set(ip, entry);
  }

  if (entry.count >= RATE_LIMIT.limit) {
    // Block the IP
    entry.blocked = true;
    entry.resetAt = now + RATE_LIMIT.blockDuration;
    authAttempts.set(ip, entry);
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
      blocked: true,
    };
  }

  entry.count++;
  return {
    allowed: true,
    remaining: RATE_LIMIT.limit - entry.count,
    resetAt: entry.resetAt,
    blocked: false,
  };
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of authAttempts) {
    if (entry.resetAt <= now && !entry.blocked) {
      authAttempts.delete(key);
    } else if (entry.blocked && entry.resetAt <= now) {
      authAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000);

// ==================== Audit Logging ====================

function logAuthEvent(event: {
  type: string;
  ip: string;
  requestId: string;
  success: boolean;
  moltbookAgentId?: string;
  recoderId?: string;
  details?: Record<string, unknown>;
}): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    category: 'moltbook_auth',
    ...event,
  };

  if (event.success) {
    console.log('[Moltbook Auth]', JSON.stringify(logEntry));
  } else {
    console.warn('[Moltbook Auth]', JSON.stringify(logEntry));
  }
}

// ==================== Moltbook Token Verification ====================

interface MoltbookVerifyResponse {
  valid: boolean;
  error?: string;
  agent?: MoltbookAgentInfo;
}

/**
 * Verify a Moltbook identity token with the Moltbook API
 */
async function verifyMoltbookToken(token: string): Promise<MoltbookVerifyResponse> {
  // In production, we must have a Moltbook app key configured
  if (process.env.NODE_ENV === 'production' && !MOLTBOOK_APP_KEY) {
    console.error('[Moltbook Auth] MOLTBOOK_APP_KEY not configured in production');
    return {
      valid: false,
      error: 'Moltbook authentication is not configured',
    };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), VERIFICATION_TIMEOUT_MS);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'Recoder/1.0',
    };

    if (MOLTBOOK_APP_KEY) {
      headers['X-App-Key'] = MOLTBOOK_APP_KEY;
    }

    const response = await fetch(MOLTBOOK_VERIFY_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        token,
        audience: 'recoder.xyz',
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[Moltbook Auth] Verification failed: ${response.status} - ${errorText}`);

      if (response.status === 401) {
        return { valid: false, error: 'Invalid Moltbook token' };
      } else if (response.status === 503) {
        return { valid: false, error: 'Moltbook service temporarily unavailable' };
      }
      return { valid: false, error: 'Moltbook verification failed' };
    }

    const data = await response.json() as { success?: boolean; data?: MoltbookVerifyResponse };

    if (!data.success || !data.data) {
      return { valid: false, error: 'Invalid response from Moltbook' };
    }

    return data.data;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        console.error('[Moltbook Auth] Verification timeout');
        return { valid: false, error: 'Moltbook verification timeout' };
      }
      console.error('[Moltbook Auth] Verification error:', error.message);
    }
    return { valid: false, error: 'Failed to verify Moltbook token' };
  }
}

/**
 * Mock verification for development/testing ONLY
 * Accepts tokens in format: moltbook_test_{agent_id}_{agent_name}
 *
 * WARNING: This should NEVER be used in production
 */
function verifyMoltbookTokenMock(token: string): MoltbookVerifyResponse {
  if (!ALLOW_TEST_TOKENS) {
    return { valid: false, error: 'Test tokens are not allowed in production' };
  }

  if (!token.startsWith('moltbook_test_')) {
    return { valid: false, error: 'Invalid test token format' };
  }

  const parts = token.split('_');
  if (parts.length < 4) {
    return { valid: false, error: 'Invalid test token format' };
  }

  const agentId = parts[2];
  const agentName = parts.slice(3).join('_');

  // Validate agent ID format
  if (!/^[a-zA-Z0-9_-]+$/.test(agentId) || agentId.length > 64) {
    return { valid: false, error: 'Invalid agent ID in test token' };
  }

  console.warn(`[Moltbook Auth] Using TEST token for agent ${agentId} - NOT FOR PRODUCTION`);

  return {
    valid: true,
    agent: {
      id: `test_${agentId}`,
      name: agentName || 'Test Agent',
      type: 'test',
      capabilities: ['basic'],
    },
  };
}

// ==================== Router ====================

const router = Router();

/**
 * POST /moltbook - Authenticate with Moltbook identity token
 *
 * This endpoint allows Moltbook agents to authenticate with Recoder
 * using their Moltbook identity token. It creates or retrieves a
 * Recoder account linked to the Moltbook identity and returns an API key.
 *
 * Body: { identity_token: string }
 * Returns: { apiKey, keyInfo, isNewAccount, moltbookAgent }
 */
router.post(
  '/moltbook',
  requestIdMiddleware,
  requestLoggingMiddleware,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const clientIp = getClientIp(req);

    // Rate limit check by IP
    const rateLimit = checkRateLimit(clientIp);

    res.setHeader('X-RateLimit-Limit', RATE_LIMIT.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateLimit.remaining.toString());
    res.setHeader('X-RateLimit-Reset', Math.ceil(rateLimit.resetAt / 1000).toString());

    if (!rateLimit.allowed) {
      logAuthEvent({
        type: rateLimit.blocked ? 'ip_blocked' : 'rate_limited',
        ip: clientIp,
        requestId,
        success: false,
      });

      const message = rateLimit.blocked
        ? 'Too many failed authentication attempts. Your IP is temporarily blocked.'
        : 'Too many authentication attempts. Try again later.';

      sendApiError(res, {
        code: 'RATE_LIMIT_EXCEEDED' as PublicApiErrorCode,
        message,
        statusCode: 429,
      }, requestId);
      return;
    }

    const body = req.body as MoltbookAuthRequest;

    // Validate input
    const validation = validateMoltbookToken(body.identity_token);
    if (!validation.valid) {
      logAuthEvent({
        type: 'invalid_token_format',
        ip: clientIp,
        requestId,
        success: false,
      });
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: validation.error || 'Invalid identity_token',
        statusCode: 400,
      }, requestId);
      return;
    }

    // Verify the Moltbook token
    let verifyResult: MoltbookVerifyResponse;

    // Use mock verification ONLY for test tokens in non-production
    if (ALLOW_TEST_TOKENS && body.identity_token.startsWith('moltbook_test_')) {
      verifyResult = verifyMoltbookTokenMock(body.identity_token);
    } else {
      verifyResult = await verifyMoltbookToken(body.identity_token);
    }

    if (!verifyResult.valid || !verifyResult.agent) {
      logAuthEvent({
        type: 'verification_failed',
        ip: clientIp,
        requestId,
        success: false,
        details: { error: verifyResult.error },
      });

      // Map to appropriate error code
      let errorCode: PublicApiErrorCode = 'EXTERNAL_TOKEN_INVALID' as PublicApiErrorCode;
      if (verifyResult.error?.includes('unavailable') || verifyResult.error?.includes('timeout')) {
        errorCode = 'EXTERNAL_PROVIDER_ERROR' as PublicApiErrorCode;
      }

      sendApiError(res, {
        code: errorCode,
        message: verifyResult.error || 'Invalid Moltbook identity token',
        statusCode: errorCode === 'EXTERNAL_PROVIDER_ERROR' ? 502 : 401,
      }, requestId);
      return;
    }

    const moltbookAgent = verifyResult.agent;

    // Get or create Recoder account for this Moltbook agent
    let accountResult;
    try {
      accountResult = getOrCreateRecoderAccount(
        'moltbook',
        moltbookAgent.id,
        moltbookAgent.name,
        {
          type: moltbookAgent.type,
          capabilities: moltbookAgent.capabilities,
          lastAuthAt: Date.now(),
          lastAuthIp: clientIp,
        }
      );
    } catch (error) {
      logAuthEvent({
        type: 'account_creation_failed',
        ip: clientIp,
        requestId,
        success: false,
        moltbookAgentId: moltbookAgent.id,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      sendApiError(res, {
        code: 'INTERNAL_ERROR' as PublicApiErrorCode,
        message: 'Failed to create or retrieve account',
        statusCode: 500,
      }, requestId);
      return;
    }

    const { recoderId, isNew } = accountResult;

    // Update metadata with latest auth info
    if (!isNew) {
      updateExternalIdentityMetadata(recoderId, 'moltbook', moltbookAgent.id, {
        lastAuthAt: Date.now(),
        lastAuthIp: clientIp,
        type: moltbookAgent.type,
        capabilities: moltbookAgent.capabilities,
      });
    }

    // Create API key for this agent
    // Moltbook agents get sandbox and project access by default
    const defaultScopes: ApiKeyScope[] = [
      'sandboxes:read',
      'sandboxes:write',
      'projects:read',
      'projects:write',
      'files:read',
      'files:write',
      'execute:commands',
    ];

    let keyResponse;
    try {
      keyResponse = createApiKey(recoderId, {
        name: `Moltbook: ${moltbookAgent.name}`,
        scopes: defaultScopes,
        isTestKey: moltbookAgent.type === 'test',
        metadata: {
          provider: 'moltbook',
          moltbookAgentId: moltbookAgent.id,
          moltbookAgentType: moltbookAgent.type,
          createdVia: 'moltbook_auth',
          createdFromIp: clientIp,
        },
      });
    } catch (error) {
      logAuthEvent({
        type: 'api_key_creation_failed',
        ip: clientIp,
        requestId,
        success: false,
        moltbookAgentId: moltbookAgent.id,
        recoderId,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      });
      sendApiError(res, {
        code: 'INTERNAL_ERROR' as PublicApiErrorCode,
        message: 'Failed to create API key',
        statusCode: 500,
      }, requestId);
      return;
    }

    logAuthEvent({
      type: isNew ? 'new_account_created' : 'authenticated',
      ip: clientIp,
      requestId,
      success: true,
      moltbookAgentId: moltbookAgent.id,
      recoderId,
      details: {
        agentType: moltbookAgent.type,
        keyPrefix: keyResponse.keyInfo.keyPrefix,
      },
    });

    const response: MoltbookAuthResponse = {
      apiKey: keyResponse.apiKey,
      keyInfo: keyResponse.keyInfo,
      isNewAccount: isNew,
      moltbookAgent,
    };

    sendApiSuccess(res, response, requestId, isNew ? 201 : 200);
  })
);

/**
 * GET /moltbook/status - Check if a Moltbook agent has a linked Recoder account
 *
 * Query: ?agent_id=xxx
 * Returns: { linked: boolean, recoderId?: string }
 */
router.get(
  '/moltbook/status',
  requestIdMiddleware,
  requestLoggingMiddleware,
  asyncApiHandler(async (req: AuthenticatedApiRequest, res) => {
    const requestId = req.requestId || 'unknown';
    const agentId = req.query.agent_id;

    if (!agentId || typeof agentId !== 'string') {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: 'agent_id query parameter is required',
        statusCode: 400,
      }, requestId);
      return;
    }

    // Validate agent ID format
    if (!/^[a-zA-Z0-9_-]+$/.test(agentId) || agentId.length > 128) {
      sendApiError(res, {
        code: 'VALIDATION_ERROR' as PublicApiErrorCode,
        message: 'Invalid agent_id format',
        statusCode: 400,
      }, requestId);
      return;
    }

    const recoderId = findRecoderIdByExternalId('moltbook', agentId);

    // Don't expose the full recoderId for privacy - just indicate if linked
    sendApiSuccess(res, {
      linked: !!recoderId,
      // Only return a truncated ID for debugging
      recoderIdPrefix: recoderId ? recoderId.slice(0, 12) + '...' : undefined,
    }, requestId);
  })
);

export { router as moltbookAuthRouter };
