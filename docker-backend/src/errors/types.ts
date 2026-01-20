/**
 * Centralized Error Types for Docker Backend
 * Provides structured error handling with codes, messages, and metadata
 */

// Error codes for standardized API responses
export enum ErrorCode {
  // Authentication errors (1xxx)
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_SERVICE_ERROR = 'AUTH_SERVICE_ERROR',

  // Authorization errors (2xxx)
  AUTHZ_PROJECT_ACCESS_DENIED = 'AUTHZ_PROJECT_ACCESS_DENIED',
  AUTHZ_OWNERSHIP_CHECK_FAILED = 'AUTHZ_OWNERSHIP_CHECK_FAILED',
  AUTHZ_SERVICE_ERROR = 'AUTHZ_SERVICE_ERROR',

  // Container errors (3xxx)
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  CONTAINER_NOT_RUNNING = 'CONTAINER_NOT_RUNNING',
  CONTAINER_CREATE_FAILED = 'CONTAINER_CREATE_FAILED',
  CONTAINER_START_FAILED = 'CONTAINER_START_FAILED',
  CONTAINER_STOP_FAILED = 'CONTAINER_STOP_FAILED',
  CONTAINER_LIMIT_REACHED = 'CONTAINER_LIMIT_REACHED',
  CONTAINER_EXEC_FAILED = 'CONTAINER_EXEC_FAILED',
  CONTAINER_UNHEALTHY = 'CONTAINER_UNHEALTHY',

  // File operation errors (4xxx)
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  FILE_DELETE_FAILED = 'FILE_DELETE_FAILED',
  FILE_PATH_INVALID = 'FILE_PATH_INVALID',
  FILE_PERMISSION_DENIED = 'FILE_PERMISSION_DENIED',

  // Port/Network errors (5xxx)
  PORT_ALLOCATION_FAILED = 'PORT_ALLOCATION_FAILED',
  PORT_IN_USE = 'PORT_IN_USE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',

  // WebSocket errors (6xxx)
  WS_CONNECTION_FAILED = 'WS_CONNECTION_FAILED',
  WS_MESSAGE_PARSE_ERROR = 'WS_MESSAGE_PARSE_ERROR',
  WS_TIMEOUT = 'WS_TIMEOUT',
  WS_CLOSED_ABNORMALLY = 'WS_CLOSED_ABNORMALLY',

  // Terminal/PTY errors (7xxx)
  TERMINAL_CREATE_FAILED = 'TERMINAL_CREATE_FAILED',
  TERMINAL_NOT_FOUND = 'TERMINAL_NOT_FOUND',
  TERMINAL_EXEC_FAILED = 'TERMINAL_EXEC_FAILED',

  // Dev server errors (8xxx)
  DEV_SERVER_START_FAILED = 'DEV_SERVER_START_FAILED',
  DEV_SERVER_NOT_RUNNING = 'DEV_SERVER_NOT_RUNNING',
  DEV_SERVER_TIMEOUT = 'DEV_SERVER_TIMEOUT',

  // Resource errors (9xxx)
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // LSP errors (10xxx)
  LSP_NOT_AVAILABLE = 'LSP_NOT_AVAILABLE',
  LSP_SERVER_ERROR = 'LSP_SERVER_ERROR',
  LSP_TIMEOUT = 'LSP_TIMEOUT',

  // Debug Adapter Protocol (DAP) errors (13xxx)
  DAP_ERROR = 'DAP_ERROR',
  DAP_TIMEOUT = 'DAP_TIMEOUT',
  DAP_NOT_AVAILABLE = 'DAP_NOT_AVAILABLE',
  DAP_SESSION_NOT_FOUND = 'DAP_SESSION_NOT_FOUND',

  // General errors
  NOT_FOUND = 'NOT_FOUND',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  SPAWN_ERROR = 'SPAWN_ERROR',

  // Git errors (11xxx)
  GIT_OPERATION_FAILED = 'GIT_OPERATION_FAILED',
  GIT_CLONE_FAILED = 'GIT_CLONE_FAILED',
  GIT_AUTH_FAILED = 'GIT_AUTH_FAILED',

  // Validation errors (12xxx)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

// HTTP status codes mapping for error codes
export const ErrorStatusMap: Record<ErrorCode, number> = {
  // Auth errors -> 401
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_INVALID_TOKEN]: 401,
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
  [ErrorCode.AUTH_SERVICE_ERROR]: 500,

  // Authz errors -> 403
  [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 403,
  [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 403,
  [ErrorCode.AUTHZ_SERVICE_ERROR]: 500,

  // Container errors -> mostly 404/500/503
  [ErrorCode.CONTAINER_NOT_FOUND]: 404,
  [ErrorCode.CONTAINER_NOT_RUNNING]: 503,
  [ErrorCode.CONTAINER_CREATE_FAILED]: 500,
  [ErrorCode.CONTAINER_START_FAILED]: 500,
  [ErrorCode.CONTAINER_STOP_FAILED]: 500,
  [ErrorCode.CONTAINER_LIMIT_REACHED]: 429,
  [ErrorCode.CONTAINER_EXEC_FAILED]: 500,
  [ErrorCode.CONTAINER_UNHEALTHY]: 503,

  // File errors -> mostly 404/400/500
  [ErrorCode.FILE_NOT_FOUND]: 404,
  [ErrorCode.FILE_READ_FAILED]: 500,
  [ErrorCode.FILE_WRITE_FAILED]: 500,
  [ErrorCode.FILE_DELETE_FAILED]: 500,
  [ErrorCode.FILE_PATH_INVALID]: 400,
  [ErrorCode.FILE_PERMISSION_DENIED]: 403,

  // Port/Network errors -> 500/503
  [ErrorCode.PORT_ALLOCATION_FAILED]: 500,
  [ErrorCode.PORT_IN_USE]: 503,
  [ErrorCode.NETWORK_ERROR]: 503,
  [ErrorCode.CONNECTION_REFUSED]: 503,

  // WebSocket errors -> 500
  [ErrorCode.WS_CONNECTION_FAILED]: 500,
  [ErrorCode.WS_MESSAGE_PARSE_ERROR]: 400,
  [ErrorCode.WS_TIMEOUT]: 504,
  [ErrorCode.WS_CLOSED_ABNORMALLY]: 500,

  // Terminal errors -> 500
  [ErrorCode.TERMINAL_CREATE_FAILED]: 500,
  [ErrorCode.TERMINAL_NOT_FOUND]: 404,
  [ErrorCode.TERMINAL_EXEC_FAILED]: 500,

  // Dev server errors -> 503
  [ErrorCode.DEV_SERVER_START_FAILED]: 500,
  [ErrorCode.DEV_SERVER_NOT_RUNNING]: 503,
  [ErrorCode.DEV_SERVER_TIMEOUT]: 504,

  // Resource errors -> 429/503
  [ErrorCode.RESOURCE_EXHAUSTED]: 503,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,

  // LSP errors -> 503
  [ErrorCode.LSP_NOT_AVAILABLE]: 503,
  [ErrorCode.LSP_SERVER_ERROR]: 500,
  [ErrorCode.LSP_TIMEOUT]: 504,

  // DAP errors -> 500/503/504
  [ErrorCode.DAP_ERROR]: 500,
  [ErrorCode.DAP_TIMEOUT]: 504,
  [ErrorCode.DAP_NOT_AVAILABLE]: 503,
  [ErrorCode.DAP_SESSION_NOT_FOUND]: 404,

  // General errors
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.CONNECTION_ERROR]: 503,
  [ErrorCode.SPAWN_ERROR]: 500,

  // Git errors -> 500
  [ErrorCode.GIT_OPERATION_FAILED]: 500,
  [ErrorCode.GIT_CLONE_FAILED]: 500,
  [ErrorCode.GIT_AUTH_FAILED]: 401,

  // Validation errors -> 400
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,

  // Generic errors
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.UNKNOWN_ERROR]: 500,
};

// User-friendly error messages
export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.AUTH_REQUIRED]: 'Authentication required. Please log in.',
  [ErrorCode.AUTH_INVALID_TOKEN]: 'Invalid or expired authentication token.',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCode.AUTH_SERVICE_ERROR]: 'Authentication service is temporarily unavailable.',

  [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 'You do not have access to this project.',
  [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 'Unable to verify project ownership.',
  [ErrorCode.AUTHZ_SERVICE_ERROR]: 'Authorization service is temporarily unavailable.',

  [ErrorCode.CONTAINER_NOT_FOUND]: 'Container not found. It may have been stopped.',
  [ErrorCode.CONTAINER_NOT_RUNNING]: 'Container is not running. Starting it now...',
  [ErrorCode.CONTAINER_CREATE_FAILED]: 'Failed to create container. Please try again.',
  [ErrorCode.CONTAINER_START_FAILED]: 'Failed to start container.',
  [ErrorCode.CONTAINER_STOP_FAILED]: 'Failed to stop container.',
  [ErrorCode.CONTAINER_LIMIT_REACHED]: 'Container limit reached. Please close unused projects.',
  [ErrorCode.CONTAINER_EXEC_FAILED]: 'Failed to execute command in container.',
  [ErrorCode.CONTAINER_UNHEALTHY]: 'Container is unhealthy and will be restarted.',

  [ErrorCode.FILE_NOT_FOUND]: 'File not found.',
  [ErrorCode.FILE_READ_FAILED]: 'Failed to read file.',
  [ErrorCode.FILE_WRITE_FAILED]: 'Failed to write file.',
  [ErrorCode.FILE_DELETE_FAILED]: 'Failed to delete file.',
  [ErrorCode.FILE_PATH_INVALID]: 'Invalid file path.',
  [ErrorCode.FILE_PERMISSION_DENIED]: 'Permission denied for file operation.',

  [ErrorCode.PORT_ALLOCATION_FAILED]: 'No available ports. Please try again.',
  [ErrorCode.PORT_IN_USE]: 'Port is already in use.',
  [ErrorCode.NETWORK_ERROR]: 'Network error occurred.',
  [ErrorCode.CONNECTION_REFUSED]: 'Connection refused. Service may be down.',

  [ErrorCode.WS_CONNECTION_FAILED]: 'WebSocket connection failed.',
  [ErrorCode.WS_MESSAGE_PARSE_ERROR]: 'Invalid message format.',
  [ErrorCode.WS_TIMEOUT]: 'Connection timed out.',
  [ErrorCode.WS_CLOSED_ABNORMALLY]: 'Connection closed unexpectedly.',

  [ErrorCode.TERMINAL_CREATE_FAILED]: 'Failed to create terminal.',
  [ErrorCode.TERMINAL_NOT_FOUND]: 'Terminal session not found.',
  [ErrorCode.TERMINAL_EXEC_FAILED]: 'Failed to execute terminal command.',

  [ErrorCode.DEV_SERVER_START_FAILED]: 'Failed to start development server.',
  [ErrorCode.DEV_SERVER_NOT_RUNNING]: 'Development server is not running.',
  [ErrorCode.DEV_SERVER_TIMEOUT]: 'Development server startup timed out.',

  [ErrorCode.RESOURCE_EXHAUSTED]: 'System resources exhausted. Please try again later.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please slow down.',
  [ErrorCode.QUOTA_EXCEEDED]: 'Quota exceeded. Please upgrade or wait.',

  [ErrorCode.LSP_NOT_AVAILABLE]: 'Language server not available.',
  [ErrorCode.LSP_SERVER_ERROR]: 'Language server error.',
  [ErrorCode.LSP_TIMEOUT]: 'Language server timed out.',

  [ErrorCode.DAP_ERROR]: 'Debug adapter error.',
  [ErrorCode.DAP_TIMEOUT]: 'Debug adapter timed out.',
  [ErrorCode.DAP_NOT_AVAILABLE]: 'Debug adapter not available.',
  [ErrorCode.DAP_SESSION_NOT_FOUND]: 'Debug session not found.',

  [ErrorCode.NOT_FOUND]: 'Resource not found.',
  [ErrorCode.TIMEOUT]: 'Operation timed out.',
  [ErrorCode.CONNECTION_ERROR]: 'Connection error.',
  [ErrorCode.SPAWN_ERROR]: 'Failed to spawn process.',

  [ErrorCode.GIT_OPERATION_FAILED]: 'Git operation failed.',
  [ErrorCode.GIT_CLONE_FAILED]: 'Failed to clone repository.',
  [ErrorCode.GIT_AUTH_FAILED]: 'Git authentication failed.',

  [ErrorCode.VALIDATION_ERROR]: 'Validation error.',
  [ErrorCode.INVALID_INPUT]: 'Invalid input provided.',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'Required field is missing.',

  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred.',
  [ErrorCode.NOT_IMPLEMENTED]: 'Feature not implemented.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable.',
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred.',
};

/**
 * Structured error details for API responses
 */
export interface ErrorDetails {
  projectId?: string;
  containerId?: string;
  path?: string;
  port?: number;
  userId?: string;
  terminalId?: string;
  command?: string;
  [key: string]: unknown;
}

/**
 * Standardized API error response format
 */
export interface ApiErrorResponse {
  success: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetails;
    timestamp: string;
    requestId?: string;
  };
  // Retry hints for clients
  canRetry?: boolean;
  retryAfter?: number; // seconds
}

/**
 * Custom error class for application errors
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetails;
  public readonly canRetry: boolean;
  public readonly retryAfter?: number;
  public readonly timestamp: string;

  constructor(
    code: ErrorCode,
    message?: string,
    options?: {
      details?: ErrorDetails;
      canRetry?: boolean;
      retryAfter?: number;
      cause?: Error;
    }
  ) {
    const finalMessage = message || ErrorMessages[code] || 'An error occurred';
    super(finalMessage);

    this.name = 'AppError';
    this.code = code;
    this.statusCode = ErrorStatusMap[code] || 500;
    this.details = options?.details;
    this.canRetry = options?.canRetry ?? this.isRetryable(code);
    this.retryAfter = options?.retryAfter;
    this.timestamp = new Date().toISOString();

    if (options?.cause) {
      this.cause = options.cause;
    }

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Determine if error is retryable by default
   */
  private isRetryable(code: ErrorCode): boolean {
    const retryableCodes = [
      ErrorCode.CONTAINER_NOT_RUNNING,
      ErrorCode.CONTAINER_UNHEALTHY,
      ErrorCode.NETWORK_ERROR,
      ErrorCode.CONNECTION_REFUSED,
      ErrorCode.WS_CONNECTION_FAILED,
      ErrorCode.WS_TIMEOUT,
      ErrorCode.DEV_SERVER_NOT_RUNNING,
      ErrorCode.DEV_SERVER_TIMEOUT,
      ErrorCode.LSP_NOT_AVAILABLE,
      ErrorCode.LSP_TIMEOUT,
      ErrorCode.SERVICE_UNAVAILABLE,
      ErrorCode.RESOURCE_EXHAUSTED,
    ];
    return retryableCodes.includes(code);
  }

  /**
   * Convert to API response format
   */
  toResponse(requestId?: string): ApiErrorResponse {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
        requestId,
      },
      canRetry: this.canRetry,
      retryAfter: this.retryAfter,
    };
  }

  /**
   * Create from unknown error
   */
  static fromError(error: unknown, defaultCode: ErrorCode = ErrorCode.INTERNAL_ERROR): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      // Try to detect error type from message
      const code = AppError.detectErrorCode(error.message) || defaultCode;
      return new AppError(code, error.message, { cause: error });
    }

    return new AppError(defaultCode, String(error));
  }

  /**
   * Detect error code from error message
   */
  static detectErrorCode(message: string): ErrorCode | null {
    const lowercaseMsg = message.toLowerCase();

    if (lowercaseMsg.includes('container not found') || lowercaseMsg.includes('no such container')) {
      return ErrorCode.CONTAINER_NOT_FOUND;
    }
    if (lowercaseMsg.includes('not running')) {
      return ErrorCode.CONTAINER_NOT_RUNNING;
    }
    if (lowercaseMsg.includes('eaddrinuse') || lowercaseMsg.includes('port') && lowercaseMsg.includes('in use')) {
      return ErrorCode.PORT_IN_USE;
    }
    if (lowercaseMsg.includes('econnrefused')) {
      return ErrorCode.CONNECTION_REFUSED;
    }
    if (lowercaseMsg.includes('etimedout') || lowercaseMsg.includes('timeout')) {
      return ErrorCode.WS_TIMEOUT;
    }
    if (lowercaseMsg.includes('permission denied')) {
      return ErrorCode.FILE_PERMISSION_DENIED;
    }
    if (lowercaseMsg.includes('no such file') || lowercaseMsg.includes('enoent')) {
      return ErrorCode.FILE_NOT_FOUND;
    }
    if (lowercaseMsg.includes('rate limit')) {
      return ErrorCode.RATE_LIMITED;
    }

    return null;
  }
}

/**
 * Simple function to create an AppError with a code and message
 * Usage: createError(ErrorCode.DAP_ERROR, 'Debug adapter failed')
 */
export function createError(
  code: ErrorCode,
  message?: string,
  options?: {
    details?: ErrorDetails;
    canRetry?: boolean;
    retryAfter?: number;
    cause?: Error;
  }
): AppError {
  return new AppError(code, message, options);
}

/**
 * Helper functions to create specific errors (typed shortcuts)
 */
export const createTypedError = {
  auth: {
    required: () => new AppError(ErrorCode.AUTH_REQUIRED),
    invalidToken: () => new AppError(ErrorCode.AUTH_INVALID_TOKEN),
    expired: () => new AppError(ErrorCode.AUTH_TOKEN_EXPIRED),
    serviceError: (cause?: Error) => new AppError(ErrorCode.AUTH_SERVICE_ERROR, undefined, { cause }),
  },
  container: {
    notFound: (projectId: string) =>
      new AppError(ErrorCode.CONTAINER_NOT_FOUND, `Container for project ${projectId} not found`, {
        details: { projectId },
        canRetry: false,
      }),
    notRunning: (projectId: string) =>
      new AppError(ErrorCode.CONTAINER_NOT_RUNNING, undefined, {
        details: { projectId },
        canRetry: true,
      }),
    createFailed: (projectId: string, cause?: Error) =>
      new AppError(ErrorCode.CONTAINER_CREATE_FAILED, undefined, {
        details: { projectId },
        cause,
      }),
    limitReached: (current: number, max: number) =>
      new AppError(
        ErrorCode.CONTAINER_LIMIT_REACHED,
        `Container limit reached (${current}/${max}). Please close unused projects.`,
        { details: { current, max }, canRetry: false }
      ),
  },
  file: {
    notFound: (path: string) =>
      new AppError(ErrorCode.FILE_NOT_FOUND, `File not found: ${path}`, {
        details: { path },
      }),
    invalidPath: (path: string) =>
      new AppError(ErrorCode.FILE_PATH_INVALID, `Invalid file path: ${path}`, {
        details: { path },
      }),
    writeFailed: (path: string, cause?: Error) =>
      new AppError(ErrorCode.FILE_WRITE_FAILED, `Failed to write file: ${path}`, {
        details: { path },
        cause,
      }),
  },
  validation: {
    required: (field: string) =>
      new AppError(ErrorCode.MISSING_REQUIRED_FIELD, `${field} is required`, {
        details: { field },
      }),
    invalid: (field: string, reason?: string) =>
      new AppError(ErrorCode.INVALID_INPUT, `Invalid ${field}${reason ? `: ${reason}` : ''}`, {
        details: { field, reason },
      }),
  },
  websocket: {
    connectionFailed: (reason?: string) =>
      new AppError(ErrorCode.WS_CONNECTION_FAILED, reason || 'WebSocket connection failed', {
        canRetry: true,
      }),
    timeout: () => new AppError(ErrorCode.WS_TIMEOUT, undefined, { canRetry: true }),
    parseError: (message?: string) =>
      new AppError(ErrorCode.WS_MESSAGE_PARSE_ERROR, message || 'Failed to parse WebSocket message'),
  },
};

export default AppError;
