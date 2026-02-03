/**
 * Error Handler Middleware for recoder-web
 * Provides centralized error handling with proper logging and response formatting
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import type { ErrorResponse, ExtendedRequest } from './types';

/**
 * Base error class for recoder applications
 */
export class RecoderError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'RecoderError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Common error codes used across the application
 */
export const CommonErrorCodes = {
  // Client errors (4xx)
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONFLICT: 'CONFLICT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
} as const;

export type CommonErrorCode = (typeof CommonErrorCodes)[keyof typeof CommonErrorCodes];

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return (
    process.env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production'
  );
}

/**
 * Create a sanitized error response based on environment
 */
function createErrorResponse(
  error: unknown,
  requestId?: string,
  _service?: string
): ErrorResponse {
  const isProd = isProduction();

  // Handle known error types
  if (error instanceof RecoderError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: isProd ? undefined : error.details,
        requestId,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Handle Zod validation errors
  if (error && typeof error === 'object' && 'issues' in error) {
    return {
      success: false,
      error: {
        code: CommonErrorCodes.VALIDATION_ERROR,
        message: 'Request validation failed',
        details: isProd ? undefined : (error as any).issues,
        requestId,
      },
      timestamp: new Date().toISOString(),
    };
  }

  // Generic error handling
  const message = error instanceof Error ? error.message : 'An unexpected error occurred';

  return {
    success: false,
    error: {
      code: CommonErrorCodes.INTERNAL_ERROR,
      message: isProd ? 'An unexpected error occurred' : message,
      details: isProd
        ? undefined
        : {
            stack: error instanceof Error ? error.stack : undefined,
            raw: String(error),
          },
      requestId,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get appropriate error code based on HTTP status
 */
function getHttpErrorCode(status: number): string {
  const statusMap: Record<number, string> = {
    400: CommonErrorCodes.INVALID_REQUEST,
    401: CommonErrorCodes.UNAUTHORIZED,
    403: CommonErrorCodes.FORBIDDEN,
    404: CommonErrorCodes.NOT_FOUND,
    405: CommonErrorCodes.METHOD_NOT_ALLOWED,
    409: CommonErrorCodes.CONFLICT,
    413: CommonErrorCodes.PAYLOAD_TOO_LARGE,
    422: CommonErrorCodes.VALIDATION_ERROR,
    429: CommonErrorCodes.RATE_LIMITED,
    500: CommonErrorCodes.INTERNAL_ERROR,
    503: CommonErrorCodes.SERVICE_UNAVAILABLE,
    504: CommonErrorCodes.TIMEOUT_ERROR,
  };

  return statusMap[status] || CommonErrorCodes.INTERNAL_ERROR;
}

/**
 * Get generic error message for production
 */
function getGenericMessage(status: number): string {
  const messageMap: Record<number, string> = {
    400: 'Invalid request',
    401: 'Authentication required',
    403: 'Access denied',
    404: 'Resource not found',
    405: 'Method not allowed',
    409: 'Resource conflict',
    413: 'Request too large',
    422: 'Validation failed',
    429: 'Too many requests',
    500: 'Internal server error',
    503: 'Service temporarily unavailable',
    504: 'Request timeout',
  };

  return messageMap[status] || 'An error occurred';
}

/**
 * Create error handler middleware for a specific service
 */
export function createErrorHandler(service: string): ErrorRequestHandler {
  return (
    err: Error,
    req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    const extendedReq = req as ExtendedRequest;
    const requestId = extendedReq.requestId || crypto.randomUUID();

    // Determine status code
    let statusCode = 500;
    if (err instanceof RecoderError) {
      statusCode = err.statusCode;
    } else if ('statusCode' in err && typeof (err as any).statusCode === 'number') {
      statusCode = (err as any).statusCode;
    } else if ('status' in err && typeof (err as any).status === 'number') {
      statusCode = (err as any).status;
    }

    const logLevel = statusCode >= 500 ? 'error' : 'warn';

    // Log the error with service context
    console[logLevel](`Request error in ${service} service`, {
      operation: 'error-handler',
      error: err.message,
      statusCode,
      path: req.path,
      method: req.method,
      requestId,
      stack: err.stack,
      errorType: err.constructor.name,
      service,
    });

    // Create error response
    const errorResponse = createErrorResponse(err, requestId, service);

    // Return error response with appropriate status code
    res.status(statusCode).json(errorResponse);
  };
}

/**
 * Async error wrapper for route handlers
 * Catches async errors and passes them to the error handler
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Common error factory functions
 */
export const CommonErrors = {
  unauthorized: (message = 'Authentication required') =>
    new RecoderError(401, CommonErrorCodes.UNAUTHORIZED, message),

  forbidden: (message = 'Access denied') =>
    new RecoderError(403, CommonErrorCodes.FORBIDDEN, message),

  notFound: (resource = 'Resource') =>
    new RecoderError(404, CommonErrorCodes.NOT_FOUND, `${resource} not found`),

  conflict: (message = 'Resource conflict') =>
    new RecoderError(409, CommonErrorCodes.CONFLICT, message),

  validationError: (message = 'Validation failed', details?: unknown) =>
    new RecoderError(422, CommonErrorCodes.VALIDATION_ERROR, message, details),

  rateLimited: (message = 'Too many requests', retryAfter?: number) =>
    new RecoderError(429, CommonErrorCodes.RATE_LIMITED, message, { retryAfter }),

  payloadTooLarge: (message = 'Request payload too large', maxSize?: number) =>
    new RecoderError(413, CommonErrorCodes.PAYLOAD_TOO_LARGE, message, { maxSize }),

  internalError: (message = 'Internal server error', details?: unknown) =>
    new RecoderError(500, CommonErrorCodes.INTERNAL_ERROR, message, details),

  serviceUnavailable: (message = 'Service temporarily unavailable') =>
    new RecoderError(503, CommonErrorCodes.SERVICE_UNAVAILABLE, message),

  databaseError: (operation = 'Database operation failed') =>
    new RecoderError(500, CommonErrorCodes.DATABASE_ERROR, operation),

  externalServiceError: (service: string, message?: string) =>
    new RecoderError(
      500,
      CommonErrorCodes.EXTERNAL_SERVICE_ERROR,
      message || `External service error: ${service}`
    ),

  timeoutError: (operation = 'Operation timed out') =>
    new RecoderError(504, CommonErrorCodes.TIMEOUT_ERROR, operation),
};

/**
 * Not found handler for 404 errors
 */
export function notFoundHandler(req: Request, res: Response, _next: NextFunction): void {
  const extendedReq = req as ExtendedRequest;
  const requestId = extendedReq.requestId || crypto.randomUUID();

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: CommonErrorCodes.NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
      requestId,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(404).json(errorResponse);
}
