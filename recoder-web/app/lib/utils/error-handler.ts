/**
 * Frontend Error Handler Utilities
 * Provides structured error handling, retry mechanisms, and WebSocket error handling
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

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  WS_CONNECTION_FAILED = 'WS_CONNECTION_FAILED',
  WS_TIMEOUT = 'WS_TIMEOUT',

  // Resource errors
  RATE_LIMITED = 'RATE_LIMITED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',

  // Generic errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
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
    [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 'You do not have access to this project.',
    [ErrorCode.CONTAINER_NOT_FOUND]: 'Workspace not found. It may have been stopped.',
    [ErrorCode.CONTAINER_NOT_RUNNING]: 'Starting your workspace...',
    [ErrorCode.CONTAINER_LIMIT_REACHED]: 'You have reached the maximum number of active projects. Please close some projects and try again.',
    [ErrorCode.NETWORK_ERROR]: 'Network error. Please check your connection.',
    [ErrorCode.WS_CONNECTION_FAILED]: 'Connection lost. Attempting to reconnect...',
    [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment.',
    [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again.',
  };

  return messages[code] || fallback || 'An error occurred';
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
    for (const [k, timestamp] of reported) {
      if (now - timestamp > debounceMs * 2) {
        reported.delete(k);
      }
    }
  };
}
