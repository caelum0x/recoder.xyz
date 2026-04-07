"use strict";
/**
 * @module request-validation.middleware
 *
 * Reusable Express middleware for validating common A2A request shapes:
 * route parameters, body fields, pagination, and domain-specific payloads
 * (adapter configs, execute bodies, capability matching, aggregation).
 *
 * Every middleware follows the same convention as the other A2A middlewares:
 *   - Collect all issues into a `string[]`
 *   - On failure, respond with 400 + `buildA2AError({ code: InvalidEnvelope })`
 *   - On success, call `next()`
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateIdParam = validateIdParam;
exports.validateRequiredFields = validateRequiredFields;
exports.validateOptionalFields = validateOptionalFields;
exports.validatePaginationParams = validatePaginationParams;
exports.validateRestAdapterConfig = validateRestAdapterConfig;
exports.validateGitAdapterConfig = validateGitAdapterConfig;
exports.validateExecuteBody = validateExecuteBody;
exports.validateCapabilityMatchBody = validateCapabilityMatchBody;
exports.validateAggregationBody = validateAggregationBody;
const a2a_1 = require("@recoder/shared/a2a");
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Valid ID format: alphanumeric + underscore + dot + hyphen, 1-128 chars. */
const ID_REGEX = /^[a-zA-Z0-9_.-]+$/;
const ID_MAX_LENGTH = 128;
const VALID_AGGREGATION_STRATEGIES = new Set([
    'all',
    'first-wins',
    'majority',
    'weighted',
]);
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function sendValidationError(res, issues) {
    res.status(400).json({
        success: false,
        error: (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }),
    });
}
/**
 * Checks whether `value` matches the expected type string.
 * Handles the special 'array' and 'object' cases that `typeof` alone cannot.
 */
function matchesType(value, expectedType) {
    switch (expectedType) {
        case 'array':
            return Array.isArray(value);
        case 'object':
            return typeof value === 'object' && value !== null && !Array.isArray(value);
        case 'string':
        case 'number':
        case 'boolean':
            return typeof value === expectedType;
        default:
            return false;
    }
}
// ---------------------------------------------------------------------------
// validateIdParam
// ---------------------------------------------------------------------------
/**
 * Returns middleware that validates a named route parameter is a valid
 * A2A identifier (non-empty, matches `ID_REGEX`, max 128 chars).
 */
function validateIdParam(paramName) {
    return (req, res, next) => {
        const value = req.params[paramName];
        if (!value || value === 'undefined') {
            sendValidationError(res, [`${paramName} parameter is required`]);
            return;
        }
        if (value.length > ID_MAX_LENGTH) {
            sendValidationError(res, [
                `${paramName} must be at most ${ID_MAX_LENGTH} characters (got ${value.length})`,
            ]);
            return;
        }
        if (!ID_REGEX.test(value)) {
            sendValidationError(res, [
                `${paramName} contains invalid characters (allowed: a-z A-Z 0-9 _ . -)`,
            ]);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateRequiredFields
// ---------------------------------------------------------------------------
/**
 * Returns middleware that validates the request body is an object and that
 * every listed field is present with the expected type.
 */
function validateRequiredFields(fields) {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        for (const field of fields) {
            const value = body[field.name];
            if (value === undefined || value === null) {
                issues.push(`${field.name} is required`);
                continue;
            }
            if (!matchesType(value, field.type)) {
                issues.push(`${field.name} must be of type ${field.type}`);
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateOptionalFields
// ---------------------------------------------------------------------------
/**
 * Returns middleware that validates optional body fields _when present_
 * match the expected type. Fields that are `undefined` are silently skipped.
 */
function validateOptionalFields(fields) {
    return (req, res, next) => {
        const body = req.body ?? {};
        const issues = [];
        for (const field of fields) {
            const value = body[field.name];
            if (value === undefined) {
                continue;
            }
            if (!matchesType(value, field.type)) {
                issues.push(`${field.name} must be of type ${field.type} when provided`);
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validatePaginationParams
// ---------------------------------------------------------------------------
/**
 * Returns middleware that validates optional `limit` and `offset` query
 * parameters. When present they must parse to non-negative integers.
 * `limit` is capped at `maxLimit` (default 1000).
 */
function validatePaginationParams(maxLimit = 1000) {
    return (req, res, next) => {
        const issues = [];
        if (req.query.limit !== undefined) {
            const parsed = Number(req.query.limit);
            if (!Number.isInteger(parsed) || parsed < 1) {
                issues.push('limit must be a positive integer');
            }
            else if (parsed > maxLimit) {
                issues.push(`limit must not exceed ${maxLimit}`);
            }
        }
        if (req.query.offset !== undefined) {
            const parsed = Number(req.query.offset);
            if (!Number.isInteger(parsed) || parsed < 0) {
                issues.push('offset must be a non-negative integer');
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateRestAdapterConfig
// ---------------------------------------------------------------------------
/**
 * Validates the body for REST adapter registration.
 *
 * Required: adapterId (string, non-empty), baseUrl (string, non-empty).
 * Optional: timeoutMs (number, > 0), maxRetries (number, >= 0).
 */
function validateRestAdapterConfig() {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        if (!body.adapterId || typeof body.adapterId !== 'string') {
            issues.push('adapterId must be a non-empty string');
        }
        if (!body.baseUrl || typeof body.baseUrl !== 'string') {
            issues.push('baseUrl must be a non-empty string');
        }
        if (body.timeoutMs !== undefined) {
            if (typeof body.timeoutMs !== 'number' || body.timeoutMs <= 0) {
                issues.push('timeoutMs must be a positive number when provided');
            }
        }
        if (body.maxRetries !== undefined) {
            if (typeof body.maxRetries !== 'number' || body.maxRetries < 0) {
                issues.push('maxRetries must be a non-negative number when provided');
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateGitAdapterConfig
// ---------------------------------------------------------------------------
/**
 * Validates the body for Git adapter registration.
 *
 * Required: adapterId (string, non-empty), repoPath (string, non-empty).
 * Optional: baseBranch (string), branchPrefix (string),
 *           pollIntervalMs (number, > 0).
 */
function validateGitAdapterConfig() {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        if (!body.adapterId || typeof body.adapterId !== 'string') {
            issues.push('adapterId must be a non-empty string');
        }
        if (!body.repoPath || typeof body.repoPath !== 'string') {
            issues.push('repoPath must be a non-empty string');
        }
        if (body.baseBranch !== undefined && typeof body.baseBranch !== 'string') {
            issues.push('baseBranch must be a string when provided');
        }
        if (body.branchPrefix !== undefined && typeof body.branchPrefix !== 'string') {
            issues.push('branchPrefix must be a string when provided');
        }
        if (body.pollIntervalMs !== undefined) {
            if (typeof body.pollIntervalMs !== 'number' || body.pollIntervalMs <= 0) {
                issues.push('pollIntervalMs must be a positive number when provided');
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateExecuteBody
// ---------------------------------------------------------------------------
/**
 * Validates the body for task execution requests.
 *
 * Required: prompt (string, non-empty).
 * Optional: taskId (string), workspace_id (string), thread_id (string).
 */
function validateExecuteBody() {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        if (!body.prompt || typeof body.prompt !== 'string') {
            issues.push('prompt must be a non-empty string');
        }
        if (body.taskId !== undefined && typeof body.taskId !== 'string') {
            issues.push('taskId must be a string when provided');
        }
        if (body.workspace_id !== undefined && typeof body.workspace_id !== 'string') {
            issues.push('workspace_id must be a string when provided');
        }
        if (body.thread_id !== undefined && typeof body.thread_id !== 'string') {
            issues.push('thread_id must be a string when provided');
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateCapabilityMatchBody
// ---------------------------------------------------------------------------
/**
 * Validates the body for capability match requests.
 *
 * Required: requiredCapabilities (array of strings).
 * Optional: preferredCapabilities (array of strings),
 *           preferredPlatform (string), tags (array of strings).
 */
function validateCapabilityMatchBody() {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        if (!Array.isArray(body.requiredCapabilities)) {
            issues.push('requiredCapabilities must be an array');
        }
        else {
            for (let i = 0; i < body.requiredCapabilities.length; i++) {
                if (typeof body.requiredCapabilities[i] !== 'string') {
                    issues.push(`requiredCapabilities[${i}] must be a string`);
                }
            }
        }
        if (body.preferredCapabilities !== undefined) {
            if (!Array.isArray(body.preferredCapabilities)) {
                issues.push('preferredCapabilities must be an array of strings when provided');
            }
            else {
                for (let i = 0; i < body.preferredCapabilities.length; i++) {
                    if (typeof body.preferredCapabilities[i] !== 'string') {
                        issues.push(`preferredCapabilities[${i}] must be a string`);
                    }
                }
            }
        }
        if (body.preferredPlatform !== undefined && typeof body.preferredPlatform !== 'string') {
            issues.push('preferredPlatform must be a string when provided');
        }
        if (body.tags !== undefined) {
            if (!Array.isArray(body.tags)) {
                issues.push('tags must be an array of strings when provided');
            }
            else {
                for (let i = 0; i < body.tags.length; i++) {
                    if (typeof body.tags[i] !== 'string') {
                        issues.push(`tags[${i}] must be a string`);
                    }
                }
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
// ---------------------------------------------------------------------------
// validateAggregationBody
// ---------------------------------------------------------------------------
/**
 * Validates the body for task result aggregation requests.
 *
 * Required:
 * - parentTaskId (string)
 * - subtaskResults (array)
 * - strategy (one of 'all' | 'first-wins' | 'majority' | 'weighted')
 *
 * Optional:
 * - majorityThreshold (number, 0 < x <= 1)
 * - weights (object)
 */
function validateAggregationBody() {
    return (req, res, next) => {
        const body = req.body;
        if (!body || typeof body !== 'object') {
            sendValidationError(res, ['Request body must be a JSON object']);
            return;
        }
        const issues = [];
        if (!body.parentTaskId || typeof body.parentTaskId !== 'string') {
            issues.push('parentTaskId must be a non-empty string');
        }
        if (!Array.isArray(body.subtaskResults)) {
            issues.push('subtaskResults must be an array');
        }
        if (!body.strategy || typeof body.strategy !== 'string') {
            issues.push('strategy must be a non-empty string');
        }
        else if (!VALID_AGGREGATION_STRATEGIES.has(body.strategy)) {
            issues.push(`strategy must be one of: ${Array.from(VALID_AGGREGATION_STRATEGIES).join(', ')}. Got: '${body.strategy}'`);
        }
        if (body.majorityThreshold !== undefined) {
            if (typeof body.majorityThreshold !== 'number' || body.majorityThreshold <= 0 || body.majorityThreshold > 1) {
                issues.push('majorityThreshold must be a number between 0 (exclusive) and 1 (inclusive) when provided');
            }
        }
        if (body.weights !== undefined) {
            if (typeof body.weights !== 'object' || body.weights === null || Array.isArray(body.weights)) {
                issues.push('weights must be a plain object when provided');
            }
        }
        if (issues.length > 0) {
            sendValidationError(res, issues);
            return;
        }
        next();
    };
}
