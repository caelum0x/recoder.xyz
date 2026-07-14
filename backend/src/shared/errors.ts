/**
 * Typed error taxonomy + the uniform HTTP envelope.
 *
 * This is the self-contained spine version of the legacy `backend/src/errors/*`
 * module (which was compiled-only and coupled to `cors-utils`). It keeps the
 * same `ErrorCode` string values for wire compatibility but drops the v1
 * container/file/terminal bloat and the cors coupling.
 *
 * ARCHITECTURE §10.9: the error envelope is uniform —
 * `sendSuccess(res, data)` / `sendError(res, createError(code, msg))`. Canonical
 * codes are `SERVICE_UNAVAILABLE` / `AUTHZ_PROJECT_ACCESS_DENIED` (never
 * `FORBIDDEN` / `EXTERNAL_SERVICE_ERROR`). Errors never leak stack/secret to the
 * client; full context is logged server-side by the caller.
 */
import type { Request, Response, NextFunction, RequestHandler, ErrorRequestHandler } from 'express';

/**
 * The canonical error code taxonomy. A `const` object (not an `enum`) so it is
 * both a value (`ErrorCode.SERVICE_UNAVAILABLE`) and a string-literal union type.
 */
export const ErrorCode = {
  // Authentication
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  AUTH_INVALID_TOKEN: 'AUTH_INVALID_TOKEN',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_SERVICE_ERROR: 'AUTH_SERVICE_ERROR',
  // Authorization (canonical: AUTHZ_PROJECT_ACCESS_DENIED, no FORBIDDEN)
  AUTHZ_PROJECT_ACCESS_DENIED: 'AUTHZ_PROJECT_ACCESS_DENIED',
  AUTHZ_OWNERSHIP_CHECK_FAILED: 'AUTHZ_OWNERSHIP_CHECK_FAILED',
  AUTHZ_SERVICE_ERROR: 'AUTHZ_SERVICE_ERROR',
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  // Resource / rate
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  RESOURCE_EXHAUSTED: 'RESOURCE_EXHAUSTED',
  TIMEOUT: 'TIMEOUT',
  // Generic / service (canonical: SERVICE_UNAVAILABLE, no EXTERNAL_SERVICE_ERROR)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Code → HTTP status. Used by `toHttp` and `sendError`. */
const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.AUTH_INVALID_TOKEN]: 401,
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 401,
  [ErrorCode.AUTH_SERVICE_ERROR]: 503,
  [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 403,
  [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 403,
  [ErrorCode.AUTHZ_SERVICE_ERROR]: 503,
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.INVALID_INPUT]: 400,
  [ErrorCode.MISSING_REQUIRED_FIELD]: 400,
  [ErrorCode.NOT_FOUND]: 404,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.QUOTA_EXCEEDED]: 429,
  [ErrorCode.RESOURCE_EXHAUSTED]: 503,
  [ErrorCode.TIMEOUT]: 504,
  [ErrorCode.INTERNAL_ERROR]: 500,
  [ErrorCode.NOT_IMPLEMENTED]: 501,
  [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  [ErrorCode.UNKNOWN_ERROR]: 500,
};

/** Default user-safe message per code (never leaks internals). */
const ERROR_MESSAGE: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.AUTH_REQUIRED]: 'Authentication required.',
  [ErrorCode.AUTH_INVALID_TOKEN]: 'Invalid or expired authentication token.',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCode.AUTH_SERVICE_ERROR]: 'Authentication service is temporarily unavailable.',
  [ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED]: 'You do not have access to this resource.',
  [ErrorCode.AUTHZ_OWNERSHIP_CHECK_FAILED]: 'Unable to verify resource ownership.',
  [ErrorCode.AUTHZ_SERVICE_ERROR]: 'Authorization service is temporarily unavailable.',
  [ErrorCode.VALIDATION_ERROR]: 'Validation error.',
  [ErrorCode.INVALID_INPUT]: 'Invalid input provided.',
  [ErrorCode.MISSING_REQUIRED_FIELD]: 'A required field is missing.',
  [ErrorCode.NOT_FOUND]: 'Resource not found.',
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please slow down.',
  [ErrorCode.QUOTA_EXCEEDED]: 'Quota exceeded.',
  [ErrorCode.RESOURCE_EXHAUSTED]: 'System resources exhausted. Please try again later.',
  [ErrorCode.TIMEOUT]: 'The operation timed out.',
  [ErrorCode.INTERNAL_ERROR]: 'An internal error occurred.',
  [ErrorCode.NOT_IMPLEMENTED]: 'Not implemented.',
  [ErrorCode.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable.',
  [ErrorCode.UNKNOWN_ERROR]: 'An unexpected error occurred.',
};

export interface AppErrorOptions {
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}

/** The standard error envelope body sent to clients. */
export interface ErrorEnvelope {
  readonly success: false;
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details?: Record<string, unknown>;
    readonly requestId?: string;
    readonly timestamp: string;
  };
}

/** The standard success envelope body. */
export interface SuccessEnvelope<T> {
  readonly success: true;
  readonly data: T;
  readonly message?: string;
}

/** Map an error code to its HTTP status. */
export function toHttp(code: ErrorCode): number {
  return ERROR_STATUS[code] ?? 500;
}

/** Structured application error carrying a typed code + HTTP status. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: Record<string, unknown>;
  readonly timestamp: string;

  constructor(code: ErrorCode, message?: string, options?: AppErrorOptions) {
    super(message ?? ERROR_MESSAGE[code] ?? 'An error occurred');
    this.name = 'AppError';
    this.code = code;
    this.statusCode = toHttp(code);
    this.details = options?.details;
    this.timestamp = new Date().toISOString();
    if (options?.cause !== undefined) {
      (this as { cause?: unknown }).cause = options.cause;
    }
    Error.captureStackTrace?.(this, this.constructor);
  }

  /** Serialize to the wire envelope (never includes the stack). */
  toEnvelope(requestId?: string): ErrorEnvelope {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
        ...(requestId ? { requestId } : {}),
        timestamp: this.timestamp,
      },
    };
  }

  /** Coerce any thrown value into an AppError without losing context. */
  static from(error: unknown, fallback: ErrorCode = ErrorCode.INTERNAL_ERROR): AppError {
    if (error instanceof AppError) return error;
    if (error instanceof Error) return new AppError(fallback, error.message, { cause: error });
    return new AppError(fallback, String(error));
  }
}

/** Construct an AppError. `createError(ErrorCode.VALIDATION_ERROR, 'msg')`. */
export function createError(code: ErrorCode, message?: string, options?: AppErrorOptions): AppError {
  return new AppError(code, message, options);
}

/** Send the uniform success envelope. */
export function sendSuccess<T>(res: Response, data: T, options?: { statusCode?: number; message?: string }): void {
  const body: SuccessEnvelope<T> = {
    success: true,
    data,
    ...(options?.message ? { message: options.message } : {}),
  };
  res.status(options?.statusCode ?? 200).json(body);
}

/** Send the uniform error envelope for an AppError or coerced error. */
export function sendError(res: Response, error: unknown, options?: { requestId?: string }): void {
  const appError = AppError.from(error);
  res.status(appError.statusCode).json(appError.toEnvelope(options?.requestId));
}

/** Wrap an async route handler so rejections flow to the error middleware. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Terminal Express error middleware. Logs full context; returns a safe envelope. */
export function errorEnvelope(log?: {
  error: (obj: unknown, msg?: string) => void;
}): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const appError = AppError.from(err);
    const requestId = (req as { requestId?: string }).requestId;
    log?.error(
      {
        code: appError.code,
        statusCode: appError.statusCode,
        message: appError.message,
        details: appError.details,
        path: req.path,
        method: req.method,
        requestId,
        stack: process.env.NODE_ENV !== 'production' ? appError.stack : undefined,
      },
      'request failed',
    );
    if (res.headersSent) {
      return;
    }
    res.status(appError.statusCode).json(appError.toEnvelope(requestId));
  };
}

/** 404 handler for unmatched routes. */
export function notFound(): RequestHandler {
  return (req, res) => {
    sendError(res, createError(ErrorCode.NOT_FOUND, `No route for ${req.method} ${req.path}`));
  };
}
