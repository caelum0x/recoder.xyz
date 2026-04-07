/**
 * Central Error Handler for Docker Backend
 * Provides Express middleware and utilities for structured error handling
 */
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { AppError, ErrorCode } from './types.js';
/**
 * Generate unique request ID for tracing
 */
export declare function generateRequestId(): string;
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
export declare function logError(entry: Partial<ErrorLogEntry> & {
    errorCode: ErrorCode;
    message: string;
}): void;
/**
 * Log a warning with structured format
 */
export declare function logWarning(errorCode: ErrorCode, message: string, details?: Record<string, unknown>): void;
/**
 * Express middleware to add request ID to requests
 */
export declare function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Express middleware to track request timing
 */
export declare function requestTimingMiddleware(req: Request, res: Response, next: NextFunction): void;
/**
 * Global error handling middleware for Express
 * Must be added after all routes
 */
export declare const globalErrorHandler: ErrorRequestHandler;
/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
export declare function asyncHandler<T extends Request = Request>(fn: (req: T, res: Response, next: NextFunction) => Promise<any>): (req: T, res: Response, next: NextFunction) => void;
/**
 * Send standardized error response
 */
export declare function sendError(res: Response, error: AppError | ErrorCode, options?: {
    message?: string;
    details?: Record<string, unknown>;
    requestId?: string;
}): void;
/**
 * Send standardized success response
 */
export interface ApiSuccessResponse<T = unknown> {
    success: true;
    data?: T;
    message?: string;
}
export declare function sendSuccess<T = unknown>(res: Response, data?: T, options?: {
    message?: string;
    statusCode?: number;
}): void;
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
export declare function createWsError(error: AppError | ErrorCode, options?: {
    message?: string;
    details?: Record<string, unknown>;
}): WsErrorMessage;
/**
 * Send error over WebSocket connection
 */
export declare function sendWsError(ws: {
    send: (data: string) => void;
    readyState?: number;
}, error: AppError | ErrorCode, options?: {
    message?: string;
    details?: Record<string, unknown>;
}): void;
/**
 * Safe WebSocket close with error code mapping
 */
export declare const WS_CLOSE_CODES: {
    readonly NORMAL: 1000;
    readonly GOING_AWAY: 1001;
    readonly PROTOCOL_ERROR: 1002;
    readonly UNSUPPORTED_DATA: 1003;
    readonly NO_STATUS: 1005;
    readonly ABNORMAL_CLOSE: 1006;
    readonly INVALID_PAYLOAD: 1007;
    readonly POLICY_VIOLATION: 1008;
    readonly MESSAGE_TOO_BIG: 1009;
    readonly EXTENSION_ERROR: 1010;
    readonly INTERNAL_ERROR: 1011;
    readonly SERVICE_RESTART: 1012;
    readonly TRY_AGAIN_LATER: 1013;
};
export declare function closeWsWithError(ws: {
    close: (code?: number, reason?: string) => void;
}, appError: AppError): void;
/**
 * Error recovery utilities
 */
export interface RetryConfig {
    maxRetries: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
}
/**
 * Retry an async operation with exponential backoff
 */
export declare function withRetry<T>(operation: () => Promise<T>, config?: Partial<RetryConfig>): Promise<T>;
/**
 * Circuit breaker for protecting against cascading failures
 */
export declare class CircuitBreaker {
    private readonly threshold;
    private readonly resetTimeout;
    private failures;
    private lastFailure;
    private state;
    constructor(threshold?: number, resetTimeout?: number);
    execute<T>(operation: () => Promise<T>): Promise<T>;
    private onSuccess;
    private onFailure;
    getState(): 'closed' | 'open' | 'half-open';
}
declare const _default: {
    globalErrorHandler: ErrorRequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
    asyncHandler: typeof asyncHandler;
    sendError: typeof sendError;
    sendSuccess: typeof sendSuccess;
    sendWsError: typeof sendWsError;
    closeWsWithError: typeof closeWsWithError;
    withRetry: typeof withRetry;
    requestIdMiddleware: typeof requestIdMiddleware;
    requestTimingMiddleware: typeof requestTimingMiddleware;
};
export default _default;
