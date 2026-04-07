"use strict";
/**
 * @module rest-adapter.routes
 *
 * Express route handlers for the REST Protocol Adapter management API.
 *
 * Provides the following endpoints under the `/api/a2a/adapters/rest` prefix:
 *
 * | Method | Path                       | Description                          |
 * |--------|----------------------------|--------------------------------------|
 * | POST   | /                          | Register a new REST adapter          |
 * | GET    | /                          | List all registered adapters         |
 * | GET    | /:adapterId                | Get adapter details                  |
 * | DELETE | /:adapterId                | Unregister an adapter                |
 * | POST   | /:adapterId/health-check   | Run health check on adapter          |
 * | POST   | /:adapterId/execute        | Execute a task via adapter           |
 *
 * All error responses use the canonical A2A error taxonomy.
 *
 * P17-009: REST Adapter Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.restAdapterRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const task_lifecycle_middleware_1 = require("../task-lifecycle.middleware");
const logger_1 = require("../../logger");
const rest_adapter_1 = require("./rest-adapter");
const logger = (0, logger_1.createLogger)('a2a-rest-adapter-routes');
// ---------------------------------------------------------------------------
// Default local identity for adapters created via the API
// ---------------------------------------------------------------------------
const DEFAULT_LOCAL_IDENTITY = {
    id: 'recoder-backend',
    name: 'Recoder Backend',
    platform: 'recoder',
};
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
exports.restAdapterRouter = (0, express_1.Router)();
// Parse JSON text bodies (same pattern as collaboration routes -- the
// parent `/api/a2a` mount uses express.text() for raw verification).
exports.restAdapterRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST / -- Register a new REST adapter
// ---------------------------------------------------------------------------
exports.restAdapterRouter.post('/', (req, res) => {
    try {
        const body = req.body ?? {};
        const { adapterId, baseUrl, auth, timeoutMs, maxRetries, retryDelayMs, maxRetryDelayMs } = body;
        // Validate required fields
        if (!adapterId || typeof adapterId !== 'string' || adapterId.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'adapterId must be a non-empty string',
            }));
            return;
        }
        if (!baseUrl || typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'baseUrl must be a non-empty string',
            }));
            return;
        }
        // Check for duplicate registration
        if ((0, rest_adapter_1.getRestAdapter)(adapterId)) {
            sendError(res, 409, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: `REST adapter already registered with id: ${adapterId}`,
            }));
            return;
        }
        // Build adapter config
        const config = {
            adapterId: adapterId.trim(),
            baseUrl: baseUrl.trim(),
            auth: auth ?? { type: 'none' },
            timeoutMs: typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : 30_000,
            maxRetries: typeof maxRetries === 'number' && maxRetries >= 0 ? maxRetries : 3,
            retryDelayMs: typeof retryDelayMs === 'number' && retryDelayMs > 0 ? retryDelayMs : 1_000,
            maxRetryDelayMs: typeof maxRetryDelayMs === 'number' && maxRetryDelayMs > 0 ? maxRetryDelayMs : 16_000,
            localIdentity: { ...DEFAULT_LOCAL_IDENTITY },
        };
        const adapter = new rest_adapter_1.RestAdapter(config);
        (0, rest_adapter_1.registerRestAdapter)(adapter);
        sendSuccess(res, adapter.getState(), 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/adapters/rest');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while registering REST adapter',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET / -- List all registered adapters
// ---------------------------------------------------------------------------
exports.restAdapterRouter.get('/', (_req, res) => {
    try {
        const adapters = (0, rest_adapter_1.listRestAdapters)().map((a) => a.getState());
        sendSuccess(res, { adapters, count: adapters.length });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/adapters/rest');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing REST adapters',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:adapterId -- Get adapter details
// ---------------------------------------------------------------------------
exports.restAdapterRouter.get('/:adapterId', (req, res) => {
    try {
        const adapter = (0, rest_adapter_1.getRestAdapter)(req.params.adapterId);
        if (!adapter) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorNotFound,
                message: `REST adapter not found: ${req.params.adapterId}`,
            }));
            return;
        }
        sendSuccess(res, adapter.getState());
    }
    catch (err) {
        logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in GET /api/a2a/adapters/rest/:adapterId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching REST adapter',
        }));
    }
});
// ---------------------------------------------------------------------------
// DELETE /:adapterId -- Unregister adapter
// ---------------------------------------------------------------------------
exports.restAdapterRouter.delete('/:adapterId', (req, res) => {
    try {
        const { adapterId } = req.params;
        // Check existence first
        if (!(0, rest_adapter_1.getRestAdapter)(adapterId)) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorNotFound,
                message: `REST adapter not found: ${adapterId}`,
            }));
            return;
        }
        (0, rest_adapter_1.unregisterRestAdapter)(adapterId);
        sendSuccess(res, { adapterId, unregistered: true });
    }
    catch (err) {
        logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in DELETE /api/a2a/adapters/rest/:adapterId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while unregistering REST adapter',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:adapterId/health-check -- Run health check
// ---------------------------------------------------------------------------
exports.restAdapterRouter.post('/:adapterId/health-check', async (req, res) => {
    try {
        const adapter = (0, rest_adapter_1.getRestAdapter)(req.params.adapterId);
        if (!adapter) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorNotFound,
                message: `REST adapter not found: ${req.params.adapterId}`,
            }));
            return;
        }
        const result = await adapter.checkHealth();
        sendSuccess(res, result);
    }
    catch (err) {
        logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in POST /api/a2a/adapters/rest/:adapterId/health-check');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while checking REST adapter health',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:adapterId/execute -- Execute a task via adapter
// ---------------------------------------------------------------------------
exports.restAdapterRouter.post('/:adapterId/execute', async (req, res) => {
    try {
        const adapter = (0, rest_adapter_1.getRestAdapter)(req.params.adapterId);
        if (!adapter) {
            sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.ConnectorNotFound,
                message: `REST adapter not found: ${req.params.adapterId}`,
            }));
            return;
        }
        const body = req.body ?? {};
        const { taskId, prompt, targetAgent, intent, metadata } = body;
        // Validate required fields
        if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'prompt must be a non-empty string',
            }));
            return;
        }
        if (!targetAgent || typeof targetAgent !== 'object') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'targetAgent must be an object with id, name, and platform',
            }));
            return;
        }
        const result = await adapter.executeTask({
            targetAgent,
            taskId: taskId ?? `task-${Date.now()}`,
            prompt,
            intent,
            metadata,
        });
        sendSuccess(res, result);
    }
    catch (err) {
        logger.error({ err, adapterId: req.params.adapterId }, 'unhandled error in POST /api/a2a/adapters/rest/:adapterId/execute');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while executing task via REST adapter',
        }));
    }
});
