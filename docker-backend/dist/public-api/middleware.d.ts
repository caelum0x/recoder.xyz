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
import type { ApiKey, ApiKeyScope, AppKey, PublicApiErrorCode } from './types.js';
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
 * Extended request with App key context (for third-party developers)
 */
export interface AppKeyAuthenticatedRequest extends AuthenticatedApiRequest {
    /** The validated app key */
    appKey?: AppKey;
    /** App key ID */
    appKeyId?: string;
    /** User ID who owns the app key */
    appKeyOwnerId?: string;
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
/**
 * Send standardized API error response
 */
export declare function sendApiError(res: Response, options: ApiErrorOptions, requestId?: string): void;
/**
 * Send standardized API success response
 */
export declare function sendApiSuccess<T>(res: Response, data: T, requestId: string, statusCode?: number): void;
export declare function requestIdMiddleware(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
/**
 * Authenticate requests using API key
 *
 * Expects: Authorization: Bearer sk_xxx_xxx
 */
export declare function authenticateApiKey(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
/**
 * Authenticate requests using App key (for third-party developers)
 *
 * Expects: X-App-Key: app_xxx_xxx
 */
export declare function authenticateAppKey(req: AppKeyAuthenticatedRequest, res: Response, next: NextFunction): void;
/**
 * Apply rate limiting based on API key tier
 */
export declare function rateLimitMiddleware(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
/**
 * Check sandbox creation limit
 */
export declare function sandboxLimitMiddleware(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
type RouteRateLimitKey = 'projectPrompt' | 'projectTaskRead' | 'projectTaskStream';
export declare function requireRouteRateLimit(routeKey: RouteRateLimitKey): (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => void;
/**
 * Create middleware to require specific scope(s)
 *
 * @param requiredScopes - Scopes required (any one of them)
 * @returns Express middleware
 */
export declare function requireScope(...requiredScopes: ApiKeyScope[]): (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => void;
/**
 * Create middleware to require ALL specified scopes
 */
export declare function requireAllScopes(...requiredScopes: ApiKeyScope[]): (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => void;
/**
 * Log API requests
 */
export declare function requestLoggingMiddleware(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
/**
 * Validate request body exists and is JSON
 */
export declare function requireJsonBody(req: AuthenticatedApiRequest, res: Response, next: NextFunction): void;
/**
 * Create middleware to validate required fields
 */
export declare function requireFields(...fields: string[]): (req: AuthenticatedApiRequest, res: Response, next: NextFunction) => void;
/**
 * Get client IP address from request
 */
export declare function getClientIp(req: Request): string;
/**
 * Async handler wrapper for route handlers
 */
export declare function asyncApiHandler<T extends AuthenticatedApiRequest = AuthenticatedApiRequest>(fn: (req: T, res: Response, next: NextFunction) => Promise<void>): (req: T, res: Response, next: NextFunction) => void;
/**
 * Standard middleware stack for public API routes
 * Apply in order: requestId -> auth -> rateLimit -> logging
 */
export declare const standardMiddleware: (typeof requestIdMiddleware)[];
/**
 * Middleware for sandbox creation (includes sandbox limit check)
 */
export declare const sandboxCreationMiddleware: ((req: AuthenticatedApiRequest, res: Response, next: NextFunction) => void)[];
export {};
