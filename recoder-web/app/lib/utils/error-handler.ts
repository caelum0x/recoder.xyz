/**
 * Frontend Error Handler Utilities
 * Provides structured error handling, retry mechanisms, and WebSocket error handling
 *
 * Production-grade error handling for recoder.xyz
 * - Unified error types with categorization
 * - User-friendly messages with recovery actions
 * - Smart retry with exponential backoff
 * - WebSocket connection management
 * - Error reporting and logging
 */

// Error codes matching the backend
export enum ErrorCode {
  // Authentication errors
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN = 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_SERVICE_ERROR = 'AUTH_SERVICE_ERROR',

  // Authorization errors
  AUTHZ_PROJECT_ACCESS_DENIED = 'AUTHZ_PROJECT_ACCESS_DENIED',
  AUTHZ_OWNERSHIP_CHECK_FAILED = 'AUTHZ_OWNERSHIP_CHECK_FAILED',

  // Container errors
  CONTAINER_NOT_FOUND = 'CONTAINER_NOT_FOUND',
  CONTAINER_NOT_RUNNING = 'CONTAINER_NOT_RUNNING',
  CONTAINER_CREATE_FAILED = 'CONTAINER_CREATE_FAILED',
  CONTAINER_LIMIT_REACHED = 'CONTAINER_LIMIT_REACHED',

  // File errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_DELETE_FAILED = 'FILE_DELETE_FAILED',
  FILE_PERMISSION_DENIED = 'FILE_PERMISSION_DENIED',
  FILE_DISK_FULL = 'FILE_DISK_FULL',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  WS_CONNECTION_FAILED = 'WS_CONNECTION_FAILED',
  WS_TIMEOUT = 'WS_TIMEOUT',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  DNS_ERROR = 'DNS_ERROR',
  SSL_ERROR = 'SSL_ERROR',

  // Resource errors
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

/**
 * Structured API error from backend
 */
export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
  timestamp?: string;
  requestId?: string;
}

/**
 * API response format
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  canRetry?: boolean;
  retryAfter?: number;
}

/**
 * Custom error class for API errors
 */
export class ApiErrorException extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly canRetry: boolean;
  public readonly retryAfter?: number;
  public readonly requestId?: string;

  constructor(
    error: ApiError | string,
    options?: {
      canRetry?: boolean;
      retryAfter?: number;
    }
  ) {
    if (typeof error === 'string') {
      super(error);
      this.code = ErrorCode.UNKNOWN_ERROR;
      this.canRetry = options?.canRetry ?? false;
      this.retryAfter = options?.retryAfter;
    } else {
      super(error.message);
      this.code = error.code;
      this.details = error.details;
      this.requestId = error.requestId;
      this.canRetry = options?.canRetry ?? isRetryableError(error.code);
      this.retryAfter = options?.retryAfter;
    }
    this.name = 'ApiErrorException';
  }
}

/**
 * Check if an error code is retryable
 */
export function isRetryableError(code: ErrorCode): boolean {
  const retryableCodes: ErrorCode[] = [
    ErrorCode.CONTAINER_NOT_RUNNING,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.CONNECTION_REFUSED,
    ErrorCode.WS_CONNECTION_FAILED,
    ErrorCode.WS_TIMEOUT,
    ErrorCode.SERVICE_UNAVAILABLE,
  ];
  return retryableCodes.includes(code);
}

/**
 * Get user-friendly error message
 */
export function getUserFriendlyMessage(error: ApiError | ApiErrorException | Error): string {
  if (error instanceof ApiErrorException) {
    return getMessageForCode(error.code, error.message);
  }

  if ('code' in error && error.code) {
    return getMessageForCode(error.code as ErrorCode, error.message);
  }

  return error.message || 'An unexpected error occurred';
}

function getMessageForCode(code: ErrorCode, fallback?: string): string {
  const messages: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.AUTH_REQUIRED]: 'Please log in to continue.',
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
    [ErrorCode.AUTH_INVALID_TOKEN]: 'Your session is invalid. Please log in again.',
    [ErrorCode.AUTH_SERVICE_ERROR]: 'Authentication service error. Please try again.',
    [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 'You do not have access to this project.',
    [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 'Unable to verify project ownership.',
    [ErrorCode.CONTAINER_NOT_FOUND]: 'Workspace not found. It may have been stopped.',
    [ErrorCode.CONTAINER_NOT_RUNNING]: 'Starting your workspace...',
    [ErrorCode.CONTAINER_CREATE_FAILED]: 'Failed to create workspace. Please try again.',
    [ErrorCode.CONTAINER_LIMIT_REACHED]: 'You have reached the maximum number of active projects. Please close some projects and try again.',
    [ErrorCode.FILE_NOT_FOUND]: 'File not found.',
    [ErrorCode.FILE_WRITE_FAILED]: 'Failed to save file. Please try again.',
    [ErrorCode.FILE_READ_FAILED]: 'Failed to read file. Please try again.',
    [ErrorCode.FILE_DELETE_FAILED]: 'Failed to delete file.',
    [ErrorCode.FILE_PERMISSION_DENIED]: 'Permission denied. Cannot access this file.',
    [ErrorCode.FILE_DISK_FULL]: 'Disk space is full. Please delete some files.',
    [ErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ErrorCode.CONNECTION_REFUSED]: 'Unable to connect to server.',
    [ErrorCode.WS_CONNECTION_FAILED]: 'Connection lost. Attempting to reconnect...',
    [ErrorCode.WS_TIMEOUT]: 'Connection timed out.',
    [ErrorCode.TIMEOUT_ERROR]: 'Request timed out. Please try again.',
    [ErrorCode.DNS_ERROR]: 'Unable to resolve server address.',
    [ErrorCode.SSL_ERROR]: 'Secure connection failed.',
    [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again.',
    [ErrorCode.QUOTA_EXCEEDED]: 'Usage limit exceeded.',
    [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred. Please try again.',
    [ErrorCode.VALIDATION_ERROR]: 'Invalid input. Please check your data.',
  };

  return messages[code] || fallback || 'An error occurred';
}

/**
 * Get recovery suggestions for an error code
 * Returns user-friendly suggestions to help users recover from errors
 */
export function getRecoverySuggestions(code: ErrorCode): string[] {
  const suggestions: Partial<Record<ErrorCode, string[]>> = {
    // Authentication
    [ErrorCode.AUTH_REQUIRED]: [
      'Click the login button to sign in',
      'Your work will be saved after you log in',
    ],
    [ErrorCode.AUTH_TOKEN_EXPIRED]: [
      'Refresh the page to log in again',
      'Your recent changes have been auto-saved',
    ],
    [ErrorCode.AUTH_INVALID_TOKEN]: [
      'Clear your browser cookies and log in again',
      'If the issue persists, try a different browser',
    ],
    [ErrorCode.AUTH_SERVICE_ERROR]: [
      'Wait a few seconds and try again',
      'Our authentication service may be experiencing issues',
    ],

    // Authorization
    [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: [
      'Make sure you are logged in with the correct account',
      'Contact the project owner to request access',
    ],
    [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: [
      'Try refreshing the page',
      'If you should have access, contact support',
    ],

    // Container/Workspace
    [ErrorCode.CONTAINER_NOT_FOUND]: [
      'Reload the page to create a new workspace',
      'Your code is saved and will be restored',
    ],
    [ErrorCode.CONTAINER_NOT_RUNNING]: [
      'Wait a moment - the workspace is starting',
      'If it takes too long, try refreshing the page',
    ],
    [ErrorCode.CONTAINER_CREATE_FAILED]: [
      'Try refreshing the page',
      'If the issue persists, try again in a few minutes',
    ],
    [ErrorCode.CONTAINER_LIMIT_REACHED]: [
      'Close some of your other projects to free up resources',
      'Upgrade your plan for more concurrent projects',
    ],

    // File operations
    [ErrorCode.FILE_NOT_FOUND]: [
      'The file may have been moved or deleted',
      'Check the file tree to locate the file',
    ],
    [ErrorCode.FILE_WRITE_FAILED]: [
      'Try saving again',
      'Check if you have write permissions',
      'The workspace may need to restart',
    ],
    [ErrorCode.FILE_READ_FAILED]: [
      'Try refreshing the file',
      'The file might be temporarily unavailable',
    ],
    [ErrorCode.FILE_DELETE_FAILED]: [
      'Check if the file is currently open',
      'Try closing any editors using this file first',
    ],
    [ErrorCode.FILE_PERMISSION_DENIED]: [
      'You may not have permission to modify this file',
      'Check if the file is read-only',
    ],
    [ErrorCode.FILE_DISK_FULL]: [
      'Delete some unused files to free up space',
      'Remove large files or dependencies you no longer need',
    ],

    // Network
    [ErrorCode.NETWORK_ERROR]: [
      'Check your internet connection',
      'Try refreshing the page',
      'Disable any VPN or proxy that might interfere',
    ],
    [ErrorCode.CONNECTION_REFUSED]: [
      'The server may be temporarily unavailable',
      'Check if you are behind a firewall blocking the connection',
    ],
    [ErrorCode.WS_CONNECTION_FAILED]: [
      'The live connection was interrupted',
      'The app will automatically try to reconnect',
      'If reconnection fails, refresh the page',
    ],
    [ErrorCode.WS_TIMEOUT]: [
      'The connection timed out due to inactivity',
      'Check your internet speed',
      'Try moving closer to your router',
    ],
    [ErrorCode.TIMEOUT_ERROR]: [
      'The operation took too long',
      'Try again - the server may have been busy',
      'Consider breaking large operations into smaller parts',
    ],
    [ErrorCode.DNS_ERROR]: [
      'Check your internet connection',
      'Try using a different DNS server (like 8.8.8.8)',
      'Clear your browser DNS cache',
    ],
    [ErrorCode.SSL_ERROR]: [
      'Check your system date and time settings',
      'Try using a different browser',
      'Make sure your network is not intercepting HTTPS',
    ],

    // Server/Rate limiting
    [ErrorCode.RATE_LIMITED]: [
      'Wait a minute before trying again',
      'Avoid making too many rapid requests',
    ],
    [ErrorCode.SERVICE_UNAVAILABLE]: [
      'Our servers are experiencing high load',
      'Try again in a few minutes',
      'Check our status page for updates',
    ],
    [ErrorCode.QUOTA_EXCEEDED]: [
      'You have reached your usage limit',
      'Upgrade your plan for higher limits',
      'Wait until your quota resets',
    ],

    // Generic
    [ErrorCode.INTERNAL_ERROR]: [
      'Try the operation again',
      'If the problem persists, refresh the page',
      'Report this issue if it keeps happening',
    ],
    [ErrorCode.VALIDATION_ERROR]: [
      'Check your input for any mistakes',
      'Make sure all required fields are filled',
    ],
    [ErrorCode.UNKNOWN_ERROR]: [
      'Try the operation again',
      'Refresh the page if the problem continues',
      'Clear your browser cache and cookies',
    ],
  };

  return suggestions[code] || [
    'Try the operation again',
    'Refresh the page if the problem continues',
  ];
}

/**
 * Error categories for better UX
 */
export type ErrorCategory = 'network' | 'auth' | 'file' | 'container' | 'server' | 'unknown';

/**
 * Get a helpful link based on error category
 */
export function getHelpLinkForCategory(category: ErrorCategory): { label: string; url: string } | null {
  const helpLinks: Partial<Record<ErrorCategory, { label: string; url: string }>> = {
    network: {
      label: 'Troubleshooting connection issues',
      url: 'https://docs.recoder.xyz/troubleshooting/connection',
    },
    auth: {
      label: 'Authentication help',
      url: 'https://docs.recoder.xyz/troubleshooting/auth',
    },
    container: {
      label: 'Workspace troubleshooting',
      url: 'https://docs.recoder.xyz/troubleshooting/workspace',
    },
  };

  return helpLinks[category] || null;
}

/**
 * Get error category from error code
 */
export function getErrorCategory(code: ErrorCode): ErrorCategory {
  const categories: Record<ErrorCode, ErrorCategory> = {
    [ErrorCode.AUTH_REQUIRED]: 'auth',
    [ErrorCode.AUTH_INVALID_TOKEN]: 'auth',
    [ErrorCode.AUTH_TOKEN_EXPIRED]: 'auth',
    [ErrorCode.AUTH_SERVICE_ERROR]: 'auth',
    [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 'auth',
    [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 'auth',
    [ErrorCode.CONTAINER_NOT_FOUND]: 'container',
    [ErrorCode.CONTAINER_NOT_RUNNING]: 'container',
    [ErrorCode.CONTAINER_CREATE_FAILED]: 'container',
    [ErrorCode.CONTAINER_LIMIT_REACHED]: 'container',
    [ErrorCode.FILE_NOT_FOUND]: 'file',
    [ErrorCode.FILE_WRITE_FAILED]: 'file',
    [ErrorCode.FILE_READ_FAILED]: 'file',
    [ErrorCode.FILE_DELETE_FAILED]: 'file',
    [ErrorCode.FILE_PERMISSION_DENIED]: 'file',
    [ErrorCode.FILE_DISK_FULL]: 'file',
    [ErrorCode.NETWORK_ERROR]: 'network',
    [ErrorCode.CONNECTION_REFUSED]: 'network',
    [ErrorCode.WS_CONNECTION_FAILED]: 'network',
    [ErrorCode.WS_TIMEOUT]: 'network',
    [ErrorCode.TIMEOUT_ERROR]: 'network',
    [ErrorCode.DNS_ERROR]: 'network',
    [ErrorCode.SSL_ERROR]: 'network',
    [ErrorCode.RATE_LIMITED]: 'server',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'server',
    [ErrorCode.QUOTA_EXCEEDED]: 'server',
    [ErrorCode.INTERNAL_ERROR]: 'server',
    [ErrorCode.VALIDATION_ERROR]: 'server',
    [ErrorCode.UNKNOWN_ERROR]: 'unknown',
  };
  return categories[code] || 'unknown';
}

/**
 * Recovery action types
 */
export interface RecoveryAction {
  label: string;
  action: () => void | Promise<void>;
  primary?: boolean;
}

/**
 * Extended error info with recovery options
 */
export interface ErrorInfo {
  code: ErrorCode;
  message: string;
  userMessage: string;
  category: ErrorCategory;
  canRetry: boolean;
  retryAfter?: number;
  recoveryActions?: RecoveryAction[];
  details?: Record<string, unknown>;
}

/**
 * Create error info from any error
 */
export function createErrorInfo(
  error: Error | ApiErrorException | string,
  options?: {
    recoveryActions?: RecoveryAction[];
    details?: Record<string, unknown>;
  }
): ErrorInfo {
  let code: ErrorCode;
  let message: string;
  let canRetry: boolean;
  let retryAfter: number | undefined;
  let details = options?.details;

  if (error instanceof ApiErrorException) {
    code = error.code;
    message = error.message;
    canRetry = error.canRetry;
    retryAfter = error.retryAfter;
    details = { ...error.details, ...details };
  } else if (typeof error === 'string') {
    code = ErrorCode.UNKNOWN_ERROR;
    message = error;
    canRetry = true;
  } else {
    code = detectErrorCode(error);
    message = error.message;
    canRetry = isRetryableError(code);
  }

  return {
    code,
    message,
    userMessage: getUserFriendlyMessage({ code, message } as ApiError),
    category: getErrorCategory(code),
    canRetry,
    retryAfter,
    recoveryActions: options?.recoveryActions,
    details,
  };
}

/**
 * Detect error code from error message/type
 */
function detectErrorCode(error: Error): ErrorCode {
  const msg = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('failed to fetch')) {
    return ErrorCode.NETWORK_ERROR;
  }
  if (msg.includes('timeout') || name === 'aborterror') {
    return ErrorCode.TIMEOUT_ERROR;
  }
  if (msg.includes('connection refused') || msg.includes('econnrefused')) {
    return ErrorCode.CONNECTION_REFUSED;
  }
  if (msg.includes('dns') || msg.includes('enotfound')) {
    return ErrorCode.DNS_ERROR;
  }
  if (msg.includes('ssl') || msg.includes('certificate')) {
    return ErrorCode.SSL_ERROR;
  }

  // Auth errors
  if (msg.includes('unauthorized') || msg.includes('401')) {
    return ErrorCode.AUTH_REQUIRED;
  }
  if (msg.includes('forbidden') || msg.includes('403') || msg.includes('access denied')) {
    return ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED;
  }
  if (msg.includes('session') || msg.includes('token') && msg.includes('expired')) {
    return ErrorCode.AUTH_TOKEN_EXPIRED;
  }

  // File errors
  if (msg.includes('file not found') || msg.includes('enoent')) {
    return ErrorCode.FILE_NOT_FOUND;
  }
  if (msg.includes('permission denied') || msg.includes('eacces')) {
    return ErrorCode.FILE_PERMISSION_DENIED;
  }
  if (msg.includes('disk full') || msg.includes('enospc')) {
    return ErrorCode.FILE_DISK_FULL;
  }

  // Container errors
  if (msg.includes('container') && msg.includes('not found')) {
    return ErrorCode.CONTAINER_NOT_FOUND;
  }
  if (msg.includes('workspace') && (msg.includes('not found') || msg.includes('not running'))) {
    return ErrorCode.CONTAINER_NOT_RUNNING;
  }

  // Server errors
  if (msg.includes('rate limit') || msg.includes('429')) {
    return ErrorCode.RATE_LIMITED;
  }
  if (msg.includes('503') || msg.includes('service unavailable')) {
    return ErrorCode.SERVICE_UNAVAILABLE;
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  shouldRetry?: (error: Error, attempt: number) => boolean;
  onRetry?: (error: Error, attempt: number, delay: number) => void;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Execute an async operation with exponential backoff retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, backoffMultiplier, shouldRetry, onRetry } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: Error | undefined;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      const canRetry = error instanceof ApiErrorException ? error.canRetry : true;
      const shouldContinue = shouldRetry ? shouldRetry(lastError, attempt) : canRetry;

      if (!shouldContinue || attempt === maxRetries) {
        throw lastError;
      }

      // Use retryAfter from API response if available
      const actualDelay =
        error instanceof ApiErrorException && error.retryAfter
          ? error.retryAfter * 1000
          : delay;

      // Notify about retry
      onRetry?.(lastError, attempt + 1, actualDelay);

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError || new Error('Retry failed');
}

/**
 * WebSocket reconnection manager
 */
export interface WebSocketReconnectConfig {
  maxReconnects: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  onReconnecting?: (attempt: number, delay: number) => void;
  onReconnected?: () => void;
  onMaxReconnectsReached?: () => void;
  onMessage?: (event: MessageEvent) => void;
  onError?: (event: Event) => void;
}

export class ReconnectingWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectDelay: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manualClose = false;
  private messageQueue: string[] = [];

  constructor(
    private readonly url: string,
    private readonly protocols: string | string[] | undefined,
    private readonly config: WebSocketReconnectConfig
  ) {
    this.reconnectDelay = config.initialDelay;
    this.connect();
  }

  private connect(): void {
    if (this.manualClose) return;

    try {
      this.ws = new WebSocket(this.url, this.protocols);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.reconnectDelay = this.config.initialDelay;

        // Send queued messages
        while (this.messageQueue.length > 0) {
          const message = this.messageQueue.shift();
          if (message && this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(message);
          }
        }

        if (this.reconnectAttempts > 0) {
          this.config.onReconnected?.();
        }
      };

      this.ws.onclose = (event) => {
        if (!this.manualClose && event.code !== 1000) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (event) => {
        this.config.onError?.(event);
      };

      this.ws.onmessage = (event) => {
        this.config.onMessage?.(event);
      };
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.manualClose) return;

    if (this.reconnectAttempts >= this.config.maxReconnects) {
      this.config.onMaxReconnectsReached?.();
      return;
    }

    this.reconnectAttempts++;
    this.config.onReconnecting?.(this.reconnectAttempts, this.reconnectDelay);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff
    this.reconnectDelay = Math.min(
      this.reconnectDelay * this.config.backoffMultiplier,
      this.config.maxDelay
    );
  }

  public send(data: string | ArrayBuffer | Blob): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else if (typeof data === 'string') {
      // Queue string messages for sending after reconnect
      this.messageQueue.push(data);
    }
  }

  public close(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.ws?.close(1000, 'Manual close');
  }

  public getState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  public isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  public getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}

/**
 * Parse API response and throw if error
 */
export async function parseApiResponse<T>(response: Response): Promise<T> {
  const data = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !data.success) {
    if (data.error) {
      throw new ApiErrorException(data.error, {
        canRetry: data.canRetry,
        retryAfter: data.retryAfter,
      });
    }
    throw new ApiErrorException(`Request failed with status ${response.status}`, {
      canRetry: response.status >= 500,
    });
  }

  return data.data as T;
}

/**
 * Fetch with automatic retry and error handling
 */
export async function fetchWithRetry<T>(
  url: string,
  options?: RequestInit,
  retryConfig?: Partial<RetryConfig>
): Promise<T> {
  return withRetry(
    async () => {
      const response = await fetch(url, options);
      return parseApiResponse<T>(response);
    },
    {
      ...retryConfig,
      shouldRetry: (error, attempt) => {
        // Don't retry auth errors or validation errors
        if (error instanceof ApiErrorException) {
          if (
            error.code === ErrorCode.AUTH_REQUIRED ||
            error.code === ErrorCode.AUTH_TOKEN_EXPIRED ||
            error.code === ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED
          ) {
            return false;
          }
        }
        return true;
      },
    }
  );
}

/**
 * Connection status types
 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error' | 'reconnecting';

/**
 * Connection status manager for UI display
 */
export interface ConnectionState {
  status: ConnectionStatus;
  lastConnected?: Date;
  reconnectAttempt?: number;
  error?: string;
}

export function getConnectionStatusMessage(state: ConnectionState): string {
  switch (state.status) {
    case 'connected':
      return 'Connected';
    case 'connecting':
      return 'Connecting...';
    case 'reconnecting':
      return `Reconnecting (attempt ${state.reconnectAttempt || 1})...`;
    case 'disconnected':
      return 'Disconnected';
    case 'error':
      return state.error || 'Connection error';
    default:
      return 'Unknown status';
  }
}

export function getConnectionStatusColor(status: ConnectionStatus): string {
  switch (status) {
    case 'connected':
      return 'text-green-500';
    case 'connecting':
    case 'reconnecting':
      return 'text-yellow-500';
    case 'disconnected':
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Debounced error reporter to prevent flooding
 */
export function createErrorReporter(
  reportFn: (error: Error, context?: Record<string, unknown>) => void,
  debounceMs: number = 5000
): (error: Error, context?: Record<string, unknown>) => void {
  const reported = new Map<string, number>();

  return (error: Error, context?: Record<string, unknown>) => {
    const key = `${error.name}:${error.message}`;
    const lastReported = reported.get(key);
    const now = Date.now();

    if (!lastReported || now - lastReported > debounceMs) {
      reported.set(key, now);
      reportFn(error, context);
    }

    // Clean up old entries
    reported.forEach((timestamp, k) => {
      if (now - timestamp > debounceMs * 2) {
        reported.delete(k);
      }
    });
  };
}

/**
 * File operation error with details
 */
export class FileOperationError extends ApiErrorException {
  public readonly filePath: string;
  public readonly operation: 'read' | 'write' | 'delete' | 'create' | 'move';

  constructor(
    operation: 'read' | 'write' | 'delete' | 'create' | 'move',
    filePath: string,
    message: string,
    options?: { canRetry?: boolean }
  ) {
    const codeMap: Record<string, ErrorCode> = {
      read: ErrorCode.FILE_READ_FAILED,
      write: ErrorCode.FILE_WRITE_FAILED,
      delete: ErrorCode.FILE_DELETE_FAILED,
      create: ErrorCode.FILE_WRITE_FAILED,
      move: ErrorCode.FILE_WRITE_FAILED,
    };
    super(
      { code: codeMap[operation], message, details: { filePath, operation } },
      { canRetry: options?.canRetry ?? true }
    );
    this.filePath = filePath;
    this.operation = operation;
    this.name = 'FileOperationError';
  }
}

/**
 * Network error with connection details
 */
export class NetworkError extends ApiErrorException {
  public readonly url?: string;
  public readonly statusCode?: number;

  constructor(
    message: string,
    options?: { url?: string; statusCode?: number; canRetry?: boolean }
  ) {
    super(
      { code: ErrorCode.NETWORK_ERROR, message, details: { url: options?.url } },
      { canRetry: options?.canRetry ?? true }
    );
    this.url = options?.url;
    this.statusCode = options?.statusCode;
    this.name = 'NetworkError';
  }
}

/**
 * Authentication error
 */
export class AuthError extends ApiErrorException {
  public readonly isExpired: boolean;

  constructor(message: string, options?: { isExpired?: boolean }) {
    super(
      {
        code: options?.isExpired ? ErrorCode.AUTH_TOKEN_EXPIRED : ErrorCode.AUTH_REQUIRED,
        message,
      },
      { canRetry: false }
    );
    this.isExpired = options?.isExpired ?? false;
    this.name = 'AuthError';
  }
}

/**
 * Timeout error
 */
export class TimeoutError extends ApiErrorException {
  public readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(
      { code: ErrorCode.TIMEOUT_ERROR, message, details: { timeoutMs } },
      { canRetry: true }
    );
    this.timeoutMs = timeoutMs;
    this.name = 'TimeoutError';
  }
}

/**
 * Server error (5xx)
 */
export class ServerError extends ApiErrorException {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(
      { code: ErrorCode.SERVICE_UNAVAILABLE, message, details: { statusCode } },
      { canRetry: true }
    );
    this.statusCode = statusCode;
    this.name = 'ServerError';
  }
}

/**
 * Global error event system for centralized error handling
 */
export type ErrorEventListener = (error: ErrorInfo) => void;

class ErrorEventEmitter {
  private listeners: Set<ErrorEventListener> = new Set();

  subscribe(listener: ErrorEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(error: ErrorInfo): void {
    this.listeners.forEach((listener) => {
      try {
        listener(error);
      } catch (e) {
        console.error('[ErrorEventEmitter] Listener error:', e);
      }
    });
  }
}

export const errorEvents = new ErrorEventEmitter();

/**
 * Report an error to the global error system
 */
export function reportError(
  error: Error | ApiErrorException | string,
  options?: {
    recoveryActions?: RecoveryAction[];
    details?: Record<string, unknown>;
  }
): void {
  const errorInfo = createErrorInfo(error, options);
  errorEvents.emit(errorInfo);

  // Log for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error('[ErrorHandler]', errorInfo);
  }
}

/**
 * Wrap an async function with error handling
 */
export function withErrorHandling<T>(
  fn: () => Promise<T>,
  options?: {
    onError?: (error: ErrorInfo) => void;
    recoveryActions?: RecoveryAction[];
    rethrow?: boolean;
  }
): Promise<T> {
  return fn().catch((error) => {
    const errorInfo = createErrorInfo(error, {
      recoveryActions: options?.recoveryActions,
    });
    options?.onError?.(errorInfo);
    errorEvents.emit(errorInfo);

    if (options?.rethrow !== false) {
      throw error;
    }
    return undefined as T;
  });
}

/**
 * Batch file operation error tracking
 */
export interface FileOperationResult {
  path: string;
  success: boolean;
  error?: string;
}

export interface BatchOperationResult {
  totalCount: number;
  successCount: number;
  failedCount: number;
  results: FileOperationResult[];
}

export function createBatchOperationTracker(): {
  track: (path: string, success: boolean, error?: string) => void;
  getResult: () => BatchOperationResult;
} {
  const results: FileOperationResult[] = [];

  return {
    track(path: string, success: boolean, error?: string) {
      results.push({ path, success, error });
    },
    getResult() {
      return {
        totalCount: results.length,
        successCount: results.filter((r) => r.success).length,
        failedCount: results.filter((r) => !r.success).length,
        results,
      };
    },
  };
}
