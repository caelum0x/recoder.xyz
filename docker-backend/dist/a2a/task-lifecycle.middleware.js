"use strict";
/**
 * @module task-lifecycle.middleware
 *
 * Express middleware for validating A2A task lifecycle requests.
 *
 * These middleware functions sit between the raw HTTP request and the route
 * handlers, ensuring that:
 *
 * 1. Request bodies have the required shape before reaching the service.
 * 2. Referenced tasks exist and are loaded onto `req.taskEnvelope`.
 * 3. Validation errors return structured A2A error responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateCreateTaskBody = validateCreateTaskBody;
exports.validateTransitionBody = validateTransitionBody;
exports.loadTaskEnvelope = loadTaskEnvelope;
exports.parseJsonTextBody = parseJsonTextBody;
const a2a_1 = require("@recoder/shared/a2a");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-task-middleware');
// ---------------------------------------------------------------------------
// Response helpers
// ---------------------------------------------------------------------------
function sendA2AError(res, httpStatus, error) {
    res.status(httpStatus).json({
        success: false,
        error,
    });
}
// ---------------------------------------------------------------------------
// Validate create-task body
// ---------------------------------------------------------------------------
/**
 * Validates the request body for `POST /api/a2a/tasks`.
 *
 * Required fields:
 * - workspace_id (string)
 * - thread_id (string)
 * - requester (object with agent_id, platform)
 * - assignee (object with agent_id, platform), unless `auto_route=true`
 * - connector (object with connector_id, platform, protocol), unless `auto_route=true`
 * - payload (non-null)
 */
function validateCreateTaskBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: 'Request body must be a JSON object',
        }));
        return;
    }
    const issues = [];
    const wantsAutoRoute = body?.auto_route === true;
    if (!body.workspace_id || typeof body.workspace_id !== 'string') {
        issues.push('workspace_id must be a non-empty string');
    }
    if (!body.thread_id || typeof body.thread_id !== 'string') {
        issues.push('thread_id must be a non-empty string');
    }
    // requester
    if (!body.requester || typeof body.requester !== 'object') {
        issues.push('requester must be an object');
    }
    else {
        if (!body.requester.agent_id || typeof body.requester.agent_id !== 'string') {
            issues.push('requester.agent_id must be a non-empty string');
        }
        if (!body.requester.platform || typeof body.requester.platform !== 'string') {
            issues.push('requester.platform must be a non-empty string');
        }
    }
    // assignee / connector are optional when the route is asked to auto-route
    if (!wantsAutoRoute) {
        if (!body.assignee || typeof body.assignee !== 'object') {
            issues.push('assignee must be an object');
        }
        else {
            if (!body.assignee.agent_id || typeof body.assignee.agent_id !== 'string') {
                issues.push('assignee.agent_id must be a non-empty string');
            }
            if (!body.assignee.platform || typeof body.assignee.platform !== 'string') {
                issues.push('assignee.platform must be a non-empty string');
            }
        }
        if (!body.connector || typeof body.connector !== 'object') {
            issues.push('connector must be an object');
        }
        else {
            if (!body.connector.connector_id || typeof body.connector.connector_id !== 'string') {
                issues.push('connector.connector_id must be a non-empty string');
            }
            if (!body.connector.platform || typeof body.connector.platform !== 'string') {
                issues.push('connector.platform must be a non-empty string');
            }
            if (!body.connector.protocol || typeof body.connector.protocol !== 'string') {
                issues.push('connector.protocol must be a non-empty string');
            }
        }
    }
    else if (body.routing_hints !== undefined && (typeof body.routing_hints !== 'object' || body.routing_hints === null || Array.isArray(body.routing_hints))) {
        issues.push('routing_hints must be an object when provided');
    }
    // payload
    if (body.payload === undefined || body.payload === null) {
        issues.push('payload is required');
    }
    if (issues.length > 0) {
        sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Validate transition body
// ---------------------------------------------------------------------------
const VALID_TASK_STATES = new Set(a2a_1.TASK_STATES);
/**
 * Validates the request body for `PATCH /api/a2a/tasks/:taskId/transition`.
 *
 * Required fields:
 * - target_state (one of the canonical task states)
 *
 * Optional fields:
 * - reason (string)
 * - triggered_by (string)
 * - result (object, only valid for completed)
 * - error (object, only valid for failed)
 */
function validateTransitionBody(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object') {
        sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: 'Request body must be a JSON object',
        }));
        return;
    }
    const issues = [];
    if (!body.target_state || typeof body.target_state !== 'string') {
        issues.push('target_state must be a non-empty string');
    }
    else if (!VALID_TASK_STATES.has(body.target_state)) {
        issues.push(`target_state must be one of: ${Array.from(VALID_TASK_STATES).join(', ')}. Got: '${body.target_state}'`);
    }
    if (body.reason !== undefined && typeof body.reason !== 'string') {
        issues.push('reason must be a string when provided');
    }
    if (body.triggered_by !== undefined && typeof body.triggered_by !== 'string') {
        issues.push('triggered_by must be a string when provided');
    }
    if (body.result !== undefined && (typeof body.result !== 'object' || body.result === null)) {
        issues.push('result must be an object when provided');
    }
    if (body.error !== undefined && (typeof body.error !== 'object' || body.error === null)) {
        issues.push('error must be an object when provided');
    }
    // Validate that result is only provided for completed transitions
    if (body.result && body.target_state !== a2a_1.TaskStateEnum.Completed) {
        issues.push('result can only be provided when target_state is "completed"');
    }
    // Validate that error is only provided for failed transitions
    if (body.error && body.target_state !== a2a_1.TaskStateEnum.Failed) {
        issues.push('error can only be provided when target_state is "failed"');
    }
    if (issues.length > 0) {
        sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
            message: `Request validation failed: ${issues.join('; ')}`,
            details: { validation_issues: issues },
        }));
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Load task envelope from store
// ---------------------------------------------------------------------------
/**
 * Loads a task envelope from the store and attaches it to the request.
 * Returns 404 if the task does not exist.
 *
 * Expects `req.params.taskId` to be set (via Express route param).
 */
function loadTaskEnvelope(req, res, next) {
    const { taskId } = req.params;
    if (!taskId) {
        sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
            message: 'taskId parameter is required',
        }));
        return;
    }
    const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    const result = service.getTask(taskId);
    if (!result.ok) {
        sendA2AError(res, result.httpStatus, result.error);
        return;
    }
    req.taskEnvelope = result.data;
    next();
}
// ---------------------------------------------------------------------------
// Parse JSON text body (for routes mounted behind text middleware)
// ---------------------------------------------------------------------------
/**
 * Some A2A routes are mounted behind `express.text()` for raw payload
 * verification. This middleware parses the text body back into JSON.
 */
function parseJsonTextBody(req, res, next) {
    if (typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            sendA2AError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidPayload,
                message: 'Request body is not valid JSON',
            }));
            return;
        }
    }
    next();
}
