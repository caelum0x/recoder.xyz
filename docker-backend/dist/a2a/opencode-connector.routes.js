"use strict";
/**
 * @module opencode-connector.routes
 *
 * REST API surface for the experimental OpenCode connector.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.opencodeConnectorRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const opencode_connector_runtime_service_1 = require("./opencode-connector-runtime.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const slo_metrics_1 = require("./slo-metrics");
const connector_retry_1 = require("./connector-retry");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('opencode-connector-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
function readProviderKeys(body) {
    const candidate = body.providerKeys ?? body.provider_keys;
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
        return undefined;
    }
    const record = candidate;
    const output = {};
    if (typeof record.openrouter === 'string')
        output.openrouter = record.openrouter;
    if (typeof record.openai === 'string')
        output.openai = record.openai;
    if (typeof record.anthropic === 'string')
        output.anthropic = record.anthropic;
    if (typeof record.gemini === 'string')
        output.gemini = record.gemini;
    return Object.keys(output).length > 0 ? output : undefined;
}
function readStringRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    const record = Object.entries(value).filter(([, entry]) => typeof entry === 'string');
    if (record.length === 0) {
        return undefined;
    }
    return Object.fromEntries(record);
}
function readRequesterPlatform(value) {
    if (typeof value !== 'string') {
        return 'recoder_app';
    }
    switch (value) {
        case 'claude_code':
        case 'codex':
        case 'cursor':
        case 'windsurf':
        case 'replit':
        case 'recoder_app':
        case 'recoder_pm':
        case 'recoder_agency':
        case 'custom':
            return value;
        default:
            return 'recoder_app';
    }
}
function readProjectId(body) {
    const candidate = body.projectId ?? body.project_id;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate.trim() : undefined;
}
const OPENCODE_AGENT_NAMES = new Set(['build', 'explore', 'general', 'plan']);
function toPromptInputModel(model) {
    if (typeof model !== 'string') {
        return {};
    }
    const trimmed = model.trim();
    if (!trimmed) {
        return {};
    }
    if (OPENCODE_AGENT_NAMES.has(trimmed)) {
        return { agent: trimmed };
    }
    const slashIndex = trimmed.indexOf('/');
    if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
        return {
            providerID: trimmed.slice(0, slashIndex),
            modelID: trimmed.slice(slashIndex + 1),
        };
    }
    return {};
}
exports.opencodeConnectorRouter = (0, express_1.Router)();
exports.opencodeConnectorRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
exports.opencodeConnectorRouter.post('/execute', async (req, res) => {
    let executionStartedAt = null;
    try {
        const body = (req.body || {});
        const prompt = body.prompt;
        const requester = (body.requester || {});
        const taskId = typeof body.taskId === 'string' ? body.taskId : undefined;
        const requesterPlatform = readRequesterPlatform(requester.platform);
        const projectId = readProjectId(body);
        if (!prompt || typeof prompt !== 'string') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required field: prompt (string)',
                details: { missing_fields: ['prompt'] },
            }));
            return;
        }
        const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        let effectiveTaskId = taskId;
        if (!effectiveTaskId) {
            const createResult = lifecycle.createTask({
                workspace_id: typeof body.workspace_id === 'string' ? body.workspace_id : projectId || 'default',
                thread_id: typeof body.thread_id === 'string' ? body.thread_id : (0, task_lifecycle_service_1.generateId)('thr'),
                requester: {
                    agent_id: typeof requester.id === 'string' ? requester.id : 'api-caller',
                    platform: requesterPlatform,
                    name: typeof requester.name === 'string' ? requester.name : 'API Caller',
                },
                assignee: {
                    agent_id: 'opencode-connector',
                    platform: 'custom',
                    name: 'OpenCode Connector',
                },
                connector: {
                    connector_id: 'opencode-cli',
                    platform: 'custom',
                    protocol: 'jsonrpc',
                },
                payload: { kind: 'text', text: prompt },
                tags: ['opencode-connector'],
            });
            if (!createResult.ok) {
                sendError(res, createResult.httpStatus, createResult.error);
                return;
            }
            effectiveTaskId = createResult.data.id;
        }
        if (projectId) {
            executionStartedAt = Date.now();
            try {
                // Route through centralized opencode service when available,
                // otherwise fall back to sandbox-embedded exec via /api/opencode/:projectId
                if (process.env.OPENCODE_SERVICE_URL) {
                    const { promptProject, setProviderKey } = await Promise.resolve().then(() => __importStar(require('./opencode-service-adapter.js')));
                    // Forward BYOK keys
                    const keys = readProviderKeys(body);
                    if (keys) {
                        const keyEntries = [
                            ['openrouter', keys.openrouter],
                            ['openai', keys.openai],
                            ['anthropic', keys.anthropic],
                            ['google', keys.gemini],
                        ];
                        for (const [provider, key] of keyEntries) {
                            if (key)
                                await setProviderKey(provider, key).catch(() => { });
                        }
                    }
                    const result = await promptProject(projectId, {
                        content: prompt,
                        ...toPromptInputModel(body.model),
                    });
                    const textParts = result.parts
                        .filter((p) => p.type === 'text' || p.type === 'tool-result')
                        .map((p) => String(p.text || p.content || ''))
                        .filter(Boolean);
                    (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
                        connectorId: 'opencode',
                        success: true,
                        durationMs: Date.now() - executionStartedAt,
                    });
                    sendSuccess(res, {
                        taskId: effectiveTaskId,
                        resultText: textParts.join('\n\n'),
                        sessionId: result.info.sessionID,
                        raw: result,
                    });
                    return;
                }
                // Legacy fallback: self-fetch through /api/opencode/:projectId (sandbox exec path)
                const headers = { 'Content-Type': 'application/json' };
                const authHeader = req.headers.authorization;
                if (typeof authHeader === 'string' && authHeader.trim()) {
                    headers.Authorization = authHeader;
                }
                const upstream = await fetch(`http://127.0.0.1:${process.env.PORT || '3100'}/api/opencode/${encodeURIComponent(projectId)}`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({
                        prompt,
                        model: typeof body.model === 'string' ? body.model : undefined,
                        sessionId: typeof body.sessionId === 'string' ? body.sessionId : typeof body.session_id === 'string' ? body.session_id : undefined,
                        continueSession: body.continueSession === true || body.continue_session === true,
                        providerKeys: readProviderKeys(body),
                    }),
                });
                const payload = await upstream.json().catch(async () => ({ error: await upstream.text().catch(() => 'Sandbox execution failed') }));
                (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
                    connectorId: 'opencode',
                    success: upstream.ok && payload.success !== false,
                    durationMs: Date.now() - executionStartedAt,
                });
                if (upstream.ok && payload.success !== false) {
                    sendSuccess(res, {
                        taskId: effectiveTaskId,
                        resultText: payload.text || payload.output || '',
                        sessionId: payload.sessionId,
                        raw: payload,
                    });
                    return;
                }
                sendError(res, upstream.status || 500, (0, a2a_1.buildA2AError)({
                    code: upstream.status === 401
                        ? a2a_1.A2AErrorCodeEnum.AuthenticationFailed
                        : upstream.status === 403
                            ? a2a_1.A2AErrorCodeEnum.AuthorizationDenied
                            : a2a_1.A2AErrorCodeEnum.ConnectorError,
                    message: payload.error || 'Sandbox-backed OpenCode execution failed',
                    details: { taskId: effectiveTaskId, projectId },
                }));
                return;
            }
            catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
                    connectorId: 'opencode',
                    success: false,
                    durationMs: Date.now() - executionStartedAt,
                });
                sendError(res, 500, (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.ConnectorError,
                    message: errMsg,
                    details: { taskId: effectiveTaskId, projectId },
                }));
                return;
            }
        }
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorUnavailable,
                message: 'OpenCode connector is not running. Start it first via POST /start.',
            }));
            return;
        }
        const input = {
            taskId: effectiveTaskId,
            prompt,
            workspaceId: typeof body.workspace_id === 'string' ? body.workspace_id : undefined,
            threadId: typeof body.thread_id === 'string' ? body.thread_id : undefined,
            cwd: typeof body.cwd === 'string' ? body.cwd : typeof body.directory === 'string' ? body.directory : undefined,
            model: typeof body.model === 'string' ? body.model : undefined,
            agent: typeof body.agent === 'string' ? body.agent : undefined,
            variant: typeof body.variant === 'string' ? body.variant : undefined,
            sessionId: typeof body.sessionId === 'string' ? body.sessionId : typeof body.session_id === 'string' ? body.session_id : undefined,
            continueSession: body.continueSession === true || body.continue_session === true,
            providerKeys: readProviderKeys(body),
            env: readStringRecord(body.env),
            requester: {
                id: typeof requester.id === 'string' ? requester.id : 'api-caller',
                name: typeof requester.name === 'string' ? requester.name : 'API Caller',
                platform: requesterPlatform,
            },
        };
        executionStartedAt = Date.now();
        const result = await (0, connector_retry_1.withConnectorRetry)(() => runtime.executeTask(input));
        (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
            connectorId: 'opencode',
            success: result.success,
            durationMs: Date.now() - executionStartedAt,
        });
        if (result.success) {
            sendSuccess(res, {
                taskId: result.taskId,
                resultText: result.resultText,
                sessionId: result.sessionId,
                raw: result.raw,
            });
            return;
        }
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: result.error || 'Task execution failed',
            details: { taskId: result.taskId },
        }));
    }
    catch (error) {
        if (executionStartedAt !== null) {
            (0, slo_metrics_1.getA2ASloMetrics)().recordConnectorExecution({
                connectorId: 'opencode',
                success: false,
                durationMs: Date.now() - executionStartedAt,
            });
        }
        logger.error({ error }, 'Unhandled error in POST /execute for OpenCode');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error during OpenCode task execution',
        }));
    }
});
exports.opencodeConnectorRouter.get('/status', (_req, res) => {
    try {
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        sendSuccess(res, {
            connector: 'opencode-cli',
            ...runtime.getState(),
        });
    }
    catch (error) {
        logger.error({ error }, 'Unhandled error in GET /status for OpenCode');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching OpenCode connector status',
        }));
    }
});
exports.opencodeConnectorRouter.post('/start', async (_req, res) => {
    try {
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        if (runtime.isRunning()) {
            sendSuccess(res, {
                message: 'OpenCode connector is already running',
                ...runtime.getState(),
            });
            return;
        }
        await runtime.start();
        sendSuccess(res, {
            message: 'OpenCode connector started successfully',
            ...runtime.getState(),
        }, 201);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to start OpenCode connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to start OpenCode connector: ${message}`,
        }));
    }
});
exports.opencodeConnectorRouter.post('/stop', async (_req, res) => {
    try {
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        if (!runtime.isRunning()) {
            sendSuccess(res, {
                message: 'OpenCode connector is already stopped',
                ...runtime.getState(),
            });
            return;
        }
        await runtime.stop();
        sendSuccess(res, {
            message: 'OpenCode connector stopped successfully',
            ...runtime.getState(),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to stop OpenCode connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to stop OpenCode connector: ${message}`,
        }));
    }
});
exports.opencodeConnectorRouter.post('/restart', async (_req, res) => {
    try {
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        await runtime.restart();
        sendSuccess(res, {
            message: 'OpenCode connector restarted successfully',
            ...runtime.getState(),
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to restart OpenCode connector');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to restart OpenCode connector: ${message}`,
        }));
    }
});
exports.opencodeConnectorRouter.get('/task/:taskId', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required path parameter: taskId',
            }));
            return;
        }
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        const result = await runtime.getTaskStatus(taskId);
        sendSuccess(res, result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to get OpenCode task status');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to get OpenCode task status: ${message}`,
        }));
    }
});
exports.opencodeConnectorRouter.post('/task/:taskId/cancel', async (req, res) => {
    try {
        const taskId = req.params.taskId;
        if (!taskId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required path parameter: taskId',
            }));
            return;
        }
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        const result = await runtime.cancelTask(taskId, reason);
        sendSuccess(res, result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to cancel OpenCode task');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to cancel OpenCode task: ${message}`,
        }));
    }
});
exports.opencodeConnectorRouter.post('/approval/:approvalId', async (req, res) => {
    try {
        const approvalId = req.params.approvalId;
        if (!approvalId) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Missing required path parameter: approvalId',
            }));
            return;
        }
        const approved = req.body?.approved === true;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined;
        const runtime = (0, opencode_connector_runtime_service_1.getOpencodeConnectorRuntime)();
        const result = await runtime.respondToApproval(approvalId, approved, reason);
        sendSuccess(res, result);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.error({ error: message }, 'Failed to respond to OpenCode approval');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.ConnectorError,
            message: `Failed to respond to OpenCode approval: ${message}`,
        }));
    }
});
