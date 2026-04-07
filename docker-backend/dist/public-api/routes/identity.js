"use strict";
/**
 * Identity API Routes
 *
 * Endpoints for identity token management:
 * - POST /v1/identity/token  - Generate an identity token (requires API key)
 * - POST /v1/identity/verify - Verify an identity token (requires app key)
 * - GET  /v1/identity/tokens - List active identity tokens (requires API key)
 * - DELETE /v1/identity/tokens/:id - Revoke an identity token (requires API key)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.identityRouter = void 0;
exports.setUserInfoProvider = setUserInfoProvider;
const express_1 = require("express");
const middleware_js_1 = require("../middleware.js");
const identity_tokens_js_1 = require("../identity-tokens.js");
const app_keys_js_1 = require("../app-keys.js");
const validation_js_1 = require("../validation.js");
// ==================== Rate Limiting ====================
/**
 * Simple in-memory rate limiting for identity operations
 * In production, consider using Redis for distributed rate limiting
 */
const rateLimits = {
    generate: new Map(),
    verify: new Map(),
};
const RATE_LIMITS = {
    generate: { limit: 10, windowMs: 60 * 1000 }, // 10 per minute
    verify: { limit: 100, windowMs: 60 * 1000 }, // 100 per minute
};
function checkRateLimit(type, key) {
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
        if (entry.resetAt <= now)
            rateLimits.generate.delete(key);
    }
    for (const [key, entry] of rateLimits.verify) {
        if (entry.resetAt <= now)
            rateLimits.verify.delete(key);
    }
}, 5 * 60 * 1000); // Every 5 minutes
// ==================== User Info Provider ====================
/**
 * This should be injected from the main server with actual user data
 * For now, we use a placeholder that can be overridden
 */
let getUserInfoProvider = async (userId) => {
    // Default implementation - returns basic info
    // In production, this should query actual user data
    return {
        id: userId,
        name: `User ${userId.slice(0, 8)}`,
        tier: 'free',
        stats: {
            totalProjects: 0,
            memberSince: Date.now(),
        },
    };
};
/**
 * Set the user info provider function
 */
function setUserInfoProvider(provider) {
    getUserInfoProvider = provider;
}
// ==================== Audit Logging ====================
function logSecurityEvent(event) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        category: 'security',
        ...event,
    };
    if (event.success) {
        console.log('[Identity Security]', JSON.stringify(logEntry));
    }
    else {
        console.warn('[Identity Security]', JSON.stringify(logEntry));
    }
}
// ==================== Router ====================
const router = (0, express_1.Router)();
exports.identityRouter = router;
/**
 * POST /token - Generate an identity token
 *
 * Requires: API key authentication
 * Body: { audience?: string, scopes?: string[] }
 * Returns: { identity_token, expires_at, expires_in }
 */
router.post('/token', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
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
        (0, middleware_js_1.sendApiError)(res, {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Identity token generation rate limit exceeded. Try again later.',
            statusCode: 429,
        }, requestId);
        return;
    }
    const body = req.body;
    // Validate inputs
    const validation = (0, validation_js_1.combineValidations)((0, validation_js_1.validateAudience)(body.audience), (0, validation_js_1.validateScopes)(body.scopes));
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid request',
            statusCode: 400,
        }, requestId);
        return;
    }
    try {
        const response = (0, identity_tokens_js_1.createIdentityToken)(userId, body);
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
        (0, middleware_js_1.sendApiSuccess)(res, response, requestId, 201);
    }
    catch (error) {
        logSecurityEvent({
            type: 'token_generation_failed',
            userId,
            requestId,
            success: false,
            details: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
        (0, middleware_js_1.sendApiError)(res, {
            code: 'IDENTITY_TOKEN_CREATION_FAILED',
            message: 'Failed to create identity token',
            statusCode: 500,
        }, requestId);
    }
}));
/**
 * POST /verify - Verify an identity token
 *
 * Requires: App key authentication (X-App-Key header)
 * Body: { token, audience? }
 * Returns: { valid, agent?: { id, name, tier, stats }, error? }
 */
router.post('/verify', middleware_js_1.requestIdMiddleware, middleware_js_1.requestLoggingMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    // Authenticate with app key
    const appKeyHeader = req.headers['x-app-key'];
    if (!appKeyHeader || typeof appKeyHeader !== 'string') {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_INVALID',
            message: 'Missing X-App-Key header. App key required for token verification.',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Basic format check before validation
    if (!appKeyHeader.startsWith('app_')) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_INVALID',
            message: 'Invalid app key format',
            statusCode: 401,
        }, requestId);
        return;
    }
    const appKey = (0, app_keys_js_1.validateAppKey)(appKeyHeader);
    if (!appKey) {
        logSecurityEvent({
            type: 'app_key_validation_failed',
            requestId,
            success: false,
            details: { keyPrefix: appKeyHeader.slice(0, 12) },
        });
        (0, middleware_js_1.sendApiError)(res, {
            code: 'APP_KEY_INVALID',
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
        (0, middleware_js_1.sendApiError)(res, {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Token verification rate limit exceeded. Try again later.',
            statusCode: 429,
        }, requestId);
        return;
    }
    const body = req.body;
    // Validate inputs
    const validation = (0, validation_js_1.combineValidations)((0, validation_js_1.validateIdentityTokenFormat)(body.token), (0, validation_js_1.validateAudience)(body.audience));
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid request',
            statusCode: 400,
        }, requestId);
        return;
    }
    const response = await (0, identity_tokens_js_1.verifyIdentityToken)(body, getUserInfoProvider);
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
    (0, middleware_js_1.sendApiSuccess)(res, response, requestId);
}));
/**
 * GET /tokens - List active identity tokens for the authenticated user
 *
 * Requires: API key authentication
 * Returns: { tokens: [...] }
 */
router.get('/tokens', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    const tokens = (0, identity_tokens_js_1.listUserIdentityTokens)(userId);
    (0, middleware_js_1.sendApiSuccess)(res, { tokens }, requestId);
}));
/**
 * DELETE /tokens/:id - Revoke an identity token
 *
 * Requires: API key authentication
 * Returns: { revoked: true }
 */
router.delete('/tokens/:id', (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const userId = req.userId;
    const tokenId = req.params.id;
    if (!userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Authentication required',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Validate token ID format
    const validation = (0, validation_js_1.validateUUID)(tokenId, 'tokenId');
    if (!validation.valid) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'VALIDATION_ERROR',
            message: validation.error || 'Invalid token ID',
            statusCode: 400,
        }, requestId);
        return;
    }
    const revoked = (0, identity_tokens_js_1.revokeIdentityToken)(tokenId, userId);
    if (!revoked) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'IDENTITY_TOKEN_INVALID',
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
    (0, middleware_js_1.sendApiSuccess)(res, { revoked: true }, requestId);
}));
