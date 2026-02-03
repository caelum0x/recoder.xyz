/**
 * Authentication Middleware for recoder-web
 * Provides JWT and session-based authentication
 */

import type { Request, Response, NextFunction } from 'express';
import type { AuthConfig, ExtendedRequest, UserSession, MiddlewareHandler } from './types';
import { CommonErrors } from './error-handler';

/**
 * Default authentication configuration
 */
const DEFAULT_AUTH_CONFIG: AuthConfig = {
  required: true,
  skipPaths: ['/health', '/api/health', '/docs', '/openapi.json', '/favicon.ico'],
  skipMethods: ['OPTIONS'],
  headerName: 'Authorization',
  cookieName: 'session',
};

/**
 * Check if path should skip authentication
 */
function shouldSkipAuth(path: string, method: string, config: AuthConfig): boolean {
  // Skip specific methods
  if (config.skipMethods?.includes(method)) {
    return true;
  }

  // Skip specific paths
  if (
    config.skipPaths?.some((skipPath) => {
      if (skipPath.endsWith('*')) {
        return path.startsWith(skipPath.slice(0, -1));
      }
      return path === skipPath;
    })
  ) {
    return true;
  }

  return false;
}

/**
 * Extract token from request headers or cookies
 */
function extractToken(req: Request, config: AuthConfig): string | null {
  // Try header first
  if (config.headerName) {
    const authHeader = req.get(config.headerName);
    if (authHeader) {
      // Handle "Bearer <token>" format
      if (authHeader.startsWith('Bearer ')) {
        return authHeader.slice(7);
      }
      return authHeader;
    }
  }

  // Try cookie
  if (config.cookieName) {
    const cookies = req.cookies || parseCookies(req.get('cookie') || '');
    const cookieValue = cookies[config.cookieName];
    if (cookieValue) {
      return cookieValue;
    }
  }

  return null;
}

/**
 * Parse cookies from header string
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const [key, value] = cookie.trim().split('=');
    if (key && value) {
      cookies[key] = decodeURIComponent(value);
    }
  });

  return cookies;
}

/**
 * Basic JWT token validation (without signature verification)
 * For production use, implement proper JWT verification with your auth service
 */
function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    if (!payload) return null;

    // Add padding if needed
    const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
    // Handle URL-safe base64
    const base64 = paddedPayload.replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(base64);
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(
  config?: Partial<AuthConfig>,
  sessionValidator?: (token: string) => Promise<UserSession | null>
): MiddlewareHandler {
  const finalConfig: AuthConfig = {
    ...DEFAULT_AUTH_CONFIG,
    ...config,
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const extendedReq = req as ExtendedRequest;
    const path = req.path;
    const method = req.method;

    // Check if authentication should be skipped
    if (shouldSkipAuth(path, method, finalConfig)) {
      next();
      return;
    }

    // Extract token from request
    const token = extractToken(req, finalConfig);

    if (!token) {
      if (finalConfig.required) {
        next(CommonErrors.unauthorized('Authentication token required'));
        return;
      }
      next();
      return;
    }

    try {
      let userSession: UserSession | null = null;

      if (sessionValidator) {
        // Use custom session validator
        userSession = await sessionValidator(token);
      } else {
        // Basic JWT parsing (for development/testing)
        const payload = parseJwtPayload(token);
        if (payload?.sub) {
          userSession = {
            userId: payload.sub as string,
            email: payload.email as string,
            activeOrganizationId: payload.org as string,
          };
        }
      }

      if (!userSession) {
        next(CommonErrors.unauthorized('Invalid authentication token'));
        return;
      }

      // Set user session in request
      extendedReq.userSession = userSession;

      next();
    } catch (error) {
      if (error instanceof Error && error.message.includes('unauthorized')) {
        next(error);
        return;
      }
      next(CommonErrors.unauthorized('Authentication failed'));
    }
  };
}

/**
 * Create optional authentication middleware
 * Sets user session if valid token is provided, but doesn't require it
 */
export function createOptionalAuthMiddleware(
  sessionValidator?: (token: string) => Promise<UserSession | null>
): MiddlewareHandler {
  return createAuthMiddleware({ required: false }, sessionValidator);
}

/**
 * Create role-based authorization middleware
 * Requires authentication and checks user roles
 */
export function createRoleAuthMiddleware(
  requiredRoles: string[],
  config?: Partial<AuthConfig>,
  sessionValidator?: (token: string) => Promise<UserSession | null>
): MiddlewareHandler {
  const authMiddleware = createAuthMiddleware(config, sessionValidator);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // First run authentication
    await new Promise<void>((resolve, reject) => {
      authMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const extendedReq = req as ExtendedRequest;
    const userSession = extendedReq.userSession;

    if (!userSession) {
      next(CommonErrors.unauthorized('Authentication required for role check'));
      return;
    }

    // Check if user has required roles
    const userRoles = userSession.roles || [];
    const hasRequiredRole = requiredRoles.some((role) => userRoles.includes(role));

    if (!hasRequiredRole) {
      next(CommonErrors.forbidden(`Access denied. Required roles: ${requiredRoles.join(', ')}`));
      return;
    }

    next();
  };
}

/**
 * Create organization-based authorization middleware
 * Requires authentication and checks organization membership
 */
export function createOrgAuthMiddleware(
  config?: Partial<AuthConfig>,
  sessionValidator?: (token: string) => Promise<UserSession | null>
): MiddlewareHandler {
  const authMiddleware = createAuthMiddleware(config, sessionValidator);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // First run authentication
    await new Promise<void>((resolve, reject) => {
      authMiddleware(req, res, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

    const extendedReq = req as ExtendedRequest;
    const userSession = extendedReq.userSession;

    if (!userSession?.activeOrganizationId) {
      next(CommonErrors.forbidden('Organization membership required'));
      return;
    }

    next();
  };
}

/**
 * Create API key authentication middleware
 * For service-to-service authentication
 */
export function createApiKeyAuthMiddleware(
  validApiKeys: string[] | ((apiKey: string) => Promise<boolean>),
  headerName = 'X-API-Key'
): MiddlewareHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const extendedReq = req as ExtendedRequest;
    const apiKey = req.get(headerName);

    if (!apiKey) {
      next(CommonErrors.unauthorized('API key required'));
      return;
    }

    let isValid = false;

    if (Array.isArray(validApiKeys)) {
      isValid = validApiKeys.includes(apiKey);
    } else {
      isValid = await validApiKeys(apiKey);
    }

    if (!isValid) {
      next(CommonErrors.unauthorized('Invalid API key'));
      return;
    }

    // Set a service session
    extendedReq.userSession = {
      userId: 'service',
      email: 'service@recoder.xyz',
    };

    next();
  };
}

/**
 * Authentication utilities
 */
export const AuthUtils = {
  /**
   * Get user session from request
   */
  getUserSession: (req: Request): UserSession | null => {
    return (req as ExtendedRequest).userSession || null;
  },

  /**
   * Get user ID from request
   */
  getUserId: (req: Request): string | null => {
    const session = (req as ExtendedRequest).userSession;
    return session?.userId || null;
  },

  /**
   * Get organization ID from request
   */
  getOrgId: (req: Request): string | null => {
    const session = (req as ExtendedRequest).userSession;
    return session?.activeOrganizationId || null;
  },

  /**
   * Check if user is authenticated
   */
  isAuthenticated: (req: Request): boolean => {
    return !!(req as ExtendedRequest).userSession;
  },

  /**
   * Require authentication (throws if not authenticated)
   */
  requireAuth: (req: Request): UserSession => {
    const session = (req as ExtendedRequest).userSession;
    if (!session) {
      throw CommonErrors.unauthorized('Authentication required');
    }
    return session;
  },

  /**
   * Require organization membership (throws if not member)
   */
  requireOrg: (req: Request): string => {
    const session = AuthUtils.requireAuth(req);
    if (!session.activeOrganizationId) {
      throw CommonErrors.forbidden('Organization membership required');
    }
    return session.activeOrganizationId;
  },
};
