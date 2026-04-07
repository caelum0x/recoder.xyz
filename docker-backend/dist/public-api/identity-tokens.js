"use strict";
/**
 * Identity Token Management
 *
 * Handles generation and validation of identity tokens for third-party authentication.
 * Identity tokens allow Recoder users to prove their identity to external applications.
 *
 * Token format: idt_{random} (short-lived, 1 hour expiration)
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports._testing = void 0;
exports.createIdentityToken = createIdentityToken;
exports.validateIdentityToken = validateIdentityToken;
exports.verifyIdentityToken = verifyIdentityToken;
exports.revokeIdentityToken = revokeIdentityToken;
exports.listUserIdentityTokens = listUserIdentityTokens;
exports.cleanupExpiredTokens = cleanupExpiredTokens;
exports.getIdentityTokenStats = getIdentityTokenStats;
const crypto_1 = __importDefault(require("crypto"));
const persistence_js_1 = require("../persistence.js");
// ==================== Configuration ====================
/**
 * Secret for token signing - REQUIRED for production
 */
let _tokenSecret = null;
function getTokenSecret() {
    if (!_tokenSecret) {
        const secret = process.env.IDENTITY_TOKEN_SECRET;
        if (!secret) {
            throw new Error('IDENTITY_TOKEN_SECRET environment variable must be set for identity token security');
        }
        _tokenSecret = secret;
    }
    return _tokenSecret;
}
/**
 * Token configuration
 */
const TOKEN_EXPIRATION_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_RANDOM_LENGTH = 32;
const TOKEN_PREFIX = 'idt';
/**
 * Default scopes if none specified
 */
const DEFAULT_SCOPES = ['profile:read'];
/**
 * Valid scopes
 */
const VALID_SCOPES = ['profile:read', 'projects:read', 'usage:read'];
function loadIdentityTokenStore() {
    return (0, persistence_js_1.loadStore)('identity-tokens', {
        tokens: [],
        tokensByUser: [],
    });
}
function saveIdentityTokenStore() {
    const data = {
        tokens: Array.from(tokens.entries()),
        tokensByUser: Array.from(tokensByUser.entries()).map(([userId, tokenSet]) => [userId, Array.from(tokenSet)]),
    };
    (0, persistence_js_1.debouncedSave)('identity-tokens', data);
}
// Load persisted data
const _stored = loadIdentityTokenStore();
/**
 * Token storage (by jti)
 */
const tokens = new Map(_stored.tokens);
/**
 * Index by user ID for listing/cleanup
 */
const tokensByUser = new Map(_stored.tokensByUser.map(([userId, tokenIds]) => [userId, new Set(tokenIds)]));
// ==================== Token Generation ====================
/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length) {
    return crypto_1.default.randomBytes(length).toString('base64url').slice(0, length);
}
/**
 * Hash a token for storage
 */
function hashToken(token) {
    return crypto_1.default
        .createHmac('sha256', getTokenSecret())
        .update(token)
        .digest('hex');
}
/**
 * Generate a new identity token
 * Format: idt_{random}
 */
function generateToken() {
    const jti = `jti_${crypto_1.default.randomUUID()}`;
    const randomPart = generateRandomString(TOKEN_RANDOM_LENGTH);
    const prefix = `${TOKEN_PREFIX}_${randomPart.slice(0, 8)}`;
    const fullToken = `${TOKEN_PREFIX}_${randomPart}`;
    const hash = hashToken(fullToken);
    return { fullToken, prefix, hash, jti };
}
// ==================== Token Management ====================
/**
 * Create a new identity token
 *
 * @param userId - User ID who is generating the token
 * @param request - Token creation request
 * @returns The token response with expiration info
 */
function createIdentityToken(userId, request) {
    // Validate scopes
    const scopes = request.scopes || DEFAULT_SCOPES;
    for (const scope of scopes) {
        if (!VALID_SCOPES.includes(scope)) {
            throw new Error(`Invalid scope: ${scope}`);
        }
    }
    // Generate token
    const { fullToken, prefix, hash, jti } = generateToken();
    const now = Date.now();
    const expiresAt = now + TOKEN_EXPIRATION_MS;
    // Create token record
    const token = {
        id: jti,
        userId,
        hashedToken: hash,
        tokenPrefix: prefix,
        expiresAt,
        scopes,
        audience: request.audience,
        createdAt: now,
        isRevoked: false,
    };
    // Store token
    tokens.set(jti, token);
    // Add to user index
    if (!tokensByUser.has(userId)) {
        tokensByUser.set(userId, new Set());
    }
    tokensByUser.get(userId).add(jti);
    saveIdentityTokenStore();
    console.log(`[Identity Tokens] Created token ${prefix} for user ${userId}`);
    return {
        identity_token: fullToken,
        expires_at: new Date(expiresAt).toISOString(),
        expires_in: TOKEN_EXPIRATION_MS / 1000,
    };
}
/**
 * Validate an identity token and return the token record
 *
 * @param tokenString - The full identity token
 * @returns The token record or null if invalid
 */
function validateIdentityToken(tokenString) {
    // Check format
    if (!tokenString || !tokenString.startsWith(`${TOKEN_PREFIX}_`)) {
        return null;
    }
    // Hash and lookup
    const hash = hashToken(tokenString);
    // Find token by hash (we need to search since we store by jti)
    for (const token of tokens.values()) {
        if (token.hashedToken === hash) {
            // Check if revoked
            if (token.isRevoked) {
                return null;
            }
            // Check expiration
            if (token.expiresAt < Date.now()) {
                return null;
            }
            return token;
        }
    }
    return null;
}
/**
 * Verify an identity token for a third-party app
 *
 * @param request - Verification request
 * @param getUserInfo - Function to get user info by ID
 * @returns Verification response
 */
async function verifyIdentityToken(request, getUserInfo) {
    const token = validateIdentityToken(request.token);
    if (!token) {
        return {
            valid: false,
            error: 'Invalid or expired token',
        };
    }
    // Check audience if specified
    if (token.audience && request.audience && token.audience !== request.audience) {
        return {
            valid: false,
            error: 'Token audience mismatch',
        };
    }
    // Token specifies audience but request doesn't provide one
    if (token.audience && !request.audience) {
        return {
            valid: false,
            error: 'Audience required for this token',
        };
    }
    // Get user info
    const agentInfo = await getUserInfo(token.userId);
    if (!agentInfo) {
        return {
            valid: false,
            error: 'User not found',
        };
    }
    return {
        valid: true,
        agent: agentInfo,
    };
}
/**
 * Revoke an identity token
 */
function revokeIdentityToken(jti, userId) {
    const token = tokens.get(jti);
    if (!token) {
        return false;
    }
    // Verify ownership
    if (token.userId !== userId) {
        return false;
    }
    // Mark as revoked
    token.isRevoked = true;
    saveIdentityTokenStore();
    console.log(`[Identity Tokens] Revoked token ${token.tokenPrefix} for user ${userId}`);
    return true;
}
/**
 * List all identity tokens for a user
 */
function listUserIdentityTokens(userId) {
    const tokenIds = tokensByUser.get(userId);
    if (!tokenIds) {
        return [];
    }
    const userTokens = [];
    const now = Date.now();
    for (const jti of tokenIds) {
        const token = tokens.get(jti);
        if (token && !token.isRevoked && token.expiresAt > now) {
            const { hashedToken, ...safeToken } = token;
            userTokens.push(safeToken);
        }
    }
    return userTokens.sort((a, b) => b.createdAt - a.createdAt);
}
/**
 * Clean up expired tokens (call periodically)
 */
function cleanupExpiredTokens() {
    const now = Date.now();
    let cleaned = 0;
    for (const [jti, token] of tokens.entries()) {
        if (token.expiresAt < now || token.isRevoked) {
            tokens.delete(jti);
            const userTokens = tokensByUser.get(token.userId);
            if (userTokens) {
                userTokens.delete(jti);
                if (userTokens.size === 0) {
                    tokensByUser.delete(token.userId);
                }
            }
            cleaned++;
        }
    }
    if (cleaned > 0) {
        saveIdentityTokenStore();
        console.log(`[Identity Tokens] Cleaned up ${cleaned} expired tokens`);
    }
    return cleaned;
}
// Run cleanup every 10 minutes
setInterval(cleanupExpiredTokens, 10 * 60 * 1000);
/**
 * Get identity token stats
 */
function getIdentityTokenStats() {
    const now = Date.now();
    let totalActive = 0;
    for (const token of tokens.values()) {
        if (!token.isRevoked && token.expiresAt > now) {
            totalActive++;
        }
    }
    return {
        totalActive,
        tokensByUser: tokensByUser.size,
    };
}
// Export for testing
exports._testing = {
    tokens,
    tokensByUser,
    clearAll: () => {
        tokens.clear();
        tokensByUser.clear();
        saveIdentityTokenStore();
    },
};
