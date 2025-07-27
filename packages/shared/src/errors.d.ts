/**
 * Error types and handling utilities
 */
export declare enum ErrorCode {
    AUTHENTICATION_REQUIRED = "AUTH_001",
    INVALID_TOKEN = "AUTH_002",
    TOKEN_EXPIRED = "AUTH_003",
    INSUFFICIENT_PERMISSIONS = "AUTH_004",
    INVALID_CREDENTIALS = "AUTH_005",
    API_CONNECTION_FAILED = "API_001",
    API_TIMEOUT = "API_002",
    API_RATE_LIMIT = "API_003",
    API_SERVER_ERROR = "API_004",
    API_INVALID_RESPONSE = "API_005",
    VALIDATION_FAILED = "VAL_001",
    INVALID_INPUT = "VAL_002",
    MISSING_REQUIRED_FIELD = "VAL_003",
    INVALID_FORMAT = "VAL_004",
    VALUE_OUT_OF_RANGE = "VAL_005",
    FILE_NOT_FOUND = "FS_001",
    FILE_ACCESS_DENIED = "FS_002",
    FILE_ALREADY_EXISTS = "FS_003",
    DIRECTORY_NOT_FOUND = "FS_004",
    INVALID_PATH = "FS_005",
    DISK_FULL = "FS_006",
    PROJECT_NOT_FOUND = "PROJ_001",
    PROJECT_ALREADY_EXISTS = "PROJ_002",
    INVALID_PROJECT_STRUCTURE = "PROJ_003",
    UNSUPPORTED_FRAMEWORK = "PROJ_004",
    DEPENDENCY_CONFLICT = "PROJ_005",
    BUILD_FAILED = "PROJ_006",
    TEMPLATE_NOT_FOUND = "TMPL_001",
    TEMPLATE_INVALID = "TMPL_002",
    TEMPLATE_VERSION_MISMATCH = "TMPL_003",
    TEMPLATE_RENDER_FAILED = "TMPL_004",
    GENERATION_FAILED = "GEN_001",
    INVALID_TEMPLATE_VARIABLES = "GEN_002",
    OUTPUT_PATH_INVALID = "GEN_003",
    CODE_QUALITY_CHECK_FAILED = "GEN_004",
    CONFIG_INVALID = "CFG_001",
    CONFIG_MISSING = "CFG_002",
    CONFIG_MIGRATION_FAILED = "CFG_003",
    NETWORK_ERROR = "NET_001",
    CONNECTION_TIMEOUT = "NET_002",
    DNS_RESOLUTION_FAILED = "NET_003",
    SYSTEM_ERROR = "SYS_001",
    MEMORY_LIMIT_EXCEEDED = "SYS_002",
    PROCESS_TERMINATED = "SYS_003",
    UNKNOWN_ERROR = "UNK_001",
    OPERATION_CANCELLED = "UNK_002",
    FEATURE_NOT_IMPLEMENTED = "UNK_003"
}
export interface ErrorContext {
    operation?: string;
    resource?: string;
    details?: Record<string, any>;
    stack?: string;
    timestamp?: Date;
    userId?: string;
    sessionId?: string;
    httpStatus?: number;
    path?: string;
    attempts?: number;
    validationErrors?: any[];
    context?: string;
    language?: string;
    promise?: string;
}
export declare class RecoderError extends Error {
    readonly code: ErrorCode;
    readonly context: ErrorContext;
    readonly recoverable: boolean;
    readonly userMessage: string;
    readonly originalError?: Error;
    constructor(code: ErrorCode, message: string, context?: ErrorContext, recoverable?: boolean, userMessage?: string, originalError?: Error);
    private getDefaultUserMessage;
    toJSON(): object;
    toString(): string;
}
/**
 * Specialized error classes
 */
export declare class AuthenticationError extends RecoderError {
    constructor(message: string, context?: ErrorContext, originalError?: Error);
}
export declare class ValidationError extends RecoderError {
    constructor(message: string, context?: ErrorContext, originalError?: Error);
}
export declare class FileSystemError extends RecoderError {
    constructor(code: ErrorCode, message: string, context?: ErrorContext, originalError?: Error);
}
export declare class ProjectError extends RecoderError {
    constructor(code: ErrorCode, message: string, context?: ErrorContext, originalError?: Error);
}
export declare class APIError extends RecoderError {
    constructor(code: ErrorCode, message: string, context?: ErrorContext, originalError?: Error);
}
export declare class TemplateError extends RecoderError {
    constructor(code: ErrorCode, message: string, context?: ErrorContext, originalError?: Error);
}
export declare class GenerationError extends RecoderError {
    constructor(code: ErrorCode, message: string, context?: ErrorContext, originalError?: Error);
}
/**
 * Error handling utilities
 */
export declare class ErrorHandler {
    private static listeners;
    /**
     * Handle an error with proper logging and user feedback
     */
    static handle(error: Error | RecoderError, context?: ErrorContext): RecoderError;
    /**
     * Create error from HTTP response
     */
    static fromHTTPResponse(response: any, context?: ErrorContext): RecoderError;
    /**
     * Create error from file system operation
     */
    static fromFileSystemError(error: any, operation: string, path: string): FileSystemError;
    /**
     * Add error listener
     */
    static addListener(listener: (error: RecoderError) => void): void;
    /**
     * Remove error listener
     */
    static removeListener(listener: (error: RecoderError) => void): void;
    /**
     * Clear all error listeners
     */
    static clearListeners(): void;
    /**
     * Check if error is recoverable
     */
    static isRecoverable(error: Error | RecoderError): boolean;
    /**
     * Get user-friendly error message
     */
    static getUserMessage(error: Error | RecoderError): string;
    /**
     * Format error for logging
     */
    static formatForLogging(error: Error | RecoderError): string;
    /**
     * Check if error should be reported to telemetry
     */
    static shouldReport(error: Error | RecoderError): boolean;
}
/**
 * Async error handling utilities
 */
export declare class AsyncErrorHandler {
    /**
     * Wrap async function with error handling
     */
    static wrap<T extends any[], R>(fn: (...args: T) => Promise<R>, context?: ErrorContext): (...args: T) => Promise<R>;
    /**
     * Execute with retry logic
     */
    static withRetry<T>(fn: () => Promise<T>, maxRetries?: number, delay?: number, backoff?: number): Promise<T>;
    /**
     * Execute with timeout
     */
    static withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, timeoutMessage?: string): Promise<T>;
}
/**
 * Validation error helpers
 */
export declare class ValidationErrorBuilder {
    private errors;
    add(field: string, message: string, code?: string): this;
    addIf(condition: boolean, field: string, message: string, code?: string): this;
    hasErrors(): boolean;
    getErrors(): Array<{
        field: string;
        message: string;
        code?: string;
    }>;
    throw(): never;
    throwIf(): void;
}
/**
 * Global error handler setup
 */
export declare function setupGlobalErrorHandling(): void;
//# sourceMappingURL=errors.d.ts.map