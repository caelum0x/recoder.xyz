"use strict";
/**
 * Central Error Handler for Docker Backend
 * Provides Express middleware and utilities for structured error handling
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.WS_CLOSE_CODES = exports.globalErrorHandler = void 0;
exports.generateRequestId = generateRequestId;
exports.logError = logError;
exports.logWarning = logWarning;
exports.requestIdMiddleware = requestIdMiddleware;
exports.requestTimingMiddleware = requestTimingMiddleware;
exports.asyncHandler = asyncHandler;
exports.sendError = sendError;
exports.sendSuccess = sendSuccess;
exports.createWsError = createWsError;
exports.sendWsError = sendWsError;
exports.closeWsWithError = closeWsWithError;
exports.withRetry = withRetry;
const types_js_1 = require("./types.js");
const logger_js_1 = require("../logger.js");
const cors_utils_js_1 = require("../cors-utils.js");
const logger = (0, logger_js_1.createLogger)('error-handler');
// Request ID counter for tracing
let requestIdCounter = 0;
/**
 * Generate unique request ID for tracing
 */
function generateRequestId() {
    const timestamp = Date.now().toString(36);
    const counter = (requestIdCounter++).toString(36);
    return `req-${timestamp}-${counter}`;
}
/**
 * Log an error with structured format
 */
function logError(entry) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'error',
        statusCode: types_js_1.ErrorStatusMap[entry.errorCode] || 500,
        ...entry,
    };
    logger.error(logEntry);
}
/**
 * Log a warning with structured format
 */
function logWarning(errorCode, message, details) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        level: 'warn',
        errorCode,
        message,
        statusCode: types_js_1.ErrorStatusMap[errorCode] || 500,
        details,
    };
    logger.warn(logEntry);
}
/**
 * Express middleware to add request ID to requests
 */
function requestIdMiddleware(req, res, next) {
    const requestId = generateRequestId();
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
}
/**
 * Express middleware to track request timing
 */
function requestTimingMiddleware(req, res, next) {
    const startTime = Date.now();
    req.startTime = startTime;
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (duration > 5000) {
            logger.warn({
                type: 'SLOW_REQUEST',
                requestId: req.requestId,
                method: req.method,
                path: req.path,
                duration,
                statusCode: res.statusCode,
            }, 'Slow request detected');
        }
    });
    next();
}
/**
 * Global error handling middleware for Express
 * Must be added after all routes
 */
const globalErrorHandler = (err, req, res, _next) => {
    const requestId = req.requestId;
    const startTime = req.startTime;
    const duration = startTime ? Date.now() - startTime : undefined;
    // Convert to AppError if needed
    const appError = err instanceof types_js_1.AppError ? err : types_js_1.AppError.fromError(err);
    // Log the error
    logError({
        requestId,
        errorCode: appError.code,
        message: appError.message,
        statusCode: appError.statusCode,
        details: appError.details,
        stack: process.env.NODE_ENV !== 'production' ? appError.stack : undefined,
        userId: req.userId,
        projectId: req.params?.projectId || req.body?.projectId,
        path: req.path,
        method: req.method,
        duration,
    });
    // Ensure CORS headers are present on error responses so browsers can read
    // the error body.  The happy-path CORS middleware may have already set them,
    // but errors thrown before that middleware (e.g. from the cors() callback
    // itself) will not have them.  Setting them here is a no-op when they're
    // already present (setHeader overwrites) and a fix when they're missing.
    const corsHeaders = (0, cors_utils_js_1.getCorsHeadersForOrigin)(req.headers.origin);
    for (const [key, value] of Object.entries(corsHeaders)) {
        res.setHeader(key, value);
    }
    // Send error response
    const response = appError.toResponse(requestId);
    // Don't expose stack traces in production
    if (process.env.NODE_ENV === 'production') {
        delete response.error.stack;
    }
    res.status(appError.statusCode).json(response);
};
exports.globalErrorHandler = globalErrorHandler;
/**
 * Async handler wrapper to catch errors in async route handlers
 * Usage: app.get('/route', asyncHandler(async (req, res) => { ... }))
 */
function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
/**
 * Send standardized error response
 */
function sendError(res, error, options) {
    const appError = error instanceof types_js_1.AppError
        ? error
        : new types_js_1.AppError(error, options?.message, { details: options?.details });
    const response = appError.toResponse(options?.requestId);
    res.status(appError.statusCode).json(response);
}
function sendSuccess(res, data, options) {
    const response = {
        success: true,
        data,
        message: options?.message,
    };
    res.status(options?.statusCode || 200).json(response);
}
function createWsError(error, options) {
    const appError = error instanceof types_js_1.AppError
        ? error
        : new types_js_1.AppError(error, options?.message, { details: options?.details });
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
function sendWsError(ws, error, options) {
    // Check if WebSocket is open (readyState 1 = OPEN)
    if (ws.readyState !== undefined && ws.readyState !== 1) {
        return;
    }
    try {
        const errorMessage = createWsError(error, options);
        ws.send(JSON.stringify(errorMessage));
    }
    catch (e) {
        logger.error({ err: e }, 'Failed to send WS error');
    }
}
/**
 * Safe WebSocket close with error code mapping
 */
exports.WS_CLOSE_CODES = {
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
};
function closeWsWithError(ws, appError) {
    let closeCode = exports.WS_CLOSE_CODES.INTERNAL_ERROR;
    // Map AppError codes to WebSocket close codes
    switch (appError.code) {
        case types_js_1.ErrorCode.AUTH_REQUIRED:
        case types_js_1.ErrorCode.AUTH_INVALID_TOKEN:
        case types_js_1.ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED:
            closeCode = exports.WS_CLOSE_CODES.POLICY_VIOLATION;
            break;
        case types_js_1.ErrorCode.CONTAINER_NOT_FOUND:
        case types_js_1.ErrorCode.TERMINAL_NOT_FOUND:
            closeCode = exports.WS_CLOSE_CODES.POLICY_VIOLATION;
            break;
        case types_js_1.ErrorCode.RATE_LIMITED:
        case types_js_1.ErrorCode.RESOURCE_EXHAUSTED:
            closeCode = exports.WS_CLOSE_CODES.TRY_AGAIN_LATER;
            break;
        case types_js_1.ErrorCode.WS_MESSAGE_PARSE_ERROR:
            closeCode = exports.WS_CLOSE_CODES.INVALID_PAYLOAD;
            break;
        default:
            closeCode = exports.WS_CLOSE_CODES.INTERNAL_ERROR;
    }
    ws.close(closeCode, appError.message.substring(0, 123)); // Max 123 bytes for close reason
}
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
};
/**
 * Retry an async operation with exponential backoff
 */
async function withRetry(operation, config = {}) {
    const { maxRetries, initialDelay, maxDelay, backoffMultiplier } = {
        ...DEFAULT_RETRY_CONFIG,
        ...config,
    };
    let lastError;
    let delay = initialDelay;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check if error is retryable
            const appError = types_js_1.AppError.fromError(error);
            if (!appError.canRetry || attempt === maxRetries) {
                throw appError;
            }
            logger.info({ attempt: attempt + 1, maxRetries: maxRetries + 1, delay }, 'Retrying...');
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay = Math.min(delay * backoffMultiplier, maxDelay);
        }
    }
    throw lastError || new types_js_1.AppError(types_js_1.ErrorCode.INTERNAL_ERROR, 'Retry failed');
}
/**
 * Circuit breaker for protecting against cascading failures
 */
class CircuitBreaker {
    threshold;
    resetTimeout;
    failures = 0;
    lastFailure = 0;
    state = 'closed';
    constructor(threshold = 5, resetTimeout = 30000) {
        this.threshold = threshold;
        this.resetTimeout = resetTimeout;
    }
    async execute(operation) {
        if (this.state === 'open') {
            if (Date.now() - this.lastFailure > this.resetTimeout) {
                this.state = 'half-open';
            }
            else {
                throw new types_js_1.AppError(types_js_1.ErrorCode.SERVICE_UNAVAILABLE, 'Circuit breaker is open', {
                    canRetry: true,
                    retryAfter: Math.ceil((this.resetTimeout - (Date.now() - this.lastFailure)) / 1000),
                });
            }
        }
        try {
            const result = await operation();
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure();
            throw error;
        }
    }
    onSuccess() {
        this.failures = 0;
        this.state = 'closed';
    }
    onFailure() {
        this.failures++;
        this.lastFailure = Date.now();
        if (this.failures >= this.threshold) {
            this.state = 'open';
            logger.warn({ type: 'CIRCUIT_BREAKER_OPEN', failures: this.failures }, 'Circuit breaker opened');
        }
    }
    getState() {
        return this.state;
    }
}
exports.CircuitBreaker = CircuitBreaker;
// Export default handlers
exports.default = {
    globalErrorHandler: exports.globalErrorHandler,
    asyncHandler,
    sendError,
    sendSuccess,
    sendWsError,
    closeWsWithError,
    withRetry,
    requestIdMiddleware,
    requestTimingMiddleware,
};
