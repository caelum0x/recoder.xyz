/**
 * Identity Token Management
 *
 * Handles generation and validation of identity tokens for third-party authentication.
 * Identity tokens allow Recoder users to prove their identity to external applications.
 *
 * Token format: idt_{random} (short-lived, 1 hour expiration)
 */

import crypto from 'crypto';
import type {
  IdentityToken,
  IdentityTokenScope,
  CreateIdentityTokenRequest,
  CreateIdentityTokenResponse,
  VerifyIdentityRequest,
  VerifyIdentityResponse,
  VerifiedAgentInfo,
} from './types.js';
import { loadStore, debouncedSave } from '../persistence.js';

// ==================== Configuration ====================

/**
 * Secret for token signing - REQUIRED for production
 */
let _tokenSecret: string | null = null;
function getTokenSecret(): string {
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
const DEFAULT_SCOPES: IdentityTokenScope[] = ['profile:read'];

/**
 * Valid scopes
 */
const VALID_SCOPES: IdentityTokenScope[] = ['profile:read', 'projects:read', 'usage:read'];

// ==================== Storage ====================

interface IdentityTokenStoreData {
  tokens: [string, IdentityToken][];
  tokensByUser: [string, string[]][];
}

function loadIdentityTokenStore(): IdentityTokenStoreData {
  return loadStore<IdentityTokenStoreData>('identity-tokens', {
    tokens: [],
    tokensByUser: [],
  });
}

function saveIdentityTokenStore(): void {
  const data: IdentityTokenStoreData = {
    tokens: Array.from(tokens.entries()),
    tokensByUser: Array.from(tokensByUser.entries()).map(
      ([userId, tokenSet]) => [userId, Array.from(tokenSet)]
    ),
  };
  debouncedSave('identity-tokens', data);
}

// Load persisted data
const _stored = loadIdentityTokenStore();

/**
 * Token storage (by jti)
 */
const tokens = new Map<string, IdentityToken>(_stored.tokens);

/**
 * Index by user ID for listing/cleanup
 */
const tokensByUser = new Map<string, Set<string>>(
  _stored.tokensByUser.map(([userId, tokenIds]) => [userId, new Set(tokenIds)])
);

// ==================== Token Generation ====================

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Hash a token for storage
 */
function hashToken(token: string): string {
  return crypto
    .createHmac('sha256', getTokenSecret())
    .update(token)
    .digest('hex');
}

/**
 * Generate a new identity token
 * Format: idt_{random}
 */
function generateToken(): { fullToken: string; prefix: string; hash: string; jti: string } {
  const jti = `jti_${crypto.randomUUID()}`;
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
export function createIdentityToken(
  userId: string,
  request: CreateIdentityTokenRequest
): CreateIdentityTokenResponse {
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
  const token: IdentityToken = {
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
  tokensByUser.get(userId)!.add(jti);

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
export function validateIdentityToken(tokenString: string): IdentityToken | null {
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
export async function verifyIdentityToken(
  request: VerifyIdentityRequest,
  getUserInfo: (userId: string) => Promise<VerifiedAgentInfo | null>
): Promise<VerifyIdentityResponse> {
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
export function revokeIdentityToken(jti: string, userId: string): boolean {
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
export function listUserIdentityTokens(userId: string): Omit<IdentityToken, 'hashedToken'>[] {
  const tokenIds = tokensByUser.get(userId);

  if (!tokenIds) {
    return [];
  }

  const userTokens: Omit<IdentityToken, 'hashedToken'>[] = [];
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
export function cleanupExpiredTokens(): number {
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
export function getIdentityTokenStats(): {
  totalActive: number;
  tokensByUser: number;
} {
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
export const _testing = {
  tokens,
  tokensByUser,
  clearAll: () => {
    tokens.clear();
    tokensByUser.clear();
    saveIdentityTokenStore();
  },
};
