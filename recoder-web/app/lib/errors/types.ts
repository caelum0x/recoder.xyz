/**
 * Frontend Error Types
 * Production-ready error type definitions with comprehensive categorization
 */

/**
 * Error severity levels for UI display and logging prioritization
 */
export type ErrorSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Error categories for grouping and handling
 */
export type ErrorCategory =
  | 'network'
  | 'auth'
  | 'file'
  | 'container'
  | 'server'
  | 'validation'
  | 'timeout'
  | 'resource'
  | 'unknown';

/**
 * Extended error codes for frontend-specific scenarios
 */
export enum FrontendErrorCode {
  // UI errors
  RENDER_ERROR = 'RENDER_ERROR',
  HYDRATION_ERROR = 'HYDRATION_ERROR',
  CHUNK_LOAD_ERROR = 'CHUNK_LOAD_ERROR',
  STATE_ERROR = 'STATE_ERROR',

  // Storage errors
  LOCAL_STORAGE_FULL = 'LOCAL_STORAGE_FULL',
  LOCAL_STORAGE_UNAVAILABLE = 'LOCAL_STORAGE_UNAVAILABLE',
  INDEXED_DB_ERROR = 'INDEXED_DB_ERROR',

  // Offline errors
  OFFLINE_OPERATION_FAILED = 'OFFLINE_OPERATION_FAILED',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  SYNC_FAILED = 'SYNC_FAILED',

  // WebSocket errors
  WS_RECONNECT_FAILED = 'WS_RECONNECT_FAILED',
  WS_MESSAGE_ERROR = 'WS_MESSAGE_ERROR',

  // Editor errors
  EDITOR_CRASH = 'EDITOR_CRASH',
  SYNTAX_HIGHLIGHT_ERROR = 'SYNTAX_HIGHLIGHT_ERROR',
  LSP_CONNECTION_ERROR = 'LSP_CONNECTION_ERROR',

  // Build errors
  BUILD_FAILED = 'BUILD_FAILED',
  DEV_SERVER_ERROR = 'DEV_SERVER_ERROR',
  PREVIEW_LOAD_ERROR = 'PREVIEW_LOAD_ERROR',

  // File errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',
}

/**
 * Core AppError interface for frontend error handling
 */
export interface AppError {
  /** Unique error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** User-friendly message for display */
  userMessage?: string;
  /** Error severity level */
  severity: ErrorSeverity;
  /** Error category for grouping */
  category: ErrorCategory;
  /** Whether the error can be recovered from automatically */
  recoverable: boolean;
  /** Whether the operation can be retried */
  canRetry: boolean;
  /** Delay before retry in milliseconds */
  retryAfter?: number;
  /** Additional error details for debugging */
  details?: Record<string, unknown>;
  /** Error timestamp */
  timestamp: string;
  /** Original error that caused this error */
  cause?: Error;
  /** Request ID for server-side correlation */
  requestId?: string;
  /** Component or module where the error occurred */
  source?: string;
  /** Stack trace (development only) */
  stack?: string;
}

/**
 * Create an AppError from various sources
 */
export function createAppError(
  code: string,
  message: string,
  options?: Partial<Omit<AppError, 'code' | 'message' | 'timestamp'>>
): AppError {
  return {
    code,
    message,
    severity: options?.severity ?? 'error',
    category: options?.category ?? 'unknown',
    recoverable: options?.recoverable ?? false,
    canRetry: options?.canRetry ?? false,
    timestamp: new Date().toISOString(),
    ...options,
  };
}

/**
 * Type guard to check if an error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    'severity' in error &&
    'category' in error
  );
}

/**
 * Convert any error to an AppError
 */
export function toAppError(error: unknown, defaultCode: string = 'UNKNOWN_ERROR'): AppError {
  if (isAppError(error)) {
    return error;
  }

  if (error instanceof Error) {
    const { code, category, severity, canRetry } = detectErrorType(error);
    return createAppError(code || defaultCode, error.message, {
      category,
      severity,
      canRetry,
      cause: error,
      stack: error.stack,
    });
  }

  return createAppError(defaultCode, String(error), {
    category: 'unknown',
    severity: 'error',
  });
}

/**
 * Detect error type from error message/name
 */
function detectErrorType(error: Error): {
  code?: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  canRetry: boolean;
} {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return { code: 'NETWORK_ERROR', category: 'network', severity: 'error', canRetry: true };
  }

  // Timeout errors
  if (msg.includes('timeout') || name === 'aborterror') {
    return { code: 'TIMEOUT_ERROR', category: 'timeout', severity: 'warning', canRetry: true };
  }

  // Auth errors
  if (msg.includes('unauthorized') || msg.includes('401')) {
    return { code: 'AUTH_REQUIRED', category: 'auth', severity: 'warning', canRetry: false };
  }

  if (msg.includes('forbidden') || msg.includes('403')) {
    return { code: 'ACCESS_DENIED', category: 'auth', severity: 'error', canRetry: false };
  }

  // File errors
  if (msg.includes('file not found') || msg.includes('enoent')) {
    return { code: 'FILE_NOT_FOUND', category: 'file', severity: 'warning', canRetry: false };
  }

  // Chunk loading errors (common after deployments)
  if (msg.includes('chunk') || msg.includes('loading chunk') || msg.includes('dynamically imported')) {
    return { code: FrontendErrorCode.CHUNK_LOAD_ERROR, category: 'unknown', severity: 'warning', canRetry: true };
  }

  // WebSocket errors
  if (msg.includes('websocket') || msg.includes('ws://') || msg.includes('wss://')) {
    return { code: 'WS_CONNECTION_FAILED', category: 'network', severity: 'warning', canRetry: true };
  }

  // Rate limiting
  if (msg.includes('rate limit') || msg.includes('429')) {
    return { code: 'RATE_LIMITED', category: 'server', severity: 'warning', canRetry: true };
  }

  // Server errors
  if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('internal server')) {
    return { code: 'SERVER_ERROR', category: 'server', severity: 'error', canRetry: true };
  }

  return { category: 'unknown', severity: 'error', canRetry: false };
}

/**
 * Serializable error format for logging and reporting
 */
export interface SerializedError {
  code: string;
  message: string;
  userMessage?: string;
  severity: ErrorSeverity;
  category: ErrorCategory;
  timestamp: string;
  requestId?: string;
  source?: string;
  stack?: string;
  details?: Record<string, unknown>;
  context?: {
    url?: string;
    userAgent?: string;
    userId?: string;
    projectId?: string;
  };
}

/**
 * Serialize an AppError for logging/reporting
 */
export function serializeError(
  error: AppError,
  context?: SerializedError['context']
): SerializedError {
  return {
    code: error.code,
    message: error.message,
    userMessage: error.userMessage,
    severity: error.severity,
    category: error.category,
    timestamp: error.timestamp,
    requestId: error.requestId,
    source: error.source,
    stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    details: error.details,
    context,
  };
}

/**
 * Error metadata for analytics and monitoring
 */
export interface ErrorMetadata {
  /** Total occurrences of this error */
  count: number;
  /** First occurrence timestamp */
  firstSeen: string;
  /** Last occurrence timestamp */
  lastSeen: string;
  /** Whether this error has been reported */
  reported: boolean;
  /** Whether this error is currently muted */
  muted: boolean;
}

/**
 * Error with metadata for tracking
 */
export interface TrackedError extends AppError {
  id: string;
  metadata: ErrorMetadata;
}

/**
 * Generate a unique error ID for deduplication
 */
export function getErrorId(error: AppError): string {
  return `${error.code}:${error.message.substring(0, 100)}`;
}

/**
 * Error boundary fallback props
 */
export interface ErrorFallbackProps {
  error: AppError;
  resetError: () => void;
  reportError: () => void;
}

/**
 * Recovery action for error handling
 */
export interface ErrorRecoveryAction {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  action: () => void | Promise<void>;
  primary?: boolean;
  dangerous?: boolean;
}

/**
 * Get default recovery actions for an error
 */
export function getDefaultRecoveryActions(error: AppError): ErrorRecoveryAction[] {
  const actions: ErrorRecoveryAction[] = [];

  if (error.canRetry) {
    actions.push({
      id: 'retry',
      label: 'Try Again',
      icon: 'i-ph:arrow-clockwise',
      action: () => window.location.reload(),
      primary: true,
    });
  }

  if (error.category === 'network') {
    actions.push({
      id: 'refresh',
      label: 'Refresh Page',
      icon: 'i-ph:arrow-counter-clockwise',
      action: () => window.location.reload(),
    });
  }

  if (error.category === 'auth') {
    actions.push({
      id: 'login',
      label: 'Log In',
      icon: 'i-ph:sign-in',
      action: () => {
        const loginUrl = `${window.location.origin.replace('app.', '')}/auth/signin?redirect=${encodeURIComponent(window.location.href)}`;
        window.location.href = loginUrl;
      },
      primary: true,
    });
  }

  // Always allow copying error details
  actions.push({
    id: 'copy',
    label: 'Copy Error',
    icon: 'i-ph:copy',
    action: () => {
      navigator.clipboard.writeText(
        `Error: ${error.code}\nMessage: ${error.message}\nTimestamp: ${error.timestamp}`
      );
    },
  });

  return actions;
}
