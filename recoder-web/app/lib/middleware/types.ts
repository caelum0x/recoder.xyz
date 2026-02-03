/**
 * Middleware Types for recoder-web
 * Adapted from Libra middleware for Remix/Express environment
 */

import type { Request, Response, NextFunction } from 'express';

/**
 * Express middleware handler type
 */
export type MiddlewareHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => void | Promise<void>;

/**
 * Request with extended context
 */
export interface ExtendedRequest extends Request {
  requestId?: string;
  userSession?: UserSession;
  startTime?: number;
}

/**
 * User session interface
 */
export interface UserSession {
  userId: string;
  email?: string;
  activeOrganizationId?: string;
  roles?: string[];
  [key: string]: unknown;
}

/**
 * Environment configuration
 */
export interface EnvironmentConfig {
  ENVIRONMENT: 'development' | 'production' | 'staging';
  LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error';
  NODE_ENV?: string;
}

/**
 * CORS configuration options
 */
export interface CorsConfig {
  allowedOrigins: string[];
  allowMethods: string[];
  allowHeaders: string[];
  credentials: boolean;
  maxAge: number;
  exposeHeaders?: string[];
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    requestId?: string;
  };
  timestamp: string;
}

/**
 * Success response structure
 */
export interface SuccessResponse<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
  requestId?: string;
}

/**
 * Rate limiting configuration
 */
export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: ExtendedRequest) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

/**
 * In-memory rate limit store entry
 */
export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  service: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  includeHeaders?: boolean;
  includeBody?: boolean;
  excludePaths?: string[];
}

/**
 * Authentication configuration
 */
export interface AuthConfig {
  required: boolean;
  skipPaths?: string[];
  skipMethods?: string[];
  headerName?: string;
  cookieName?: string;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  service: string;
  requestId: string;
  metadata?: Record<string, unknown>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'error';
  timestamp: string;
  service: string;
  version: string;
  requestId: string;
  checks?: Record<string, boolean | { status: boolean; message: string }>;
  error?: string;
}
