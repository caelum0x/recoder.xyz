/**
 * Identity Token Management
 *
 * Handles generation and validation of identity tokens for third-party authentication.
 * Identity tokens allow Recoder users to prove their identity to external applications.
 *
 * Token format: idt_{random} (short-lived, 1 hour expiration)
 */
import type { IdentityToken, CreateIdentityTokenRequest, CreateIdentityTokenResponse, VerifyIdentityRequest, VerifyIdentityResponse, VerifiedAgentInfo } from './types.js';
/**
 * Create a new identity token
 *
 * @param userId - User ID who is generating the token
 * @param request - Token creation request
 * @returns The token response with expiration info
 */
export declare function createIdentityToken(userId: string, request: CreateIdentityTokenRequest): CreateIdentityTokenResponse;
/**
 * Validate an identity token and return the token record
 *
 * @param tokenString - The full identity token
 * @returns The token record or null if invalid
 */
export declare function validateIdentityToken(tokenString: string): IdentityToken | null;
/**
 * Verify an identity token for a third-party app
 *
 * @param request - Verification request
 * @param getUserInfo - Function to get user info by ID
 * @returns Verification response
 */
export declare function verifyIdentityToken(request: VerifyIdentityRequest, getUserInfo: (userId: string) => Promise<VerifiedAgentInfo | null>): Promise<VerifyIdentityResponse>;
/**
 * Revoke an identity token
 */
export declare function revokeIdentityToken(jti: string, userId: string): boolean;
/**
 * List all identity tokens for a user
 */
export declare function listUserIdentityTokens(userId: string): Omit<IdentityToken, 'hashedToken'>[];
/**
 * Clean up expired tokens (call periodically)
 */
export declare function cleanupExpiredTokens(): number;
/**
 * Get identity token stats
 */
export declare function getIdentityTokenStats(): {
    totalActive: number;
    tokensByUser: number;
};
export declare const _testing: {
    tokens: Map<string, IdentityToken>;
    tokensByUser: Map<string, Set<string>>;
    clearAll: () => void;
};
