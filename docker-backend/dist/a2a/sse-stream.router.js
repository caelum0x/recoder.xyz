"use strict";
/**
 * @module sse-stream.router
 *
 * Server-Sent Events (SSE) endpoints for real-time A2A event streaming.
 *
 * Provides three SSE endpoints:
 *
 * | Method | Path                               | Description                          |
 * |--------|------------------------------------|--------------------------------------|
 * | GET    | /tasks/:taskId/stream              | Stream events for a single task      |
 * | GET    | /channels/:channelId/stream        | Stream events for a channel          |
 * | GET    | /events/stream                     | Global stream for all A2A events     |
 *
 * All streams use the standard SSE protocol:
 * - Content-Type: text/event-stream
 * - Cache-Control: no-cache, no-transform
 * - Connection: keep-alive
 * - Heartbeat every 30s to keep connection alive
 * - Proper cleanup on client disconnect
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseStreamRouter = void 0;
const express_1 = require("express");
const a2a_event_bus_1 = require("./a2a-event-bus");
const a2a_1 = require("@recoder/shared/a2a");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const workspace_service_1 = require("./workspace.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-sse-stream');
/** Heartbeat interval in milliseconds. */
const HEARTBEAT_INTERVAL_MS = 30_000;
// ---------------------------------------------------------------------------
// SSE helpers
// ---------------------------------------------------------------------------
/**
 * Configure the response for SSE streaming.
 * Sets all required headers and flushes them to start the stream.
 */
function initSseResponse(res) {
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
        res.flushHeaders();
    }
}
/**
 * Write a single SSE event to the response.
 *
 * Format:
 *   id: <event.id>
 *   event: <event.type>
 *   data: <JSON payload>
 *   \n
 */
function writeSseEvent(res, event) {
    if (event.id) {
        res.write(`id: ${event.id}\n`);
    }
    res.write(`event: ${event.type}\n`);
    res.write(`data: ${JSON.stringify(event.data)}\n\n`);
}
/**
 * Write a heartbeat comment to keep the connection alive.
 * SSE spec allows comments (lines starting with ':') for keepalive.
 */
function writeHeartbeat(res) {
    res.write(`: heartbeat ${new Date().toISOString()}\n\n`);
}
/**
 * Start a heartbeat timer for the given response.
 * Returns the interval handle for cleanup.
 */
function startHeartbeat(res) {
    return setInterval(() => {
        try {
            writeHeartbeat(res);
        }
        catch {
            // Connection closed; interval will be cleaned up by the close handler
        }
    }, HEARTBEAT_INTERVAL_MS);
}
/**
 * Parse a comma-separated type filter from the query string.
 * Returns null if no filter is provided (meaning "all events").
 */
function parseTypeFilter(raw) {
    if (typeof raw !== 'string' || !raw.trim())
        return null;
    const types = raw
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
    return types.length > 0 ? new Set(types) : null;
}
function getAuthenticatedUserId(req) {
    const userId = req.userId;
    return typeof userId === 'string' && userId.trim().length > 0 && userId !== 'anonymous'
        ? userId
        : undefined;
}
function sendAuthorizationDenied(res, message) {
    res.status(403).json({
        success: false,
        error: (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.AuthorizationDenied,
            message,
        }),
    });
}
function canAccessWorkspace(req, workspaceId) {
    const authenticatedUserId = getAuthenticatedUserId(req);
    if (!authenticatedUserId || !workspaceId) {
        return true;
    }
    const workspace = (0, workspace_service_1.getWorkspaceService)().get(workspaceId);
    if (!workspace) {
        return true;
    }
    return workspace.ownerId === authenticatedUserId;
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.sseStreamRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// GET /tasks/:taskId/stream -- SSE stream for a single task
// ---------------------------------------------------------------------------
exports.sseStreamRouter.get('/tasks/:taskId/stream', (req, res) => {
    const { taskId } = req.params;
    if (!taskId || taskId === 'undefined') {
        res.status(400).json({
            success: false,
            error: { code: 'MISSING_TASK_ID', message: 'taskId parameter is required' },
        });
        return;
    }
    // Verify the task exists before opening the stream
    const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    const taskResult = service.getTask(taskId);
    if (!taskResult.ok) {
        res.status(taskResult.httpStatus).json({
            success: false,
            error: taskResult.error,
        });
        return;
    }
    if (!canAccessWorkspace(req, taskResult.data.workspace_id)) {
        sendAuthorizationDenied(res, `Task stream access denied: ${taskId}`);
        return;
    }
    logger.info({ task_id: taskId }, 'SSE stream opened for task');
    // Initialize SSE response
    initSseResponse(res);
    // Send the current task state as the initial event
    const initialEvent = {
        id: `init_${Date.now().toString(36)}`,
        type: 'task.snapshot',
        timestamp: new Date().toISOString(),
        data: { task: taskResult.data },
        taskId,
    };
    writeSseEvent(res, initialEvent);
    // If task is already in a terminal state, close immediately
    const currentState = taskResult.data.state;
    if (currentState === 'completed' ||
        currentState === 'failed' ||
        currentState === 'cancelled') {
        logger.info({ task_id: taskId, state: currentState }, 'task already terminal, closing SSE stream');
        res.end();
        return;
    }
    // Subscribe to task events
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    const unsubscribe = eventBus.subscribeTask(taskId, (event) => {
        try {
            writeSseEvent(res, event);
            // Auto-close on terminal state
            if (a2a_event_bus_1.TERMINAL_TASK_EVENT_TYPES.has(event.type)) {
                logger.info({ task_id: taskId, event_type: event.type }, 'terminal event received, closing SSE stream');
                cleanup();
                res.end();
            }
        }
        catch (err) {
            logger.debug({ task_id: taskId, err }, 'error writing SSE event, cleaning up');
            cleanup();
        }
    });
    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);
    // Cleanup function
    let cleaned = false;
    function cleanup() {
        if (cleaned)
            return;
        cleaned = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
        logger.info({ task_id: taskId }, 'SSE stream closed for task');
    }
    // Handle client disconnect
    req.on('close', cleanup);
});
// ---------------------------------------------------------------------------
// GET /channels/:channelId/stream -- SSE stream for channel messages
// ---------------------------------------------------------------------------
exports.sseStreamRouter.get('/channels/:channelId/stream', (req, res) => {
    const { channelId } = req.params;
    if (!channelId || channelId === 'undefined') {
        res.status(400).json({
            success: false,
            error: { code: 'MISSING_CHANNEL_ID', message: 'channelId parameter is required' },
        });
        return;
    }
    const workspace = (0, workspace_service_1.getWorkspaceService)().list().find((candidate) => candidate.defaultChannelId === channelId);
    if (!canAccessWorkspace(req, workspace?.workspaceId)) {
        sendAuthorizationDenied(res, `Channel stream access denied: ${channelId}`);
        return;
    }
    logger.info({ channel_id: channelId }, 'SSE stream opened for channel');
    // Initialize SSE response
    initSseResponse(res);
    // Send a connected event
    const connectedEvent = {
        id: `init_${Date.now().toString(36)}`,
        type: 'channel.connected',
        timestamp: new Date().toISOString(),
        data: { channelId },
        channelId,
    };
    writeSseEvent(res, connectedEvent);
    // Subscribe to channel events
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    const unsubscribe = eventBus.subscribeChannel(channelId, (event) => {
        try {
            writeSseEvent(res, event);
        }
        catch (err) {
            logger.debug({ channel_id: channelId, err }, 'error writing SSE event, cleaning up');
            cleanup();
        }
    });
    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);
    // Cleanup function
    let cleaned = false;
    function cleanup() {
        if (cleaned)
            return;
        cleaned = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
        logger.info({ channel_id: channelId }, 'SSE stream closed for channel');
    }
    // Handle client disconnect
    req.on('close', cleanup);
});
// ---------------------------------------------------------------------------
// GET /events/stream -- Global SSE stream for all A2A events
// ---------------------------------------------------------------------------
exports.sseStreamRouter.get('/events/stream', (req, res) => {
    if (!canAccessWorkspace(req)) {
        sendAuthorizationDenied(res, 'Global stream access denied');
        return;
    }
    // Parse optional type filter from query string
    const typeFilter = parseTypeFilter(req.query.types);
    logger.info({ filter: typeFilter ? Array.from(typeFilter) : 'all' }, 'global SSE stream opened');
    // Initialize SSE response
    initSseResponse(res);
    // Send a connected event
    const connectedEvent = {
        id: `init_${Date.now().toString(36)}`,
        type: 'stream.connected',
        timestamp: new Date().toISOString(),
        data: {
            filter: typeFilter ? Array.from(typeFilter) : null,
        },
    };
    writeSseEvent(res, connectedEvent);
    // Subscribe to global events
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    const unsubscribe = eventBus.subscribeGlobal((event) => {
        // Apply type filter if specified
        if (typeFilter && !typeFilter.has(event.type)) {
            return;
        }
        try {
            writeSseEvent(res, event);
        }
        catch (err) {
            logger.debug({ err }, 'error writing SSE event on global stream, cleaning up');
            cleanup();
        }
    });
    // Start heartbeat
    const heartbeatInterval = startHeartbeat(res);
    // Cleanup function
    let cleaned = false;
    function cleanup() {
        if (cleaned)
            return;
        cleaned = true;
        clearInterval(heartbeatInterval);
        unsubscribe();
        logger.info('global SSE stream closed');
    }
    // Handle client disconnect
    req.on('close', cleanup);
});
