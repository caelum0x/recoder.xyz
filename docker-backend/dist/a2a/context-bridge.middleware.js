"use strict";
/**
 * @module context-bridge.middleware
 *
 * Express middleware for validating Context Bridge API requests.
 *
 * These middleware functions validate request bodies and parameters
 * before they reach the route handlers, ensuring:
 *
 * 1. Context type is valid.
 * 2. Required fields are present for create/append/transfer operations.
 * 3. Task ID parameters are non-empty.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseContextJsonBody = parseContextJsonBody;
exports.validateTaskIdParam = validateTaskIdParam;
exports.validateContextTypeParam = validateContextTypeParam;
exports.validateCreateContextBody = validateCreateContextBody;
exports.validateTransferContextBody = validateTransferContextBody;
const context_bridge_service_1 = require("./context-bridge.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-context-middleware');
// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function sendError(res, httpStatus, message, details) {
    res.status(httpStatus).json({
        success: false,
        error: { message, ...(details ? { details } : {}) },
    });
}
// ---------------------------------------------------------------------------
// Parse JSON from text body (A2A routes use express.text())
// ---------------------------------------------------------------------------
/**
 * Middleware to parse JSON from a string body.
 * The parent A2A mount uses `express.text()` so the body arrives as a string.
 * This parses it back into an object. If the body is already an object
 * (e.g. from `express.json()`), it's a no-op.
 */
function parseContextJsonBody(req, res, next) {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            sendError(res, 400, 'Invalid JSON in request body');
            return;
        }
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate taskId param
// ---------------------------------------------------------------------------
/**
 * Validates that the `:taskId` route parameter is present and non-empty.
 */
function validateTaskIdParam(req, res, next) {
    const { taskId } = req.params;
    if (!taskId || taskId === 'undefined' || taskId === 'null') {
        sendError(res, 400, 'taskId parameter is required');
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate context type param
// ---------------------------------------------------------------------------
const VALID_CONTEXT_TYPES = new Set(context_bridge_service_1.CONTEXT_TYPES);
/**
 * Validates that the `:type` route parameter is a valid context type.
 */
function validateContextTypeParam(req, res, next) {
    const { type } = req.params;
    if (!type || !VALID_CONTEXT_TYPES.has(type)) {
        sendError(res, 400, `Invalid context type '${type}'. Must be one of: ${context_bridge_service_1.CONTEXT_TYPES.join(', ')}`, {
            valid_types: [...context_bridge_service_1.CONTEXT_TYPES],
        });
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate create/append context body
// ---------------------------------------------------------------------------
/**
 * Validates the request body for creating or appending context.
 *
 * Required fields:
 * - type (string, one of CONTEXT_TYPES)
 * - data (non-null, non-undefined)
 */
function validateCreateContextBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendError(res, 400, 'Request body must be a JSON object');
        return;
    }
    const issues = [];
    if (!body.type || typeof body.type !== 'string') {
        issues.push('type must be a non-empty string');
    }
    else if (!VALID_CONTEXT_TYPES.has(body.type)) {
        issues.push(`type must be one of: ${context_bridge_service_1.CONTEXT_TYPES.join(', ')}`);
    }
    if (body.data === undefined || body.data === null) {
        issues.push('data is required and must not be null');
    }
    if (issues.length > 0) {
        sendError(res, 400, `Request validation failed: ${issues.join('; ')}`, {
            validation_issues: issues,
        });
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate transfer context body
// ---------------------------------------------------------------------------
/**
 * Validates the request body for transferring context between tasks.
 *
 * Required fields:
 * - fromTaskId (string)
 * - toTaskId (string)
 */
function validateTransferContextBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendError(res, 400, 'Request body must be a JSON object');
        return;
    }
    const issues = [];
    if (!body.fromTaskId || typeof body.fromTaskId !== 'string') {
        issues.push('fromTaskId must be a non-empty string');
    }
    if (!body.toTaskId || typeof body.toTaskId !== 'string') {
        issues.push('toTaskId must be a non-empty string');
    }
    if (body.fromTaskId && body.toTaskId && body.fromTaskId === body.toTaskId) {
        issues.push('fromTaskId and toTaskId must be different');
    }
    if (issues.length > 0) {
        sendError(res, 400, `Request validation failed: ${issues.join('; ')}`, {
            validation_issues: issues,
        });
        return;
    }
    next();
}
