"use strict";
/**
 * @module multi-dispatch.routes
 *
 * Express route handlers for multi-agent dispatch within workspaces.
 *
 * | Method | Path                                       | Description           |
 * |--------|--------------------------------------------|-----------------------|
 * | POST   | /:wsId/dispatch                            | Multi-agent dispatch  |
 * | GET    | /:wsId/dispatch/:dispatchId                | Dispatch status       |
 * | GET    | /:wsId/dispatch/:dispatchId/results        | Aggregated results    |
 * | POST   | /:wsId/dispatch/:dispatchId/cancel         | Cancel all tasks      |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiDispatchRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const multi_dispatch_service_1 = require("./multi-dispatch.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-multi-dispatch-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
// ---------------------------------------------------------------------------
// Router (mounted under /api/a2a/workspaces/:wsId/dispatch)
// ---------------------------------------------------------------------------
exports.multiDispatchRouter = (0, express_1.Router)({ mergeParams: true });
// ── POST / — Multi-agent dispatch ───────────────────────────────────────
exports.multiDispatchRouter.post('/', async (req, res) => {
    try {
        const wsId = req.params.wsId;
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body?.prompt) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'prompt is required',
            }));
        }
        const dispatch = await (0, multi_dispatch_service_1.getMultiDispatchService)().dispatch(wsId, {
            prompt: body.prompt,
            agentIds: body.agentIds,
            autoRoute: body.autoRoute,
            orchestrationPattern: body.orchestrationPattern,
            aggregationStrategy: body.aggregationStrategy,
            priority: body.priority,
            worktreeIsolation: body.worktreeIsolation,
        });
        sendSuccess(res, dispatch, 201);
    }
    catch (err) {
        logger.error({ err }, 'failed to dispatch');
        sendError(res, err.message?.includes('not found') ? 404 : 500, (0, a2a_1.buildA2AError)({
            code: err.message?.includes('not found') ? a2a_1.A2AErrorCodeEnum.TaskNotFound : a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message || 'Failed to dispatch',
        }));
    }
});
// ── GET /:dispatchId — Dispatch status ──────────────────────────────────
exports.multiDispatchRouter.get('/:dispatchId', (req, res) => {
    const record = (0, multi_dispatch_service_1.getMultiDispatchService)().get(req.params.dispatchId);
    if (!record) {
        return sendError(res, 404, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
            message: `Dispatch not found: ${req.params.dispatchId}`,
        }));
    }
    sendSuccess(res, record);
});
// ── GET /:dispatchId/results — Aggregated results ───────────────────────
exports.multiDispatchRouter.get('/:dispatchId/results', (req, res) => {
    const record = (0, multi_dispatch_service_1.getMultiDispatchService)().getResults(req.params.dispatchId);
    if (!record) {
        return sendError(res, 404, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
            message: `Dispatch not found: ${req.params.dispatchId}`,
        }));
    }
    sendSuccess(res, {
        dispatchId: record.dispatchId,
        status: record.status,
        results: record.results,
        taskIds: record.taskIds,
        agentIds: record.agentIds,
    });
});
// ── POST /:dispatchId/cancel — Cancel all tasks ─────────────────────────
exports.multiDispatchRouter.post('/:dispatchId/cancel', async (req, res) => {
    try {
        const cancelled = await (0, multi_dispatch_service_1.getMultiDispatchService)().cancel(req.params.dispatchId);
        if (!cancelled) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Dispatch not found: ${req.params.dispatchId}`,
            }));
        }
        sendSuccess(res, { cancelled: true });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
