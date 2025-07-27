"use strict";
/**
 * Error types and handling utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ValidationErrorBuilder = exports.AsyncErrorHandler = exports.ErrorHandler = exports.GenerationError = exports.TemplateError = exports.APIError = exports.ProjectError = exports.FileSystemError = exports.ValidationError = exports.AuthenticationError = exports.RecoderError = exports.ErrorCode = void 0;
exports.setupGlobalErrorHandling = setupGlobalErrorHandling;
var ErrorCode;
(function (ErrorCode) {
    // Authentication errors
    ErrorCode["AUTHENTICATION_REQUIRED"] = "AUTH_001";
    ErrorCode["INVALID_TOKEN"] = "AUTH_002";
    ErrorCode["TOKEN_EXPIRED"] = "AUTH_003";
    ErrorCode["INSUFFICIENT_PERMISSIONS"] = "AUTH_004";
    ErrorCode["INVALID_CREDENTIALS"] = "AUTH_005";
    // API errors
    ErrorCode["API_CONNECTION_FAILED"] = "API_001";
    ErrorCode["API_TIMEOUT"] = "API_002";
    ErrorCode["API_RATE_LIMIT"] = "API_003";
    ErrorCode["API_SERVER_ERROR"] = "API_004";
    ErrorCode["API_INVALID_RESPONSE"] = "API_005";
    // Validation errors
    ErrorCode["VALIDATION_FAILED"] = "VAL_001";
    ErrorCode["INVALID_INPUT"] = "VAL_002";
    ErrorCode["MISSING_REQUIRED_FIELD"] = "VAL_003";
    ErrorCode["INVALID_FORMAT"] = "VAL_004";
    ErrorCode["VALUE_OUT_OF_RANGE"] = "VAL_005";
    // File system errors
    ErrorCode["FILE_NOT_FOUND"] = "FS_001";
    ErrorCode["FILE_ACCESS_DENIED"] = "FS_002";
    ErrorCode["FILE_ALREADY_EXISTS"] = "FS_003";
    ErrorCode["DIRECTORY_NOT_FOUND"] = "FS_004";
    ErrorCode["INVALID_PATH"] = "FS_005";
    ErrorCode["DISK_FULL"] = "FS_006";
    // Project errors
    ErrorCode["PROJECT_NOT_FOUND"] = "PROJ_001";
    ErrorCode["PROJECT_ALREADY_EXISTS"] = "PROJ_002";
    ErrorCode["INVALID_PROJECT_STRUCTURE"] = "PROJ_003";
    ErrorCode["UNSUPPORTED_FRAMEWORK"] = "PROJ_004";
    ErrorCode["DEPENDENCY_CONFLICT"] = "PROJ_005";
    ErrorCode["BUILD_FAILED"] = "PROJ_006";
    // Template errors
    ErrorCode["TEMPLATE_NOT_FOUND"] = "TMPL_001";
    ErrorCode["TEMPLATE_INVALID"] = "TMPL_002";
    ErrorCode["TEMPLATE_VERSION_MISMATCH"] = "TMPL_003";
    ErrorCode["TEMPLATE_RENDER_FAILED"] = "TMPL_004";
    // Generation errors
    ErrorCode["GENERATION_FAILED"] = "GEN_001";
    ErrorCode["INVALID_TEMPLATE_VARIABLES"] = "GEN_002";
    ErrorCode["OUTPUT_PATH_INVALID"] = "GEN_003";
    ErrorCode["CODE_QUALITY_CHECK_FAILED"] = "GEN_004";
    // Configuration errors
    ErrorCode["CONFIG_INVALID"] = "CFG_001";
    ErrorCode["CONFIG_MISSING"] = "CFG_002";
    ErrorCode["CONFIG_MIGRATION_FAILED"] = "CFG_003";
    // Network errors
    ErrorCode["NETWORK_ERROR"] = "NET_001";
    ErrorCode["CONNECTION_TIMEOUT"] = "NET_002";
    ErrorCode["DNS_RESOLUTION_FAILED"] = "NET_003";
    // System errors
    ErrorCode["SYSTEM_ERROR"] = "SYS_001";
    ErrorCode["MEMORY_LIMIT_EXCEEDED"] = "SYS_002";
    ErrorCode["PROCESS_TERMINATED"] = "SYS_003";
    // Unknown/generic errors
    ErrorCode["UNKNOWN_ERROR"] = "UNK_001";
    ErrorCode["OPERATION_CANCELLED"] = "UNK_002";
    ErrorCode["FEATURE_NOT_IMPLEMENTED"] = "UNK_003";
})(ErrorCode || (exports.ErrorCode = ErrorCode = {}));
class RecoderError extends Error {
    constructor(code, message, context = {}, recoverable = false, userMessage, originalError) {
        super(message);
        this.name = 'RecoderError';
        this.code = code;
        this.context = {
            ...context,
            timestamp: new Date(),
        };
        this.recoverable = recoverable;
        this.userMessage = userMessage || this.getDefaultUserMessage(code);
        this.originalError = originalError;
        // Maintain proper stack trace
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, RecoderError);
        }
    }
    getDefaultUserMessage(code) {
        const messages = {
            [ErrorCode.AUTHENTICATION_REQUIRED]: 'Please log in to continue',
            [ErrorCode.INVALID_TOKEN]: 'Your session has expired. Please log in again',
            [ErrorCode.TOKEN_EXPIRED]: 'Your session has expired. Please log in again',
            [ErrorCode.INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action',
            [ErrorCode.INVALID_CREDENTIALS]: 'Invalid username or password',
            [ErrorCode.API_CONNECTION_FAILED]: 'Unable to connect to the service. Please check your internet connection',
            [ErrorCode.API_TIMEOUT]: 'The request took too long to complete. Please try again',
            [ErrorCode.API_RATE_LIMIT]: 'Too many requests. Please wait a moment and try again',
            [ErrorCode.API_SERVER_ERROR]: 'Service temporarily unavailable. Please try again later',
            [ErrorCode.API_INVALID_RESPONSE]: 'Received invalid response from server',
            [ErrorCode.VALIDATION_FAILED]: 'Please check your input and try again',
            [ErrorCode.INVALID_INPUT]: 'The provided input is invalid',
            [ErrorCode.MISSING_REQUIRED_FIELD]: 'Please fill in all required fields',
            [ErrorCode.INVALID_FORMAT]: 'The format of the input is incorrect',
            [ErrorCode.VALUE_OUT_OF_RANGE]: 'The value is outside the allowed range',
            [ErrorCode.FILE_NOT_FOUND]: 'The requested file could not be found',
            [ErrorCode.FILE_ACCESS_DENIED]: 'Access to the file was denied',
            [ErrorCode.FILE_ALREADY_EXISTS]: 'A file with this name already exists',
            [ErrorCode.DIRECTORY_NOT_FOUND]: 'The specified directory does not exist',
            [ErrorCode.INVALID_PATH]: 'The file path is invalid',
            [ErrorCode.DISK_FULL]: 'Not enough disk space available',
            [ErrorCode.PROJECT_NOT_FOUND]: 'The project could not be found',
            [ErrorCode.PROJECT_ALREADY_EXISTS]: 'A project with this name already exists',
            [ErrorCode.INVALID_PROJECT_STRUCTURE]: 'The project structure is invalid',
            [ErrorCode.UNSUPPORTED_FRAMEWORK]: 'This framework is not supported',
            [ErrorCode.DEPENDENCY_CONFLICT]: 'There are conflicting dependencies',
            [ErrorCode.BUILD_FAILED]: 'The build process failed',
            [ErrorCode.TEMPLATE_NOT_FOUND]: 'The requested template could not be found',
            [ErrorCode.TEMPLATE_INVALID]: 'The template is invalid or corrupted',
            [ErrorCode.TEMPLATE_VERSION_MISMATCH]: 'The template version is incompatible',
            [ErrorCode.TEMPLATE_RENDER_FAILED]: 'Failed to render the template',
            [ErrorCode.GENERATION_FAILED]: 'Code generation failed',
            [ErrorCode.INVALID_TEMPLATE_VARIABLES]: 'Invalid template variables provided',
            [ErrorCode.OUTPUT_PATH_INVALID]: 'The output path is invalid',
            [ErrorCode.CODE_QUALITY_CHECK_FAILED]: 'Generated code failed quality checks',
            [ErrorCode.CONFIG_INVALID]: 'Configuration is invalid',
            [ErrorCode.CONFIG_MISSING]: 'Configuration file is missing',
            [ErrorCode.CONFIG_MIGRATION_FAILED]: 'Configuration migration failed',
            [ErrorCode.NETWORK_ERROR]: 'Network error occurred',
            [ErrorCode.CONNECTION_TIMEOUT]: 'Connection timed out',
            [ErrorCode.DNS_RESOLUTION_FAILED]: 'Unable to resolve the server address',
            [ErrorCode.SYSTEM_ERROR]: 'A system error occurred',
            [ErrorCode.MEMORY_LIMIT_EXCEEDED]: 'Memory limit exceeded',
            [ErrorCode.PROCESS_TERMINATED]: 'The process was terminated',
            [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred',
            [ErrorCode.OPERATION_CANCELLED]: 'The operation was cancelled',
            [ErrorCode.FEATURE_NOT_IMPLEMENTED]: 'This feature is not yet implemented',
        };
        return messages[code] || 'An error occurred';
    }
    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            context: this.context,
            recoverable: this.recoverable,
            userMessage: this.userMessage,
            stack: this.stack,
            originalError: this.originalError ? {
                name: this.originalError.name,
                message: this.originalError.message,
                stack: this.originalError.stack,
            } : undefined,
        };
    }
    toString() {
        return `${this.name} [${this.code}]: ${this.message}`;
    }
}
exports.RecoderError = RecoderError;
/**
 * Specialized error classes
 */
class AuthenticationError extends RecoderError {
    constructor(message, context = {}, originalError) {
        super(ErrorCode.AUTHENTICATION_REQUIRED, message, context, false, undefined, originalError);
        this.name = 'AuthenticationError';
    }
}
exports.AuthenticationError = AuthenticationError;
class ValidationError extends RecoderError {
    constructor(message, context = {}, originalError) {
        super(ErrorCode.VALIDATION_FAILED, message, context, true, undefined, originalError);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class FileSystemError extends RecoderError {
    constructor(code, message, context = {}, originalError) {
        super(code, message, context, true, undefined, originalError);
        this.name = 'FileSystemError';
    }
}
exports.FileSystemError = FileSystemError;
class ProjectError extends RecoderError {
    constructor(code, message, context = {}, originalError) {
        super(code, message, context, true, undefined, originalError);
        this.name = 'ProjectError';
    }
}
exports.ProjectError = ProjectError;
class APIError extends RecoderError {
    constructor(code, message, context = {}, originalError) {
        super(code, message, context, true, undefined, originalError);
        this.name = 'APIError';
    }
}
exports.APIError = APIError;
class TemplateError extends RecoderError {
    constructor(code, message, context = {}, originalError) {
        super(code, message, context, true, undefined, originalError);
        this.name = 'TemplateError';
    }
}
exports.TemplateError = TemplateError;
class GenerationError extends RecoderError {
    constructor(code, message, context = {}, originalError) {
        super(code, message, context, false, undefined, originalError);
        this.name = 'GenerationError';
    }
}
exports.GenerationError = GenerationError;
/**
 * Error handling utilities
 */
class ErrorHandler {
    /**
     * Handle an error with proper logging and user feedback
     */
    static handle(error, context = {}) {
        let recoderError;
        if (error instanceof RecoderError) {
            recoderError = error;
        }
        else {
            recoderError = new RecoderError(ErrorCode.UNKNOWN_ERROR, error.message, { ...context, stack: error.stack }, false, undefined, error);
        }
        // Notify listeners
        this.listeners.forEach(listener => {
            try {
                listener(recoderError);
            }
            catch (listenerError) {
                console.error('Error in error handler listener:', listenerError);
            }
        });
        return recoderError;
    }
    /**
     * Create error from HTTP response
     */
    static fromHTTPResponse(response, context = {}) {
        const status = response.status || response.statusCode || 500;
        const message = response.data?.message || response.message || 'HTTP request failed';
        let code;
        let recoverable = true;
        switch (status) {
            case 400:
                code = ErrorCode.INVALID_INPUT;
                break;
            case 401:
                code = ErrorCode.INVALID_TOKEN;
                recoverable = false;
                break;
            case 403:
                code = ErrorCode.INSUFFICIENT_PERMISSIONS;
                recoverable = false;
                break;
            case 404:
                code = ErrorCode.FILE_NOT_FOUND;
                break;
            case 408:
                code = ErrorCode.API_TIMEOUT;
                break;
            case 409:
                code = ErrorCode.FILE_ALREADY_EXISTS;
                break;
            case 429:
                code = ErrorCode.API_RATE_LIMIT;
                break;
            case 500:
            case 502:
            case 503:
            case 504:
                code = ErrorCode.API_SERVER_ERROR;
                break;
            default:
                code = ErrorCode.API_CONNECTION_FAILED;
        }
        return new APIError(code, message, { ...context, details: { ...context.details, httpStatus: status } });
    }
    /**
     * Create error from file system operation
     */
    static fromFileSystemError(error, operation, path) {
        let code;
        const message = error.message || 'File system operation failed';
        switch (error.code) {
            case 'ENOENT':
                code = ErrorCode.FILE_NOT_FOUND;
                break;
            case 'EACCES':
            case 'EPERM':
                code = ErrorCode.FILE_ACCESS_DENIED;
                break;
            case 'EEXIST':
                code = ErrorCode.FILE_ALREADY_EXISTS;
                break;
            case 'ENOTDIR':
                code = ErrorCode.DIRECTORY_NOT_FOUND;
                break;
            case 'EINVAL':
                code = ErrorCode.INVALID_PATH;
                break;
            case 'ENOSPC':
                code = ErrorCode.DISK_FULL;
                break;
            default:
                code = ErrorCode.SYSTEM_ERROR;
        }
        return new FileSystemError(code, message, { operation, details: { path } }, error);
    }
    /**
     * Add error listener
     */
    static addListener(listener) {
        this.listeners.push(listener);
    }
    /**
     * Remove error listener
     */
    static removeListener(listener) {
        const index = this.listeners.indexOf(listener);
        if (index > -1) {
            this.listeners.splice(index, 1);
        }
    }
    /**
     * Clear all error listeners
     */
    static clearListeners() {
        this.listeners = [];
    }
    /**
     * Check if error is recoverable
     */
    static isRecoverable(error) {
        if (error instanceof RecoderError) {
            return error.recoverable;
        }
        return true; // Assume recoverable for unknown errors
    }
    /**
     * Get user-friendly error message
     */
    static getUserMessage(error) {
        if (error instanceof RecoderError) {
            return error.userMessage;
        }
        return 'An unexpected error occurred. Please try again.';
    }
    /**
     * Format error for logging
     */
    static formatForLogging(error) {
        if (error instanceof RecoderError) {
            return JSON.stringify(error.toJSON(), null, 2);
        }
        return `${error.name}: ${error.message}\n${error.stack}`;
    }
    /**
     * Check if error should be reported to telemetry
     */
    static shouldReport(error) {
        if (error instanceof RecoderError) {
            // Don't report user errors or authentication errors
            return ![
                ErrorCode.AUTHENTICATION_REQUIRED,
                ErrorCode.INVALID_CREDENTIALS,
                ErrorCode.VALIDATION_FAILED,
                ErrorCode.INVALID_INPUT,
                ErrorCode.MISSING_REQUIRED_FIELD,
                ErrorCode.OPERATION_CANCELLED,
            ].includes(error.code);
        }
        return true; // Report unknown errors
    }
}
exports.ErrorHandler = ErrorHandler;
ErrorHandler.listeners = [];
/**
 * Async error handling utilities
 */
class AsyncErrorHandler {
    /**
     * Wrap async function with error handling
     */
    static wrap(fn, context = {}) {
        return async (...args) => {
            try {
                return await fn(...args);
            }
            catch (error) {
                throw ErrorHandler.handle(error, context);
            }
        };
    }
    /**
     * Execute with retry logic
     */
    static async withRetry(fn, maxRetries = 3, delay = 1000, backoff = 2) {
        let lastError;
        let currentDelay = delay;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error;
                // Don't retry non-recoverable errors
                if (!ErrorHandler.isRecoverable(lastError)) {
                    throw ErrorHandler.handle(lastError);
                }
                // Don't retry on last attempt
                if (attempt === maxRetries) {
                    break;
                }
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, currentDelay));
                currentDelay *= backoff;
            }
        }
        throw ErrorHandler.handle(lastError, { details: { attempts: maxRetries + 1 } });
    }
    /**
     * Execute with timeout
     */
    static async withTimeout(fn, timeoutMs, timeoutMessage = 'Operation timed out') {
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new RecoderError(ErrorCode.API_TIMEOUT, timeoutMessage));
            }, timeoutMs);
            fn()
                .then(result => {
                clearTimeout(timeoutId);
                resolve(result);
            })
                .catch(error => {
                clearTimeout(timeoutId);
                reject(ErrorHandler.handle(error));
            });
        });
    }
}
exports.AsyncErrorHandler = AsyncErrorHandler;
/**
 * Validation error helpers
 */
class ValidationErrorBuilder {
    constructor() {
        this.errors = [];
    }
    add(field, message, code) {
        this.errors.push({ field, message, code });
        return this;
    }
    addIf(condition, field, message, code) {
        if (condition) {
            this.add(field, message, code);
        }
        return this;
    }
    hasErrors() {
        return this.errors.length > 0;
    }
    getErrors() {
        return [...this.errors];
    }
    throw() {
        if (this.hasErrors()) {
            const message = this.errors.map(e => `${e.field}: ${e.message}`).join(', ');
            throw new ValidationError(message, { details: { validationErrors: this.errors } });
        }
        throw new Error('No validation errors to throw');
    }
    throwIf() {
        if (this.hasErrors()) {
            this.throw();
        }
    }
}
exports.ValidationErrorBuilder = ValidationErrorBuilder;
/**
 * Global error handler setup
 */
function setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    if (typeof process !== 'undefined' && process.on) {
        process.on('unhandledRejection', (reason, promise) => {
            console.error('Unhandled Promise Rejection:', reason);
            const error = reason instanceof Error ? reason : new Error(String(reason));
            const recoderError = ErrorHandler.handle(error, {
                details: { context: 'unhandledRejection' },
                promise: promise.toString()
            });
            // Could report to telemetry here
            console.error('Handled as:', recoderError.toString());
        });
        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('Uncaught Exception:', error);
            const recoderError = ErrorHandler.handle(error, {
                details: { context: 'uncaughtException' }
            });
            // Could report to telemetry here
            console.error('Handled as:', recoderError.toString());
            // Exit process in case of uncaught exception
            process.exit(1);
        });
    }
}
//# sourceMappingURL=errors.js.map