"use strict";
/**
 * @module codex-connector.routes
 *
 * Express route handlers for the OpenAI Codex CLI Connector REST API.
 *
 * Provides the following endpoints (mounted under `/api/a2a/connectors/codex`):
 *
 * | Method | Path           | Description                                         |
 * |--------|----------------|-----------------------------------------------------|
 * | POST   | /execute       | Execute a task via Codex CLI JSON-RPC                |
 * | GET    | /status        | Get connector runtime status                        |
 * | POST   | /start         | Start the Codex CLI process                          |
 * | POST   | /stop          | Stop the Codex CLI process                           |
 * | POST   | /restart       | Restart the Codex CLI process                        |
 * | GET    | /task/:taskId  | Get task status from Codex                           |
 * | POST   | /task/:taskId/cancel | Cancel a running task                          |
 * | POST   | /approval/:id  | Respond to an approval request                      |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.codexConnectorRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const codex_connector_runtime_service_1 = require("./codex-connector-runtime.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const slo_metrics_1 = require("./slo-metrics");
const connector_retry_1 = require("./connector-retry");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('codex-connector-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
function readInstructionBundle(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    return typeof value.agent_specific_prompt === 'string'
        ? value
        : undefined;
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.codexConnectorRouter = (0, express_1.Router)();
// Parse JSON text body (since /api/a2a uses express.text())
exports.codexConnectorRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST /execute -- Execute a task via Codex CLI
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/execute', async (req, res) => {
    let executionStartedAt = null;
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Codex CLI connector is not running. Start it first via POST /start.',
            }));
            return;
        }
        const { prompt, taskId, requester, artifacts } = req.body || {};
        const instructionBundle = readInstructionBundle(req.body?.instructionBundle);
        const effectivePrompt = typeof prompt === 'string' && prompt.trim().length > 0
            ? prompt
            : instructionBundle?.agent_specific_prompt;
        if (!effectivePrompt) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required field: prompt (string) or instructionBundle.agent_specific_prompt',
                details: { missing_fields: ['prompt', 'instructionBundle.agent_specific_prompt'] },
            }));
            return;
        }
        // Create a task in the lifecycle service if no taskId is provided
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        let effectiveTaskId = taskId;
        if (!effectiveTaskId) {
            const createResult = lifecycle.createTask({
                workspace_id: req.body.workspace_id || 'default',
                thread_id: req.body.thread_id || (0, task_lifecycle_service_1.generateId)('thr'),
                requester: {
                    agent_id: requester?.id || 'api-caller',
                    platform: requester?.platform || 'recoder_web',
                    name: requester?.name || 'API Caller',
                },
                assignee: {
                    agent_id: 'codex-connector',
                    platform: 'codex',
                    name: 'OpenAI Codex CLI Connector',
                },
                connector: {
                    connector_id: 'codex-cli',
                    platform: 'codex',
                    protocol: 'jsonrpc',
                },
                payload: { kind: 'text', text: effectivePrompt },
                tags: ['codex-connector'],
            });
            if (!createResult.ok) {
                sendError(res, createResult.httpStatus, createResult.error);
                return;
            }
            effectiveTaskId = createResult.data.id;
        }
        const input = {
            taskId: effectiveTaskId,
            prompt: effectivePrompt,
            instructionBundle,
            workspaceId: req.body.workspace_id,
            threadId: req.body.thread_id,
            requester: {
                id: requester?.id || 'api-caller',
                name: requester?.name || 'API Caller',
                platform: requester?.platform || 'recoder_web',
            },
            artifacts,
        };
        executionStartedAt = Date.now();
        const result = await (0, connector_retry_1.withConnectorRetry)(() => runtime.executeTask(input));
        (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
            connectorId: 'codex',
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
                connectorId: 'codex',
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
exports.codexConnectorRouter.get('/status', (_req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        const state = runtime.getState();
        sendSuccess(res, {
            connector: 'codex-cli',
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
// POST /start -- Start Codex CLI process
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/start', async (req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (runtime.isRunning()) {
            const state = runtime.getState();
            sendSuccess(res, {
                message: 'Codex CLI connector is already running',
                ...state,
            });
            return;
        }
        await runtime.start();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Codex CLI connector started successfully',
            ...state,
        }, 201);
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to start Codex connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to start Codex CLI connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /stop -- Stop Codex CLI process
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/stop', async (_req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendSuccess(res, {
                message: 'Codex CLI connector is already stopped',
                ...runtime.getState(),
            });
            return;
        }
        await runtime.stop();
        sendSuccess(res, {
            message: 'Codex CLI connector stopped',
            ...runtime.getState(),
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to stop Codex connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to stop Codex CLI connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /restart -- Restart Codex CLI process
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/restart', async (_req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        await runtime.restart();
        const state = runtime.getState();
        sendSuccess(res, {
            message: 'Codex CLI connector restarted successfully',
            ...state,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error({ err: message }, 'Failed to restart Codex connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to restart Codex CLI connector: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /task/:taskId -- Get task status from Codex
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.get('/task/:taskId', async (req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Codex CLI connector is not running.',
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
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to get task status: ${message}`,
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /task/:taskId/cancel -- Cancel a running task
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/task/:taskId/cancel', async (req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Codex CLI connector is not running.',
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
        const result = await runtime.cancelTask(taskId);
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
// POST /approval/:approvalId -- Respond to an approval request
// ---------------------------------------------------------------------------
exports.codexConnectorRouter.post('/approval/:approvalId', async (req, res) => {
    try {
        const runtime = (0, codex_connector_runtime_service_1.getCodexConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'Codex CLI connector is not running.',
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
        sendSuccess(res, {
            approvalId,
            approved,
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
