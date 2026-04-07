/**
 * Centralized Error Types for Docker Backend
 * Provides structured error handling with codes, messages, and metadata
 */
export declare enum ErrorCode {
    AUTH_REQUIRED = "AUTH_REQUIRED",
    AUTH_INVALID_TOKEN = "AUTH_INVALID_TOKEN",
    AUTH_TOKEN_EXPIRED = "AUTH_TOKEN_EXPIRED",
    AUTH_SERVICE_ERROR = "AUTH_SERVICE_ERROR",
    AUTHZ_PROJECT_ACCESS_DENIED = "AUTHZ_PROJECT_ACCESS_DENIED",
    AUTHZ_OWNERSHIP_CHECK_FAILED = "AUTHZ_OWNERSHIP_CHECK_FAILED",
    AUTHZ_SERVICE_ERROR = "AUTHZ_SERVICE_ERROR",
    CONTAINER_NOT_FOUND = "CONTAINER_NOT_FOUND",
    CONTAINER_NOT_RUNNING = "CONTAINER_NOT_RUNNING",
    CONTAINER_CREATE_FAILED = "CONTAINER_CREATE_FAILED",
    CONTAINER_START_FAILED = "CONTAINER_START_FAILED",
    CONTAINER_STOP_FAILED = "CONTAINER_STOP_FAILED",
    CONTAINER_LIMIT_REACHED = "CONTAINER_LIMIT_REACHED",
    CONTAINER_EXEC_FAILED = "CONTAINER_EXEC_FAILED",
    CONTAINER_UNHEALTHY = "CONTAINER_UNHEALTHY",
    FILE_NOT_FOUND = "FILE_NOT_FOUND",
    FILE_READ_FAILED = "FILE_READ_FAILED",
    FILE_WRITE_FAILED = "FILE_WRITE_FAILED",
    FILE_DELETE_FAILED = "FILE_DELETE_FAILED",
    FILE_PATH_INVALID = "FILE_PATH_INVALID",
    FILE_PERMISSION_DENIED = "FILE_PERMISSION_DENIED",
    PORT_ALLOCATION_FAILED = "PORT_ALLOCATION_FAILED",
    PORT_IN_USE = "PORT_IN_USE",
    NETWORK_ERROR = "NETWORK_ERROR",
    CONNECTION_REFUSED = "CONNECTION_REFUSED",
    WS_CONNECTION_FAILED = "WS_CONNECTION_FAILED",
    WS_MESSAGE_PARSE_ERROR = "WS_MESSAGE_PARSE_ERROR",
    WS_TIMEOUT = "WS_TIMEOUT",
    WS_CLOSED_ABNORMALLY = "WS_CLOSED_ABNORMALLY",
    TERMINAL_CREATE_FAILED = "TERMINAL_CREATE_FAILED",
    TERMINAL_NOT_FOUND = "TERMINAL_NOT_FOUND",
    TERMINAL_EXEC_FAILED = "TERMINAL_EXEC_FAILED",
    DEV_SERVER_START_FAILED = "DEV_SERVER_START_FAILED",
    DEV_SERVER_NOT_RUNNING = "DEV_SERVER_NOT_RUNNING",
    DEV_SERVER_TIMEOUT = "DEV_SERVER_TIMEOUT",
    RESOURCE_EXHAUSTED = "RESOURCE_EXHAUSTED",
    RATE_LIMITED = "RATE_LIMITED",
    QUOTA_EXCEEDED = "QUOTA_EXCEEDED",
    LSP_NOT_AVAILABLE = "LSP_NOT_AVAILABLE",
    LSP_SERVER_ERROR = "LSP_SERVER_ERROR",
    LSP_TIMEOUT = "LSP_TIMEOUT",
    DAP_ERROR = "DAP_ERROR",
    DAP_TIMEOUT = "DAP_TIMEOUT",
    DAP_NOT_AVAILABLE = "DAP_NOT_AVAILABLE",
    DAP_SESSION_NOT_FOUND = "DAP_SESSION_NOT_FOUND",
    NOT_FOUND = "NOT_FOUND",
    TIMEOUT = "TIMEOUT",
    CONNECTION_ERROR = "CONNECTION_ERROR",
    SPAWN_ERROR = "SPAWN_ERROR",
    GIT_OPERATION_FAILED = "GIT_OPERATION_FAILED",
    GIT_CLONE_FAILED = "GIT_CLONE_FAILED",
    GIT_AUTH_FAILED = "GIT_AUTH_FAILED",
    VALIDATION_ERROR = "VALIDATION_ERROR",
    INVALID_INPUT = "INVALID_INPUT",
    MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
    INTERNAL_ERROR = "INTERNAL_ERROR",
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED",
    SERVICE_UNAVAILABLE = "SERVICE_UNAVAILABLE",
    UNKNOWN_ERROR = "UNKNOWN_ERROR"
}
export declare const ErrorStatusMap: Record<ErrorCode, number>;
export declare const ErrorMessages: Record<ErrorCode, string>;
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
    canRetry?: boolean;
    retryAfter?: number;
}
/**
 * Custom error class for application errors
 */
export declare class AppError extends Error {
    readonly code: ErrorCode;
    readonly statusCode: number;
    readonly details?: ErrorDetails;
    readonly canRetry: boolean;
    readonly retryAfter?: number;
    readonly timestamp: string;
    constructor(code: ErrorCode, message?: string, options?: {
        details?: ErrorDetails;
        canRetry?: boolean;
        retryAfter?: number;
        cause?: Error;
    });
    /**
     * Determine if error is retryable by default
     */
    private isRetryable;
    /**
     * Convert to API response format
     */
    toResponse(requestId?: string): ApiErrorResponse;
    /**
     * Create from unknown error
     */
    static fromError(error: unknown, defaultCode?: ErrorCode): AppError;
    /**
     * Detect error code from error message
     */
    static detectErrorCode(message: string): ErrorCode | null;
}
/**
 * Simple function to create an AppError with a code and message
 * Usage: createError(ErrorCode.DAP_ERROR, 'Debug adapter failed')
 */
export declare function createError(code: ErrorCode, message?: string, options?: {
    details?: ErrorDetails;
    canRetry?: boolean;
    retryAfter?: number;
    cause?: Error;
}): AppError;
/**
 * Helper functions to create specific errors (typed shortcuts)
 */
export declare const createTypedError: {
    auth: {
        required: () => AppError;
        invalidToken: () => AppError;
        expired: () => AppError;
        serviceError: (cause?: Error) => AppError;
    };
    container: {
        notFound: (projectId: string) => AppError;
        notRunning: (projectId: string) => AppError;
        createFailed: (projectId: string, cause?: Error) => AppError;
        limitReached: (current: number, max: number) => AppError;
    };
    file: {
        notFound: (path: string) => AppError;
        invalidPath: (path: string) => AppError;
        writeFailed: (path: string, cause?: Error) => AppError;
    };
    validation: {
        required: (field: string) => AppError;
        invalid: (field: string, reason?: string) => AppError;
    };
    websocket: {
        connectionFailed: (reason?: string) => AppError;
        timeout: () => AppError;
        parseError: (message?: string) => AppError;
    };
};
export default AppError;
