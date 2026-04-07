"use strict";
/**
 * OpenClaw API Keys Route
 *
 * Manages API keys for OpenClaw integration.
 * Each OpenClaw user (identified by channel + userId) gets a unique Recoder API key.
 *
 * This allows OpenClaw agents (WhatsApp, Telegram, Discord bots) to automatically
 * provision API keys for code generation and sandbox management.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const crypto_1 = __importDefault(require("crypto"));
const middleware_js_1 = require("../middleware.js");
const api_keys_js_1 = require("../api-keys.js");
const persistence_js_1 = require("../../persistence.js");
const router = (0, express_1.Router)();
// ==================== Persistence ====================
function loadOpenClawKeysStore() {
    return (0, persistence_js_1.loadStore)('openclaw-keys', {
        keys: [],
    });
}
function saveOpenClawKeysStore() {
    const data = {
        keys: Array.from(openclawKeysMap.entries()),
    };
    (0, persistence_js_1.debouncedSave)('openclaw-keys', data);
}
// Load persisted data
const _stored = loadOpenClawKeysStore();
// OpenClaw API keys mapping (persisted)
const openclawKeysMap = new Map(_stored.keys);
console.log(`📦 Loaded ${openclawKeysMap.size} OpenClaw API key mappings from storage`);
// ==================== Helper Functions ====================
/**
 * Generate cache key for OpenClaw user
 */
function getOpenClawCacheKey(channel, userId) {
    return `${channel}:${userId}`;
}
/**
 * Hash an API key for storage
 */
function hashKey(key) {
    return crypto_1.default.createHash('sha256').update(key).digest('hex');
}
// ==================== Routes ====================
/**
 * POST /v1/api-keys/openclaw
 *
 * Register an OpenClaw API key. Creates or returns existing key for the user.
 */
router.post('/openclaw', middleware_js_1.requestIdMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const body = req.body;
    // Validate required fields
    if (!body.openclawUserId || !body.openclawChannel) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'openclawUserId and openclawChannel are required',
        }, requestId);
        return;
    }
    const cacheKey = getOpenClawCacheKey(body.openclawChannel, body.openclawUserId);
    // Check if key already exists
    const existing = openclawKeysMap.get(cacheKey);
    if (existing && body.apiKey) {
        // Verify the provided key matches the stored hash
        const providedHash = hashKey(body.apiKey);
        if (providedHash === existing.hashedKey) {
            (0, middleware_js_1.sendApiSuccess)(res, {
                message: 'API key already registered',
                keyId: existing.apiKeyId,
                isNew: false,
            }, requestId);
            return;
        }
    }
    // Return existing key info if exists (without full key - can't recover)
    if (existing) {
        (0, middleware_js_1.sendApiSuccess)(res, {
            message: 'API key already exists for this OpenClaw user',
            keyId: existing.apiKeyId,
            isNew: false,
            hint: 'Use the original API key or revoke and create a new one',
        }, requestId);
        return;
    }
    // Create new API key if apiKey was provided (from client-side generation)
    if (body.apiKey && body.keyInfo) {
        const keyHash = hashKey(body.apiKey);
        // Store the key mapping
        openclawKeysMap.set(cacheKey, {
            apiKeyId: body.keyInfo.id,
            hashedKey: keyHash,
            openclawUserId: body.openclawUserId,
            openclawChannel: body.openclawChannel,
            createdAt: Date.now(),
        });
        saveOpenClawKeysStore();
        // Register with the main API key store
        const createRequest = {
            name: `OpenClaw: ${body.openclawChannel}/${body.openclawUserId}`,
            scopes: body.scopes ?? [
                'sandboxes:read',
                'sandboxes:write',
                'projects:read',
                'projects:write',
                'files:read',
                'files:write',
                'execute:commands',
            ],
            metadata: {
                ...body.metadata,
                openclawUserId: body.openclawUserId,
                openclawChannel: body.openclawChannel,
                source: 'openclaw-plugin',
            },
        };
        const result = (0, api_keys_js_1.createApiKey)(body.openclawUserId, createRequest);
        (0, middleware_js_1.sendApiSuccess)(res, {
            message: 'API key registered successfully',
            keyId: result.keyInfo.id,
            keyPrefix: result.keyInfo.keyPrefix,
            isNew: true,
        }, requestId, 201);
        return;
    }
    // Generate a new key if none provided
    const createRequest = {
        name: `OpenClaw: ${body.openclawChannel}/${body.openclawUserId}`,
        scopes: body.scopes ?? [
            'sandboxes:read',
            'sandboxes:write',
            'projects:read',
            'projects:write',
            'files:read',
            'files:write',
            'execute:commands',
        ],
        metadata: {
            openclawUserId: body.openclawUserId,
            openclawChannel: body.openclawChannel,
            source: 'openclaw-plugin',
            ...body.metadata,
        },
    };
    const result = (0, api_keys_js_1.createApiKey)(body.openclawUserId, createRequest);
    // Store the mapping (note: we return the full key only this once)
    openclawKeysMap.set(cacheKey, {
        apiKeyId: result.keyInfo.id,
        hashedKey: hashKey(result.apiKey),
        openclawUserId: body.openclawUserId,
        openclawChannel: body.openclawChannel,
        createdAt: Date.now(),
    });
    saveOpenClawKeysStore();
    (0, middleware_js_1.sendApiSuccess)(res, {
        message: 'API key created successfully',
        apiKey: result.apiKey, // Only returned on creation
        keyId: result.keyInfo.id,
        keyPrefix: result.keyInfo.keyPrefix,
        isNew: true,
    }, requestId, 201);
}));
/**
 * POST /v1/api-keys/verify
 *
 * Verify an API key is valid
 */
router.post('/verify', middleware_js_1.requestIdMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    // Get API key from header
    const apiKeyString = req.headers['x-api-key'] ||
        req.headers.authorization?.replace('Bearer ', '');
    if (!apiKeyString) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'API key required in X-API-Key header or Authorization: Bearer',
        }, requestId);
        return;
    }
    const apiKey = (0, api_keys_js_1.validateApiKey)(apiKeyString);
    if (!apiKey) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Invalid or expired API key',
            statusCode: 401,
        }, requestId);
        return;
    }
    (0, middleware_js_1.sendApiSuccess)(res, {
        valid: true,
        keyId: apiKey.id,
        userId: apiKey.userId,
        scopes: apiKey.scopes,
        tier: apiKey.tier,
    }, requestId);
}));
/**
 * POST /v1/api-keys/revoke
 *
 * Revoke an API key
 */
router.post('/revoke', middleware_js_1.requestIdMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    // Get API key from header
    const apiKeyString = req.headers['x-api-key'] ||
        req.headers.authorization?.replace('Bearer ', '');
    if (!apiKeyString) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'API key required in X-API-Key header or Authorization: Bearer',
        }, requestId);
        return;
    }
    const apiKey = (0, api_keys_js_1.validateApiKey)(apiKeyString);
    if (!apiKey) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'INVALID_API_KEY',
            message: 'Invalid API key',
            statusCode: 401,
        }, requestId);
        return;
    }
    // Revoke the key (requires userId for ownership verification)
    const revoked = (0, api_keys_js_1.revokeApiKey)(apiKey.id, apiKey.userId);
    // Remove from OpenClaw mapping if present
    let removedFromOpenClaw = false;
    for (const [cacheKey, value] of openclawKeysMap.entries()) {
        if (value.apiKeyId === apiKey.id) {
            openclawKeysMap.delete(cacheKey);
            removedFromOpenClaw = true;
            break;
        }
    }
    if (removedFromOpenClaw) {
        saveOpenClawKeysStore();
    }
    (0, middleware_js_1.sendApiSuccess)(res, {
        revoked,
        keyId: apiKey.id,
    }, requestId);
}));
/**
 * GET /v1/api-keys/openclaw/:channel/:userId
 *
 * Get existing API key info for an OpenClaw user (without exposing the full key)
 */
router.get('/openclaw/:channel/:userId', middleware_js_1.requestIdMiddleware, (0, middleware_js_1.asyncApiHandler)(async (req, res) => {
    const requestId = req.requestId || 'unknown';
    const { channel, userId } = req.params;
    if (!channel || !userId) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'MISSING_REQUIRED_FIELD',
            message: 'channel and userId are required',
        }, requestId);
        return;
    }
    const cacheKey = getOpenClawCacheKey(channel, userId);
    const existing = openclawKeysMap.get(cacheKey);
    if (!existing) {
        (0, middleware_js_1.sendApiError)(res, {
            code: 'API_KEY_NOT_FOUND',
            message: 'No API key found for this OpenClaw user',
            statusCode: 404,
        }, requestId);
        return;
    }
    const apiKey = (0, api_keys_js_1.getApiKey)(existing.apiKeyId);
    if (!apiKey) {
        // Key was deleted
        openclawKeysMap.delete(cacheKey);
        (0, middleware_js_1.sendApiError)(res, {
            code: 'API_KEY_NOT_FOUND',
            message: 'API key has been revoked or deleted',
            statusCode: 404,
        }, requestId);
        return;
    }
    (0, middleware_js_1.sendApiSuccess)(res, {
        keyId: apiKey.id,
        keyPrefix: apiKey.keyPrefix,
        scopes: apiKey.scopes,
        tier: apiKey.tier,
        isActive: apiKey.isActive,
        createdAt: apiKey.createdAt,
        lastUsedAt: apiKey.lastUsedAt,
    }, requestId);
}));
exports.default = router;
