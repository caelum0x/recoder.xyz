/**
 * Error handling for Dispatcher service
 * Custom error types and error response utilities
 */

/**
 * Error codes for dispatcher operations
 */
export const ErrorCodes = {
  // Client errors (4xx)
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_WORKER_NAME: 'INVALID_WORKER_NAME',
  MISSING_WORKER_NAME: 'MISSING_WORKER_NAME',
  RESERVED_SUBDOMAIN: 'RESERVED_SUBDOMAIN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  WORKER_NOT_FOUND: 'WORKER_NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
  CONTENT_TYPE_REQUIRED: 'CONTENT_TYPE_REQUIRED',
  REQUEST_TOO_LARGE: 'REQUEST_TOO_LARGE',

  // Server errors (5xx)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DISPATCH_FAILED: 'DISPATCH_FAILED',
  WORKER_FETCH_FAILED: 'WORKER_FETCH_FAILED',
  CUSTOM_DOMAIN_ERROR: 'CUSTOM_DOMAIN_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NAMESPACE_ERROR: 'NAMESPACE_ERROR',
  NAMESPACE_NOT_CONFIGURED: 'NAMESPACE_NOT_CONFIGURED',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

/**
 * Custom error class for Dispatcher operations
 */
export class DispatcherError extends Error {
  /**
   * @param statusCode - HTTP status code
   * @param code - Error code constant
   * @param message - Human-readable error message
   * @param details - Additional error details (hidden in production)
   */
  constructor(
    public statusCode: number,
    public code: ErrorCode,
    message: string,
    public details?: unknown
  ) {
    super(message)
    this.name = 'DispatcherError'
  }

  /**
   * Convert error to JSON response format
   */
  toJSON(requestId?: string, includeDetails: boolean = false) {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: includeDetails ? this.details : undefined,
        requestId,
      },
      timestamp: new Date().toISOString(),
    }
  }
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
    requestId?: string
  }
  timestamp: string
}

/**
 * Check if running in production environment
 */
function isProduction(): boolean {
  return (
    typeof process !== 'undefined' &&
    (process.env.NODE_ENV === 'production' || process.env.ENVIRONMENT === 'production')
  )
}

/**
 * Create a sanitized error response based on environment
 * @param error The error to convert
 * @param requestId Optional request ID for tracing
 * @returns Formatted error response
 */
export function createErrorResponse(error: unknown, requestId?: string): ErrorResponse {
  const isProd = isProduction()

  // Handle DispatcherError
  if (error instanceof DispatcherError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: isProd ? undefined : error.details,
        requestId,
      },
      timestamp: new Date().toISOString(),
    }
  }

  // Handle standard Error
  if (error instanceof Error) {
    return {
      success: false,
      error: {
        code: ErrorCodes.INTERNAL_ERROR,
        message: isProd ? 'An unexpected error occurred' : error.message,
        details: isProd
          ? undefined
          : {
              stack: error.stack,
              name: error.name,
            },
        requestId,
      },
      timestamp: new Date().toISOString(),
    }
  }

  // Handle unknown error types
  return {
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      details: isProd ? undefined : { raw: String(error) },
      requestId,
    },
    timestamp: new Date().toISOString(),
  }
}

/**
 * Get appropriate error code based on HTTP status
 */
export function getHttpErrorCode(status: number): ErrorCode {
  const statusMap: Record<number, ErrorCode> = {
    400: ErrorCodes.INVALID_REQUEST,
    401: ErrorCodes.UNAUTHORIZED,
    403: ErrorCodes.FORBIDDEN,
    404: ErrorCodes.WORKER_NOT_FOUND,
    405: ErrorCodes.METHOD_NOT_ALLOWED,
    413: ErrorCodes.REQUEST_TOO_LARGE,
    429: ErrorCodes.RATE_LIMITED,
  }

  return statusMap[status] || ErrorCodes.INTERNAL_ERROR
}

/**
 * Get generic error message for production
 */
export function getGenericMessage(status: number): string {
  const messageMap: Record<number, string> = {
    400: 'Invalid request',
    401: 'Authentication required',
    403: 'Access denied',
    404: 'Worker not found',
    405: 'Method not allowed',
    413: 'Request too large',
    429: 'Too many requests',
    500: 'Internal server error',
    502: 'Worker fetch failed',
    503: 'Service temporarily unavailable',
  }

  return messageMap[status] || 'An error occurred'
}

/**
 * Get status code from error
 */
export function getStatusCode(error: unknown): number {
  if (error instanceof DispatcherError) {
    return error.statusCode
  }
  return 500
}

/**
 * Common error factory functions for Dispatcher service
 */
export const CommonErrors = {
  unauthorized: () => new DispatcherError(401, ErrorCodes.UNAUTHORIZED, 'Authentication required'),

  forbidden: (reason?: string) =>
    new DispatcherError(403, ErrorCodes.FORBIDDEN, reason || 'Access denied'),

  workerNotFound: (workerName: string, namespace?: string) =>
    new DispatcherError(
      404,
      ErrorCodes.WORKER_NOT_FOUND,
      `Worker '${workerName}' not found${namespace ? ` in namespace '${namespace}'` : ''}`
    ),

  invalidWorkerName: (workerName: string, reason?: string) =>
    new DispatcherError(
      400,
      ErrorCodes.INVALID_WORKER_NAME,
      `Invalid worker name '${workerName}'${reason ? `: ${reason}` : ''}`
    ),

  missingWorkerName: () =>
    new DispatcherError(400, ErrorCodes.MISSING_WORKER_NAME, 'Worker name is required'),

  reservedSubdomain: (subdomain: string) =>
    new DispatcherError(
      400,
      ErrorCodes.RESERVED_SUBDOMAIN,
      `Subdomain '${subdomain}' is reserved and cannot be used`
    ),

  dispatchFailed: (workerName: string, details?: unknown) =>
    new DispatcherError(
      500,
      ErrorCodes.DISPATCH_FAILED,
      `Failed to dispatch request to worker '${workerName}'`,
      details
    ),

  workerFetchFailed: (workerName: string, details?: unknown) =>
    new DispatcherError(
      502,
      ErrorCodes.WORKER_FETCH_FAILED,
      `Worker '${workerName}' exists but failed to respond`,
      details
    ),

  customDomainError: (domain: string, message: string, details?: unknown) =>
    new DispatcherError(
      500,
      ErrorCodes.CUSTOM_DOMAIN_ERROR,
      `Custom domain error for '${domain}': ${message}`,
      details
    ),

  databaseError: (operation: string) =>
    new DispatcherError(500, ErrorCodes.DATABASE_ERROR, 'Database operation failed', { operation }),

  namespaceError: (namespace: string, operation: string) =>
    new DispatcherError(
      500,
      ErrorCodes.NAMESPACE_ERROR,
      `Namespace operation failed for '${namespace}'`,
      { operation }
    ),

  namespaceNotConfigured: () =>
    new DispatcherError(
      500,
      ErrorCodes.NAMESPACE_NOT_CONFIGURED,
      'Dispatch namespace is not configured'
    ),

  rateLimited: (retryAfter?: number) =>
    new DispatcherError(
      429,
      ErrorCodes.RATE_LIMITED,
      'Too many dispatch requests. Please try again later.',
      { retryAfter }
    ),

  invalidRequest: (message: string, details?: unknown) =>
    new DispatcherError(400, ErrorCodes.INVALID_REQUEST, message, details),

  methodNotAllowed: (method: string, allowedMethods: string[]) =>
    new DispatcherError(
      405,
      ErrorCodes.METHOD_NOT_ALLOWED,
      `HTTP method '${method}' not allowed. Allowed methods: ${allowedMethods.join(', ')}`
    ),

  contentTypeRequired: () =>
    new DispatcherError(
      400,
      ErrorCodes.CONTENT_TYPE_REQUIRED,
      'Content-Type header is required for POST/PUT/PATCH requests'
    ),

  requestTooLarge: (size: number, maxSize: number) =>
    new DispatcherError(
      413,
      ErrorCodes.REQUEST_TOO_LARGE,
      `Request size (${size} bytes) exceeds maximum allowed size (${maxSize} bytes)`
    ),

  internalError: (message: string = 'Internal server error', details?: unknown) =>
    new DispatcherError(500, ErrorCodes.INTERNAL_ERROR, message, details),
}
