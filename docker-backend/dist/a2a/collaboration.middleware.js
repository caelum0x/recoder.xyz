"use strict";
/**
 * @module collaboration.middleware
 *
 * Express middleware for validating AMB (Agent Messaging Bus) collaboration
 * requests: channels, threads, and messages.
 *
 * Follows the same validation pattern as `task-lifecycle.middleware.ts`:
 *   - Collect all issues into an array
 *   - Return a structured A2A error response with the full list
 *   - Call `next()` only when the body is valid
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateChannelBody = validateCreateChannelBody;
exports.validateCreateThreadBody = validateCreateThreadBody;
exports.validateSendMessageBody = validateSendMessageBody;
exports.validateChannelIdParam = validateChannelIdParam;
exports.validateThreadIdParam = validateThreadIdParam;
const a2a_1 = require("@recoder/shared/a2a");
// ---------------------------------------------------------------------------
// Response helper
// ---------------------------------------------------------------------------
function sendValidationError(res, httpStatus, error) {
    res.status(httpStatus).json({ success: false, error });
}
// ---------------------------------------------------------------------------
// Validate create-channel body
// ---------------------------------------------------------------------------
const VALID_SCOPES = new Set(['channel', 'dm']);
/**
 * Validates `POST /api/a2a/channels` body.
 *
 * Required fields:
 * - name (string, non-empty)
 * - scope ('channel' | 'dm')
 * - memberAgentIds (array of non-empty strings, at least 1)
 */
function validateCreateChannelBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: 'Request body must be a JSON object',
        }));
        return;
    }
    const issues = [];
    if (!body.name || typeof body.name !== 'string') {
        issues.push('name must be a non-empty string');
    }
    if (!body.scope || typeof body.scope !== 'string') {
        issues.push('scope must be a non-empty string');
    }
    else if (!VALID_SCOPES.has(body.scope)) {
        issues.push(`scope must be one of: ${[...VALID_SCOPES].join(', ')}. Got: '${body.scope}'`);
    }
    if (!Array.isArray(body.memberAgentIds)) {
        issues.push('memberAgentIds must be an array');
    }
    else {
        if (body.memberAgentIds.length === 0) {
            issues.push('memberAgentIds must contain at least one agent ID');
        }
        for (let i = 0; i < body.memberAgentIds.length; i++) {
            if (!body.memberAgentIds[i] || typeof body.memberAgentIds[i] !== 'string') {
                issues.push(`memberAgentIds[${i}] must be a non-empty string`);
            }
        }
    }
    if (issues.length > 0) {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate create-thread body
// ---------------------------------------------------------------------------
/**
 * Validates `POST /api/a2a/channels/:channelId/threads` body.
 *
 * Required fields:
 * - title (string, non-empty)
 */
function validateCreateThreadBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: 'Request body must be a JSON object',
        }));
        return;
    }
    const issues = [];
    if (!body.title || typeof body.title !== 'string') {
        issues.push('title must be a non-empty string');
    }
    if (issues.length > 0) {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate send-message body
// ---------------------------------------------------------------------------
/**
 * Validates `POST /api/a2a/channels/:channelId/threads/:threadId/messages` body.
 *
 * Required fields:
 * - senderAgentId (string, non-empty)
 * - text (string, non-empty)
 */
function validateSendMessageBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: 'Request body must be a JSON object',
        }));
        return;
    }
    const issues = [];
    if (!body.senderAgentId || typeof body.senderAgentId !== 'string') {
        issues.push('senderAgentId must be a non-empty string');
    }
    if (!body.text || typeof body.text !== 'string') {
        issues.push('text must be a non-empty string');
    }
    if (issues.length > 0) {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate channelId param
// ---------------------------------------------------------------------------
/**
 * Validates that `req.params.channelId` is present and non-empty.
 */
function validateChannelIdParam(req, res, next) {
    const { channelId } = req.params;
    if (!channelId || channelId === 'undefined') {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
            message: 'channelId parameter is required',
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate threadId param
// ---------------------------------------------------------------------------
/**
 * Validates that `req.params.threadId` is present and non-empty.
 */
function validateThreadIdParam(req, res, next) {
    const { threadId } = req.params;
    if (!threadId || threadId === 'undefined') {
        sendValidationError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
            message: 'threadId parameter is required',
        }));
        return;
    }
    next();
}
