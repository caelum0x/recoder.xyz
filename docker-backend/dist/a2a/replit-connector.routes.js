"use strict";
/**
 * @module replit-connector.routes
 *
 * Express route handlers for the Replit Agent Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/replit`):
 *
 * | Method | Path       | Description                                      |
 * |--------|------------|--------------------------------------------------|
 * | POST   | /execute   | Execute a task via Replit agent API               |
 * | GET    | /status    | Get connector runtime status                     |
 * | POST   | /start     | Start the Replit connector (create REST adapter)  |
 * | POST   | /stop      | Stop the Replit connector (tear down adapter)     |
 * | POST   | /restart   | Restart the Replit connector                      |
 * | GET    | /task/:taskId          | Query task status                    |
 * | POST   | /task/:taskId/cancel   | Cancel a running task                |
 * | POST   | /approval/:approvalId  | Respond to an approval request       |
 *
 * Unlike child-process connectors, Replit communicates via REST HTTP
 * through the RestAdapter. The routes follow the same shape as the
 * cursor-connector routes for consistency.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.replitConnectorRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const replit_connector_runtime_service_1 = require("./replit-connector-runtime.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const slo_metrics_1 = require("./slo-metrics");
const connector_retry_1 = require("./connector-retry");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('replit-connector-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.replitConnectorRouter = (0, express_1.Router)();
// Parse JSON text body (since /api/a2a uses express.text())
exports.replitConnectorRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Replit
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/execute', async (req, res) => {
    let executionStartedAt = null;
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Replit connector is not running. Start it first via POST /start.',
            }));
            return;
        }
        const { prompt, taskId, requester, workspace_id, thread_id, metadata, artifacts } = req.body || {};
        if (!prompt || typeof prompt !== 'string') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required field: prompt (string)',
                details: { missing_fields: ['prompt'] },
            }));
            return;
        }
        // Create a task in the lifecycle service if no taskId is provided
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        let effectiveTaskId = taskId;
        if (!effectiveTaskId) {
            const createResult = lifecycle.createTask({
                workspace_id: workspace_id || 'default',
                thread_id: thread_id || (0, task_lifecycle_service_1.generateId)('thr'),
                requester: {
                    agent_id: requester?.id || 'api-caller',
                    platform: requester?.platform || 'recoder_app',
                    name: requester?.name || 'API Caller',
                },
                assignee: {
                    agent_id: 'replit-connector',
                    platform: 'replit',
                    name: 'Replit Agent Connector',
                },
                connector: {
                    connector_id: 'replit-rest',
                    platform: 'replit',
                    protocol: 'rest',
                },
                payload: { kind: 'text', text: prompt },
                tags: ['replit-connector'],
            });
            if (!createResult.ok) {
                sendError(res, createResult.httpStatus, createResult.error);
                return;
            }
            effectiveTaskId = createResult.data.id;
        }
        const input = {
            taskId: effectiveTaskId,
            prompt,
            requester: {
                id: requester?.id || 'api-caller',
                name: requester?.name || 'API Caller',
                platform: requester?.platform || 'recoder_app',
            },
            metadata,
            artifacts,
        };
        executionStartedAt = Date.now();
        const result = await (0, connector_retry_1.withConnectorRetry)(() => runtime.executeTask(input));
        (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
            connectorId: 'replit',
            success: result.success,
            durationMs: Date.now() - executionStartedAt,
        });
        if (result.success) {
            sendSuccess(res, {
                taskId: result.taskId,
                resultText: result.resultText,
                artifacts: result.artifacts,
                raw: result.raw,
            });
        }
        else {
            sendError(res, 500, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorError,
                message: result.error || 'Task execution failed',
                details: { taskId: result.taskId },
            }));
        }
    }
    catch (err) {
        if (executionStartedAt !== null) {
            (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
                connectorId: 'replit',
                success: false,
                durationMs: Date.now() - executionStartedAt,
            });
        }
        logger.error({ err }, 'Unhandled error in POST /execute');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error during task execution',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /status -- Connector runtime status
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.get('/status', (_req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        const state = runtime.getState();
        sendSuccess(res, {
            connector: 'replit-rest',
            tier: 'tier-2',
            ...state,
        });
    }
    catch (err) {
        logger.error({ err }, 'Unhandled error in GET /status');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching connector status',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /start -- Start Replit connector (create REST adapter)
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/start', async (req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        if (runtime.isRunning()) {
            const state = runtime.getState();
            sendSuccess(res, {
                message: 'Replit connector is already running',
                ...state,
            });
            return;
        }
        await runtime.start();
        runtime.registerWithAgentRegistry();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Replit connector started successfully',
            ...state,
        }, 201);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to start Replit connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to start Replit connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /stop -- Stop Replit connector (tear down adapter)
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/stop', async (_req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendSuccess(res, {
                message: 'Replit connector is already stopped',
                ...runtime.getState(),
            });
            return;
        }
        await runtime.stop();
        sendSuccess(res, {
            message: 'Replit connector stopped',
            ...runtime.getState(),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to stop Replit connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to stop Replit connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /restart -- Restart Replit connector
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/restart', async (_req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        await runtime.restart();
        runtime.registerWithAgentRegistry();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Replit connector restarted successfully',
            ...state,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to restart Replit connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to restart Replit connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status (parity with Codex connector)
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.get('/task/:taskId', async (req, res) => {
    try {
        const { taskId } = req.params;
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required parameter: taskId',
            }));
            return;
        }
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = lifecycle.getTask(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        const envelope = result.data;
        sendSuccess(res, {
            taskId,
            state: envelope.state,
            connector: envelope.connector,
            result: envelope.result,
            error: envelope.error,
            createdAt: envelope.created_at,
            updatedAt: envelope.updated_at,
            history: envelope.history,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message, taskId: req.params.taskId }, 'Failed to get task status');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: `Failed to get task status: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /task/:taskId/cancel -- Cancel a running task (parity with Codex)
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/task/:taskId/cancel', async (req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        const { taskId } = req.params;
        const { reason } = req.body || {};
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required parameter: taskId',
            }));
            return;
        }
        // Transition the task to cancelled via lifecycle service
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = lifecycle.cancelTask(taskId, reason || 'Cancelled via Replit connector API');
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        logger.info({ taskId, reason }, 'Task cancelled via Replit connector');
        sendSuccess(res, {
            taskId,
            cancelled: true,
            state: result.data.state,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message, taskId: req.params.taskId }, 'Failed to cancel task');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to cancel task: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /approval/:approvalId -- Respond to an approval request (parity with Codex)
// ---------------------------------------------------------------------------
exports.replitConnectorRouter.post('/approval/:approvalId', async (req, res) => {
    try {
        const runtime = (0, replit_connector_runtime_service_1.getReplitConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Replit connector is not running.',
            }));
            return;
        }
        const { approvalId } = req.params;
        const { approved, reason } = req.body || {};
        if (!approvalId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required parameter: approvalId',
            }));
            return;
        }
        if (typeof approved !== 'boolean') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required field: approved (boolean)',
                details: { missing_fields: ['approved'] },
            }));
            return;
        }
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        // Convention: approvalId is either the taskId itself or prefixed with the taskId.
        const taskId = approvalId.includes(':') ? approvalId.split(':')[0] : approvalId;
        const taskResult = lifecycle.getTask(taskId);
        if (!taskResult.ok) {
            sendError(res, taskResult.httpStatus, taskResult.error);
            return;
        }
        if (approved) {
            // Resume the task -- emit event for orchestrator to pick up
            runtime.emit('approval:granted', { approvalId, taskId, reason });
            logger.info({ approvalId, taskId, reason }, 'Approval granted for Replit connector task');
        }
        else {
            // Reject -- cancel the task
            lifecycle.cancelTask(taskId, reason || `Approval ${approvalId} denied`);
            runtime.emit('approval:denied', { approvalId, taskId, reason });
            logger.info({ approvalId, taskId, reason }, 'Approval denied for Replit connector task');
        }
        sendSuccess(res, {
            approvalId,
            approved,
            taskId,
            result: approved ? 'resumed' : 'cancelled',
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message, approvalId: req.params.approvalId }, 'Failed to respond to approval');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to respond to approval: ${message}`,
        }));
    }
});
