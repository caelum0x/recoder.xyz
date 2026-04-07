"use strict";
/**
 * @module context-bridge.routes
 *
 * Express route handlers for the A2A Context Bridge.
 *
 * Provides the following endpoints under the `/api/a2a/context` prefix:
 *
 * | Method | Path                    | Description                                    |
 * |--------|-------------------------|------------------------------------------------|
 * | POST   | /:taskId                | Create or append a context entry for a task    |
 * | GET    | /:taskId                | Get all context entries for a task              |
 * | GET    | /:taskId/:type          | Get context entries of a specific type          |
 * | POST   | /transfer               | Transfer context from one task to another       |
 * | DELETE | /:taskId                | Delete all context for a task                   |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.contextBridgeRouter = void 0;
const express_1 = require("express");
const context_bridge_service_1 = require("./context-bridge.service");
const context_bridge_middleware_1 = require("./context-bridge.middleware");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-context-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, message, details) {
    const response = {
        success: false,
        error: { message, ...(details ? { details } : {}) },
    };
    res.status(httpStatus).json(response);
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.contextBridgeRouter = (0, express_1.Router)();
// Parse JSON from text body (A2A routes use express.text())
exports.contextBridgeRouter.use(context_bridge_middleware_1.parseContextJsonBody);
// ---------------------------------------------------------------------------
// POST /transfer -- Transfer context between tasks
// (Must be defined BEFORE /:taskId to avoid route conflict)
// ---------------------------------------------------------------------------
exports.contextBridgeRouter.post('/transfer', context_bridge_middleware_1.validateTransferContextBody, async (req, res) => {
    try {
        const service = (0, context_bridge_service_1.getContextBridgeService)();
        const { fromTaskId, toTaskId } = req.body;
        const result = await service.transferContext(fromTaskId, toTaskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/context/transfer');
        sendError(res, 500, 'Internal server error while transferring context');
    }
});
// ---------------------------------------------------------------------------
// POST /:taskId -- Create/append context for a task
// ---------------------------------------------------------------------------
exports.contextBridgeRouter.post('/:taskId', context_bridge_middleware_1.validateTaskIdParam, context_bridge_middleware_1.validateCreateContextBody, async (req, res) => {
    try {
        const { taskId } = req.params;
        const { type, data } = req.body;
        const service = (0, context_bridge_service_1.getContextBridgeService)();
        const result = await service.createContext(taskId, type, data);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data, 201);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/context/:taskId');
        sendError(res, 500, 'Internal server error while creating context');
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId -- Get all context for a task
// ---------------------------------------------------------------------------
exports.contextBridgeRouter.get('/:taskId', context_bridge_middleware_1.validateTaskIdParam, async (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, context_bridge_service_1.getContextBridgeService)();
        const result = await service.getContext(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/context/:taskId');
        sendError(res, 500, 'Internal server error while fetching context');
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId/:type -- Get context by type for a task
// ---------------------------------------------------------------------------
exports.contextBridgeRouter.get('/:taskId/:type', context_bridge_middleware_1.validateTaskIdParam, context_bridge_middleware_1.validateContextTypeParam, async (req, res) => {
    try {
        const { taskId, type } = req.params;
        const service = (0, context_bridge_service_1.getContextBridgeService)();
        const result = await service.getContextByType(taskId, type);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, {
            task_id: taskId,
            type,
            entries: result.data,
            count: result.data.length,
        });
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId, type: req.params.type }, 'unhandled error in GET /api/a2a/context/:taskId/:type');
        sendError(res, 500, 'Internal server error while fetching context by type');
    }
});
// ---------------------------------------------------------------------------
// DELETE /:taskId -- Delete all context for a task
// ---------------------------------------------------------------------------
exports.contextBridgeRouter.delete('/:taskId', context_bridge_middleware_1.validateTaskIdParam, async (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, context_bridge_service_1.getContextBridgeService)();
        const result = await service.deleteContext(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in DELETE /api/a2a/context/:taskId');
        sendError(res, 500, 'Internal server error while deleting context');
    }
});
