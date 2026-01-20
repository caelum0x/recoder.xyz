/**
 * Central Error Handler for Docker Backend
 * Provides Express middleware and utilities for structured error handling
 */

import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, ErrorCode, ErrorStatusMap, ApiErrorResponse } from './types.js';

// Request ID counter for tracing
let requestIdCounter = 0;

/**
 * Generate unique request ID for tracing
 */
export function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const counter = (requestIdCounter++).toString(36);
  return `req-${timestamp}-${counter}`;
}

/**
 * Structured logging for errors
 */
export interface ErrorLogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info';
  requestId?: string;
  errorCode: ErrorCode;
  message: string;
  statusCode: number;
  details?: Record<string, unknown>;
  stack?: string;
  userId?: string;
  projectId?: string;
  path?: string;
  method?: string;
  duration?: number;
}

/**
 * Log an error with structured format
 */
export function logError(entry: Partial<ErrorLogEntry> & { errorCode: ErrorCode; message: string }): void {
  const logEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'error',
    statusCode: ErrorStatusMap[entry.errorCode] || 500,
    ...entry,
  };

  // In production, you might send this to a logging service
  console.error(JSON.stringify(logEntry));
}

/**
 * Log a warning with structured format
 */
export function logWarning(
  errorCode: ErrorCode,
  message: string,
  details?: Record<string, unknown>
): void {
  const logEntry: ErrorLogEntry = {
    timestamp: new Date().toISOString(),
    level: 'warn',
    errorCode,
    message,
    statusCode: ErrorStatusMap[errorCode] || 500,
    details,
  };

  console.warn(JSON.stringify(logEntry));
}

/**
 * Express middleware to add request ID to requests
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = generateRequestId();
  (req as any).requestId = requestId;
  res.setHeader('X-Request-ID', requestId);
  next();
}

/**
 * Express middleware to track request timing
 */
export function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  (req as any).startTime = startTime;

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (duration > 5000) {
      // Log slow requests
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          type: 'SLOW_REQUEST',
          method: req.method,
          path: req.path,
          duration,
          statusCode: res.statusCode,
        })
      );
    }
  });

  next();
}

/**
 * Global error handling middleware for Express
 * Must be added after all routes
 */
export const globalErrorHandler: ErrorRequestHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req as any).requestId;
  const startTime = (req as any).startTime;
  const duration = startTime ? Date.now() - startTime : undefined;

  // Convert to AppError if needed
  const appError = err instanceof AppError ? err : AppError.fromError(err);

  // Log the error
  logError({
    requestId,
    errorCode: appError.code,
    message: appError.message,
    statusCode: appError.statusCode,
    details: appError.details,
    stack: process.env.NODE_ENV !== 'production' ? appError.stack : undefined,
    userId: (req as any).userId,
    projectId: req.params?.projectId || (req.body as any)?.projectId,
    path: req.path,
    method: req.method,
    duration,
  });

  // Send error response
  const response: ApiErrorResponse = appError.toResponse(requestId);

  // Don't expose stack traces in production
  if (process.env.NODE_ENV === 'production') {
    delete (response.error as any).stack;
  }

  res.status(appError.statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: T, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Send standardized error response
 */
export function sendError(
  res: Response,
  error: AppError | ErrorCode,
  options?: {
    message?: string;
    details?: Record<string, unknown>;
    requestId?: string;
  }
): void {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(error, options?.message, { details: options?.details });

  const response = appError.toResponse(options?.requestId);
  res.status(appError.statusCode).json(response);
}

/**
 * Send standardized success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data?: T;
  message?: string;
}

export function sendSuccess<T = unknown>(
  res: Response,
  data?: T,
  options?: {
    message?: string;
    statusCode?: number;
  }
): void {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
    message: options?.message,
  };

  res.status(options?.statusCode || 200).json(response);
}

/**
 * WebSocket error handler
 * Sends structured error messages over WebSocket
 */
export interface WsErrorMessage {
  type: 'error';
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    canRetry?: boolean;
    retryAfter?: number;
  };
  timestamp: string;
}

export function createWsError(
  error: AppError | ErrorCode,
  options?: {
    message?: string;
    details?: Record<string, unknown>;
  }
): WsErrorMessage {
  const appError =
    error instanceof AppError
      ? error
      : new AppError(error, options?.message, { details: options?.details });

  return {
    type: 'error',
    error: {
      code: appError.code,
      message: appError.message,
      details: appError.details,
      canRetry: appError.canRetry,
      retryAfter: appError.retryAfter,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Send error over WebSocket connection
 */
export function sendWsError(
  ws: { send: (data: string) => void; readyState?: number },
  error: AppError | ErrorCode,
  options?: {
    message?: string;
    details?: Record<string, unknown>;
  }
): void {
  // Check if WebSocket is open (readyState 1 = OPEN)
  if (ws.readyState !== undefined && ws.readyState !== 1) {
    return;
  }

  try {
    const errorMessage = createWsError(error, options);
    ws.send(JSON.stringify(errorMessage));
  } catch (e) {
    console.error('[WS Error] Failed to send error:', e);
  }
}

/**
 * Safe WebSocket close with error code mapping
 */
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  NO_STATUS: 1005,
  ABNORMAL_CLOSE: 1006,
  INVALID_PAYLOAD: 1007,
  POLICY_VIOLATION: 1008,
  MESSAGE_TOO_BIG: 1009,
  EXTENSION_ERROR: 1010,
  INTERNAL_ERROR: 1011,
  SERVICE_RESTART: 1012,
  TRY_AGAIN_LATER: 1013,
} as const;

export function closeWsWithError(
  ws: { close: (code?: number, reason?: string) => void },
  appError: AppError
): void {
  let closeCode: number = WS_CLOSE_CODES.INTERNAL_ERROR;

  // Map AppError codes to WebSocket close codes
  switch (appError.code) {
    case ErrorCode.AUTH_REQUIRED:
    case ErrorCode.AUTH_INVALID_TOKEN:
    case ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED:
      closeCode = WS_CLOSE_CODES.POLICY_VIOLATION;
      break;
    case ErrorCode.CONTAINER_NOT_FOUND:
    case ErrorCode.TERMINAL_NOT_FOUND:
      closeCode = WS_CLOSE_CODES.POLICY_VIOLATION;
      break;
    case ErrorCode.RATE_LIMITED:
    case ErrorCode.RESOURCE_EXHAUSTED:
      closeCode = WS_CLOSE_CODES.TRY_AGAIN_LATER;
      break;
    case ErrorCode.WS_MESSAGE_PARSE_ERROR:
      closeCode = WS_CLOSE_CODES.INVALID_PAYLOAD;
      break;
    default:
      closeCode = WS_CLOSE_CODES.INTERNAL_ERROR;
  }

  ws.close(closeCode, appError.message.substring(0, 123)); // Max 123 bytes for close reason
}

/**
 * Error recovery utilities
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Retry an async operation with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = {
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

      // Check if error is retryable
      const appError = AppError.fromError(error);
      if (!appError.canRetry || attempt === maxRetries) {
        throw appError;
      }

      console.log(
        `[Retry] Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError || new AppError(ErrorCode.INTERNAL_ERROR, 'Retry failed');
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly threshold: number = 5,
    private readonly resetTimeout: number = 30000
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        throw new AppError(ErrorCode.SERVICE_UNAVAILABLE, 'Circuit breaker is open', {
          canRetry: true,
          retryAfter: Math.ceil((this.resetTimeout - (Date.now() - this.lastFailure)) / 1000),
        });
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailure = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'open';
      console.warn(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: 'warn',
          type: 'CIRCUIT_BREAKER_OPEN',
          failures: this.failures,
        })
      );
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }
}

// Export default handlers
export default {
  globalErrorHandler,
  asyncHandler,
  sendError,
  sendSuccess,
  sendWsError,
  closeWsWithError,
  withRetry,
  requestIdMiddleware,
  requestTimingMiddleware,
};
