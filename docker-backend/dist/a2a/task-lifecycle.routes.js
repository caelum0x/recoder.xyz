"use strict";
/**
 * @module task-lifecycle.routes
 *
 * Express route handlers for A2A task lifecycle operations.
 *
 * Provides the following endpoints under the `/api/a2a/tasks` prefix:
 *
 * | Method | Path                          | Description                              |
 * |--------|-------------------------------|------------------------------------------|
 * | POST   | /                             | Create a new task (state: submitted)     |
 * | PATCH  | /:taskId/transition           | Transition task to a new state           |
 * | GET    | /:taskId                      | Get a task with full envelope            |
 * | GET    | /:taskId/history              | Get transition history for a task        |
 * | GET    | /                             | List tasks with optional filters         |
 *
 * All error responses use the canonical A2A error taxonomy from
 * `@recoder/shared/a2a/schemas`.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskLifecycleRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const agent_bridge_service_1 = require("./agent-bridge.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const logger_1 = require("../logger");
const memory_store_1 = require("./memory-store");
const logger = (0, logger_1.createLogger)('a2a-task-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
function extractBridgePrompt(payload) {
    if (typeof payload === 'string') {
        return payload;
    }
    if (Array.isArray(payload)) {
        for (const part of payload) {
            const prompt = extractBridgePrompt(part);
            if (prompt)
                return prompt;
        }
        return '';
    }
    if (!payload || typeof payload !== 'object') {
        return '';
    }
    const record = payload;
    if (record.kind === 'text' && typeof record.text === 'string') {
        return record.text;
    }
    if (typeof record.task === 'string') {
        return record.task;
    }
    if (typeof record.prompt === 'string') {
        return record.prompt;
    }
    if (typeof record.content === 'string') {
        return record.content;
    }
    return '';
}
function extractBridgeIntent(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return undefined;
    }
    const intent = payload.intent;
    return typeof intent === 'string' && intent.trim() ? intent : undefined;
}
async function dispatchTaskToBridgeIfOnline(task) {
    const assigneeId = task.assignee?.agent_id;
    if (!assigneeId)
        return;
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    if (!bridge.isAgentOnline(assigneeId)) {
        return;
    }
    const prompt = extractBridgePrompt(task.payload);
    const intent = extractBridgeIntent(task.payload);
    // Fetch agent's recent memory context before dispatch
    const connected = bridge.getAgent(assigneeId);
    const memoryContext = connected?.userId && prompt
        ? await (0, memory_store_1.getRecentContext)({ query: prompt, userId: connected.userId })
        : [];
    const delivered = bridge.sendToAgent(assigneeId, {
        type: 'task.assigned',
        taskId: task.id,
        prompt,
        ...(intent ? { intent } : {}),
        context: {
            source: 'a2a-rest',
            from: task.requester?.agent_id || 'unknown',
            workspace_id: task.workspace_id,
            thread_id: task.thread_id,
            trace_id: task.trace_id,
            connector: task.connector,
            payload: task.payload,
            ...(memoryContext.length > 0 ? { memoryContext } : {}),
        },
    });
    if (delivered) {
        if (connected)
            connected.status = 'working';
        logger.info({ taskId: task.id, assigneeId, memoryEntries: memoryContext.length }, 'REST-created task dispatched to bridge-connected agent');
    }
    else {
        logger.warn({ taskId: task.id, assigneeId }, 'failed to dispatch REST-created task to bridge-connected agent');
    }
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter = (0, express_1.Router)();
// All routes expect JSON bodies. Since the parent A2A mount may use
// express.text() for raw verification, we parse it back first.
exports.taskLifecycleRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST / -- Create a new task
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.post('/', task_lifecycle_middleware_1.validateCreateTaskBody, (req, res) => {
    try {
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const input = {
            workspace_id: req.body.workspace_id,
            thread_id: req.body.thread_id,
            trace_id: req.body.trace_id,
            parent_id: req.body.parent_id,
            requester: req.body.requester,
            assignee: req.body.assignee,
            connector: req.body.connector,
            payload: req.body.payload,
            metadata: req.body.metadata,
            tags: req.body.tags,
        };
        const result = service.createTask(input);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        // Bridge dispatch is best-effort and async (memory lookup) — fire-and-forget.
        void dispatchTaskToBridgeIfOnline(result.data);
        sendSuccess(res, result.data, 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/tasks');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while creating task',
        }));
    }
});
// ---------------------------------------------------------------------------
// PATCH /:taskId/transition -- Transition task state
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.patch('/:taskId/transition', task_lifecycle_middleware_1.validateTransitionBody, (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const input = {
            target_state: req.body.target_state,
            reason: req.body.reason,
            triggered_by: req.body.triggered_by,
            result: req.body.result,
            error: req.body.error,
        };
        const result = service.transitionTask(taskId, input);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in PATCH /api/a2a/tasks/:taskId/transition');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while transitioning task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId -- Get task with full envelope
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        // Guard against matching the literal string "undefined" or empty
        if (!taskId || taskId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'taskId parameter is required',
            }));
            return;
        }
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.getTask(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId/history -- Get transition history
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/:taskId/history', (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.getTaskHistory(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, {
            task_id: taskId,
            transitions: result.data,
            transition_count: result.data.length,
        });
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/history');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching task history',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:taskId/claim -- Claim a task for exclusive processing by a session
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.post('/:taskId/claim', (req, res) => {
    try {
        const { taskId } = req.params;
        const { session_id, agent_id } = req.body ?? {};
        if (!session_id || typeof session_id !== 'string') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'session_id is required',
            }));
            return;
        }
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.claimTask(taskId, session_id, typeof agent_id === 'string' ? agent_id : 'unknown');
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/claim');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while claiming task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET / -- List tasks with optional filters
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/', (req, res) => {
    try {
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const filter = {};
        if (typeof req.query.workspace_id === 'string')
            filter.workspace_id = req.query.workspace_id;
        if (typeof req.query.thread_id === 'string')
            filter.thread_id = req.query.thread_id;
        if (typeof req.query.state === 'string')
            filter.state = req.query.state;
        if (typeof req.query.assignee_agent_id === 'string')
            filter.assignee_agent_id = req.query.assignee_agent_id;
        if (typeof req.query.limit === 'string') {
            const parsed = parseInt(req.query.limit, 10);
            if (!isNaN(parsed) && parsed > 0)
                filter.limit = Math.min(parsed, 1000);
        }
        if (typeof req.query.offset === 'string') {
            const parsed = parseInt(req.query.offset, 10);
            if (!isNaN(parsed) && parsed >= 0)
                filter.offset = parsed;
        }
        const result = service.listTasks(filter);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, {
            tasks: result.data,
            count: result.data.length,
            filter,
        });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/tasks');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing tasks',
        }));
    }
});
