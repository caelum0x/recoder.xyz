"use strict";
/**
 * @module windsurf-connector.routes
 *
 * Express route handlers for the Windsurf IDE Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/windsurf`):
 *
 * | Method | Path       | Description                                    |
 * |--------|------------|------------------------------------------------|
 * | POST   | /execute   | Execute a task via Windsurf bridge              |
 * | GET    | /status    | Get connector runtime status                   |
 * | POST   | /start     | Start the Windsurf bridge process               |
 * | POST   | /stop      | Stop the Windsurf bridge process                |
 * | POST   | /restart   | Restart the Windsurf bridge process              |
 * | GET    | /task/:taskId          | Query task status                    |
 * | POST   | /task/:taskId/cancel   | Cancel a running task                |
 * | POST   | /approval/:approvalId  | Respond to an approval request       |
 *
 * NOTE: Windsurf bridge method names remain configurable, but the runtime now
 * drives execute/status/cancel/approval through the child process instead of
 * mutating only local lifecycle state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.windsurfConnectorRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const windsurf_connector_runtime_service_1 = require("./windsurf-connector-runtime.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const slo_metrics_1 = require("./slo-metrics");
const connector_retry_1 = require("./connector-retry");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('windsurf-connector-routes');
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
exports.windsurfConnectorRouter = (0, express_1.Router)();
// Parse JSON text body (since /api/a2a uses express.text())
exports.windsurfConnectorRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Windsurf
// ---------------------------------------------------------------------------
exports.windsurfConnectorRouter.post('/execute', async (req, res) => {
    let executionStartedAt = null;
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Windsurf connector is not running. Start it first via POST /start.',
            }));
            return;
        }
        const { prompt, taskId, requester, workspace_id, thread_id, artifacts } = req.body || {};
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
                    platform: requester?.platform || 'recoder_web',
                    name: requester?.name || 'API Caller',
                },
                assignee: {
                    agent_id: 'windsurf-connector',
                    platform: 'windsurf',
                    name: 'Windsurf IDE Connector',
                },
                connector: {
                    connector_id: 'windsurf-bridge',
                    platform: 'windsurf',
                    protocol: 'jsonrpc',
                },
                payload: { kind: 'text', text: prompt },
                tags: ['windsurf-connector'],
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
                platform: requester?.platform || 'recoder_web',
            },
            workspaceId: workspace_id,
            threadId: thread_id,
            artifacts,
        };
        executionStartedAt = Date.now();
        const result = await (0, connector_retry_1.withConnectorRetry)(() => runtime.executeTask(input));
        (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
            connectorId: 'windsurf',
            success: result.success,
            durationMs: Date.now() - executionStartedAt,
        });
        if (result.success) {
            sendSuccess(res, {
                taskId: result.taskId,
                resultText: result.resultText,
                artifacts: result.artifacts,
                envelope: result.envelope,
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
                connectorId: 'windsurf',
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
exports.windsurfConnectorRouter.get('/status', (_req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        const state = runtime.getState();
        sendSuccess(res, {
            connector: 'windsurf-bridge',
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
// POST /start -- Start Windsurf bridge process
// ---------------------------------------------------------------------------
exports.windsurfConnectorRouter.post('/start', async (req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        if (runtime.isRunning()) {
            const state = runtime.getState();
            sendSuccess(res, {
                message: 'Windsurf connector is already running',
                ...state,
            });
            return;
        }
        await runtime.start();
        runtime.registerWithAgentRegistry();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Windsurf connector started successfully',
            ...state,
        }, 201);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to start Windsurf connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to start Windsurf connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /stop -- Stop Windsurf bridge process
// ---------------------------------------------------------------------------
exports.windsurfConnectorRouter.post('/stop', async (_req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendSuccess(res, {
                message: 'Windsurf connector is already stopped',
                ...runtime.getState(),
            });
            return;
        }
        await runtime.stop();
        sendSuccess(res, {
            message: 'Windsurf connector stopped',
            ...runtime.getState(),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to stop Windsurf connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to stop Windsurf connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /restart -- Restart Windsurf bridge process
// ---------------------------------------------------------------------------
exports.windsurfConnectorRouter.post('/restart', async (_req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        await runtime.restart();
        runtime.registerWithAgentRegistry();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Windsurf connector restarted successfully',
            ...state,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to restart Windsurf connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to restart Windsurf connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status (parity with Codex connector)
// ---------------------------------------------------------------------------
exports.windsurfConnectorRouter.get('/task/:taskId', async (req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Windsurf connector is not running.',
            }));
            return;
        }
        const { taskId } = req.params;
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required parameter: taskId',
            }));
            return;
        }
        const status = await runtime.getTaskStatus(taskId);
        sendSuccess(res, {
            taskId,
            status,
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
exports.windsurfConnectorRouter.post('/task/:taskId/cancel', async (req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        const { taskId } = req.params;
        const { reason } = req.body || {};
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required parameter: taskId',
            }));
            return;
        }
        const result = await runtime.cancelTask(taskId, reason);
        // Keep the local lifecycle mirror in sync as best effort.
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        lifecycle.cancelTask(taskId, reason || 'Cancelled via Windsurf connector API');
        logger.info({ taskId, reason }, 'Task cancelled via Windsurf connector');
        sendSuccess(res, {
            taskId,
            cancelled: true,
            result,
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
exports.windsurfConnectorRouter.post('/approval/:approvalId', async (req, res) => {
    try {
        const runtime = (0, windsurf_connector_runtime_service_1.getWindsurfConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Windsurf connector is not running.',
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
        const result = await runtime.respondToApproval(approvalId, approved, reason);
        // Convention: approvalId is either the taskId itself or prefixed with the taskId.
        const taskId = approvalId.includes(':') ? approvalId.split(':')[0] : approvalId;
        if (!approved) {
            const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
            lifecycle.cancelTask(taskId, reason || `Approval ${approvalId} denied`);
            logger.info({ approvalId, taskId, reason }, 'Approval denied for Windsurf connector task');
        }
        else {
            logger.info({ approvalId, taskId, reason }, 'Approval granted for Windsurf connector task');
        }
        sendSuccess(res, {
            approvalId,
            approved,
            taskId,
            result,
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
