/**
 * Middleware Utilities for recoder-web
 * Provides Express/Remix compatible middleware for:
 * - Error handling
 * - CORS configuration
 * - Rate limiting
 * - Authentication
 * - Logging
 */

// Export all types
export type {
  MiddlewareHandler,
  ExtendedRequest,
  UserSession,
  EnvironmentConfig,
  CorsConfig,
  ErrorResponse,
  SuccessResponse,
  RateLimitConfig,
  RateLimitEntry,
  LoggingConfig,
  AuthConfig,
  LogEntry,
  HealthCheckResult,
} from './types';

// Export CORS middleware
export {
  createCorsMiddleware,
  createPublicCorsMiddleware,
  createStrictCorsMiddleware,
  createCdnCorsMiddleware,
} from './cors';

// Export error handling
export {
  RecoderError,
  CommonErrorCodes,
  createErrorHandler,
  asyncHandler,
  CommonErrors,
  notFoundHandler,
} from './error-handler';
export type { CommonErrorCode } from './error-handler';

// Export logging middleware
export {
  createRequestIdMiddleware,
  createLoggingMiddleware,
  createLogger,
  createPerformanceLoggingMiddleware,
  createAccessLogMiddleware,
} from './logging';

// Export rate limiting middleware
export {
  createRateLimitMiddleware,
  createDefaultRateLimitMiddleware,
  createUploadRateLimitMiddleware,
  createAuthRateLimitMiddleware,
  createUserRateLimitMiddleware,
  createEndpointRateLimitMiddleware,
  createSlidingWindowRateLimitMiddleware,
  RateLimitPresets,
} from './rate-limit';

// Export authentication middleware
export {
  createAuthMiddleware,
  createOptionalAuthMiddleware,
  createRoleAuthMiddleware,
  createOrgAuthMiddleware,
  createApiKeyAuthMiddleware,
  AuthUtils,
} from './auth';

// Local imports for use in createMiddlewareStack
import { createRequestIdMiddleware, createLoggingMiddleware } from './logging';
import { createCorsMiddleware } from './cors';
import { createRateLimitMiddleware } from './rate-limit';
import { createAuthMiddleware } from './auth';
import { createErrorHandler, notFoundHandler } from './error-handler';

/**
 * Create a complete middleware stack with sensible defaults
 * Use this for quick setup of common middleware patterns
 */
export function createMiddlewareStack(options?: {
  service?: string;
  corsConfig?: Partial<import('./types').CorsConfig>;
  rateLimitConfig?: Partial<import('./types').RateLimitConfig>;
  loggingConfig?: Partial<import('./types').LoggingConfig>;
  authConfig?: Partial<import('./types').AuthConfig>;
  sessionValidator?: (token: string) => Promise<import('./types').UserSession | null>;
}) {
  const {
    service = 'recoder-web',
    corsConfig,
    rateLimitConfig,
    loggingConfig,
    authConfig,
    sessionValidator,
  } = options || {};

  return {
    requestId: createRequestIdMiddleware(),
    cors: createCorsMiddleware(corsConfig),
    logging: createLoggingMiddleware({ service, ...loggingConfig }),
    rateLimit: createRateLimitMiddleware({
      windowMs: 60000,
      maxRequests: 100,
      ...rateLimitConfig,
    }),
    auth: createAuthMiddleware(authConfig, sessionValidator),
    errorHandler: createErrorHandler(service),
    notFound: notFoundHandler,
  };
}
