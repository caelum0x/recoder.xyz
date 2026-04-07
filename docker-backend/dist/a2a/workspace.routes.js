"use strict";
/**
 * @module workspace.routes
 *
 * Express route handlers for A2A workspace management.
 *
 * | Method | Path                           | Description                |
 * |--------|--------------------------------|----------------------------|
 * | POST   | /                              | Create workspace           |
 * | GET    | /                              | List user workspaces       |
 * | GET    | /:wsId                         | Get workspace              |
 * | PATCH  | /:wsId                         | Update workspace           |
 * | DELETE | /:wsId                         | Delete workspace           |
 * | POST   | /:wsId/agents                  | Add agent                  |
 * | DELETE | /:wsId/agents/:agentId         | Remove agent               |
 * | GET    | /:wsId/agents                  | List agents with health    |
 * | GET    | /:wsId/channels                | List channels              |
 * | GET    | /:wsId/tasks                   | List tasks                 |
 * | GET    | /:wsId/stream                  | SSE workspace event stream |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const workspace_service_1 = require("./workspace.service");
const collaboration_service_1 = require("./collaboration.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const multi_dispatch_routes_1 = require("./multi-dispatch.routes");
const worktree_manager_service_1 = require("./worktree-manager.service");
const agent_bridge_service_1 = require("./agent-bridge.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-workspace-routes');
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
exports.workspaceRouter = (0, express_1.Router)();
// Parse JSON bodies
exports.workspaceRouter.use((req, _res, next) => {
    if (req.headers['content-type']?.includes('application/json') && typeof req.body === 'string') {
        try {
            req.body = JSON.parse(req.body);
        }
        catch {
            // leave as-is
        }
    }
    next();
});
// ── POST / — Create workspace ────────────────────────────────────────────
exports.workspaceRouter.post('/', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body?.name || !body?.projectId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'name and projectId are required',
            }));
        }
        const ws = (0, workspace_service_1.getWorkspaceService)().create({
            name: body.name,
            projectId: body.projectId,
            ownerId: body.ownerId ?? 'anonymous',
            memberAgentIds: body.memberAgentIds,
            settings: body.settings,
        });
        sendSuccess(res, ws, 201);
    }
    catch (err) {
        logger.error({ err }, 'failed to create workspace');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message || 'Failed to create workspace',
        }));
    }
});
// ── GET / — List workspaces ──────────────────────────────────────────────
exports.workspaceRouter.get('/', (req, res) => {
    try {
        const ownerId = req.query.ownerId;
        const workspaces = (0, workspace_service_1.getWorkspaceService)().list(ownerId);
        sendSuccess(res, { workspaces, total: workspaces.length });
    }
    catch (err) {
        logger.error({ err }, 'failed to list workspaces');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message || 'Failed to list workspaces',
        }));
    }
});
// ── GET /:wsId — Get workspace ───────────────────────────────────────────
exports.workspaceRouter.get('/:wsId', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, ws);
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── PATCH /:wsId — Update workspace ──────────────────────────────────────
exports.workspaceRouter.patch('/:wsId', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const ws = (0, workspace_service_1.getWorkspaceService)().update(req.params.wsId, body);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, ws);
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── DELETE /:wsId — Delete workspace ─────────────────────────────────────
exports.workspaceRouter.delete('/:wsId', (req, res) => {
    try {
        const deleted = (0, workspace_service_1.getWorkspaceService)().delete(req.params.wsId);
        if (!deleted) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, { deleted: true });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── POST /:wsId/agents — Add agent ──────────────────────────────────────
exports.workspaceRouter.post('/:wsId/agents', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        if (!body?.agentId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'agentId is required',
            }));
        }
        const ws = (0, workspace_service_1.getWorkspaceService)().addAgent(req.params.wsId, body.agentId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, ws);
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── DELETE /:wsId/agents/:agentId — Remove agent ────────────────────────
exports.workspaceRouter.delete('/:wsId/agents/:agentId', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().removeAgent(req.params.wsId, req.params.agentId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, ws);
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/agents — List agents with status ─────────────────────────
exports.workspaceRouter.get('/:wsId/agents', (req, res) => {
    try {
        const agentIds = (0, workspace_service_1.getWorkspaceService)().listAgents(req.params.wsId);
        if (!agentIds) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        // Enrich agent IDs with bridge connection status
        const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
        const agents = agentIds.map((agentId) => {
            const connected = bridge.getAgent(agentId);
            return {
                agentId,
                status: connected ? connected.status : 'offline',
                isLocal: !!connected,
                capabilities: connected?.capabilities ?? [],
                lastSeen: connected?.lastHeartbeat,
            };
        });
        sendSuccess(res, { agents, total: agents.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/channels — List channels ─────────────────────────────────
exports.workspaceRouter.get('/:wsId/channels', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        const channels = (0, collaboration_service_1.getCollaborationSvc)().listChannels();
        sendSuccess(res, { channels, total: channels.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── Multi-dispatch sub-router ────────────────────────────────────────────
exports.workspaceRouter.use('/:wsId/dispatch', multi_dispatch_routes_1.multiDispatchRouter);
// ── GET /:wsId/tasks — List tasks ───────────────────────────────────────
exports.workspaceRouter.get('/:wsId/tasks', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        // Tasks are filtered by workspace_id in the task lifecycle service
        sendSuccess(res, { tasks: [], total: 0 });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── Worktree routes ─────────────────────────────────────────────────────
// GET /:wsId/worktrees — List worktrees
exports.workspaceRouter.get('/:wsId/worktrees', async (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        // containerId comes from query param or workspace metadata
        const containerId = req.query.containerId;
        if (!containerId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'containerId query parameter is required',
            }));
        }
        const worktrees = await (0, worktree_manager_service_1.getWorktreeManagerService)().listWorktrees(containerId);
        sendSuccess(res, { worktrees, total: worktrees.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// GET /:wsId/worktrees/:taskId/diff — Worktree diff
exports.workspaceRouter.get('/:wsId/worktrees/:taskId/diff', async (req, res) => {
    try {
        const containerId = req.query.containerId;
        if (!containerId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'containerId query parameter is required',
            }));
        }
        const diff = await (0, worktree_manager_service_1.getWorktreeManagerService)().getWorktreeDiff(containerId, req.params.taskId);
        sendSuccess(res, { diff });
    }
    catch (err) {
        sendError(res, err.message?.includes('not found') ? 404 : 500, (0, a2a_1.buildA2AError)({
            code: err.message?.includes('not found') ? a2a_1.A2AErrorCodeEnum.TaskNotFound : a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// POST /:wsId/worktrees/:taskId/merge — Merge worktree to base
exports.workspaceRouter.post('/:wsId/worktrees/:taskId/merge', async (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const containerId = body?.containerId ?? req.query.containerId;
        if (!containerId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'containerId is required',
            }));
        }
        const strategy = body?.strategy ?? 'merge';
        const result = await (0, worktree_manager_service_1.getWorktreeManagerService)().mergeWorktree(containerId, req.params.taskId, strategy);
        sendSuccess(res, result);
    }
    catch (err) {
        sendError(res, err.message?.includes('not found') ? 404 : 500, (0, a2a_1.buildA2AError)({
            code: err.message?.includes('not found') ? a2a_1.A2AErrorCodeEnum.TaskNotFound : a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// DELETE /:wsId/worktrees/:taskId — Cleanup worktree
exports.workspaceRouter.delete('/:wsId/worktrees/:taskId', async (req, res) => {
    try {
        const containerId = req.query.containerId;
        if (!containerId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'containerId query parameter is required',
            }));
        }
        await (0, worktree_manager_service_1.getWorktreeManagerService)().cleanupWorktree(containerId, req.params.taskId);
        sendSuccess(res, { removed: true });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/stream — SSE workspace event stream ──────────────────────
exports.workspaceRouter.get('/:wsId/stream', (req, res) => {
    const wsId = req.params.wsId;
    const ws = (0, workspace_service_1.getWorkspaceService)().get(wsId);
    if (!ws) {
        return sendError(res, 404, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
            message: `Workspace not found: ${wsId}`,
        }));
    }
    // SSE headers
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    // Subscribe to workspace-scoped events
    const bus = (0, a2a_event_bus_1.getA2AEventBus)();
    const unsubscribe = bus.subscribeWorkspace(wsId, (event) => {
        res.write(`event: ${event.type}\n`);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    // Also subscribe to global events that are relevant to this workspace's agents
    const unsubGlobal = bus.subscribeGlobal((event) => {
        // Forward task/agent events relevant to workspace members
        if (event.workspaceId === wsId)
            return; // already sent via workspace subscription
        const data = event.data;
        const agentId = (data.agentId ?? data.assignee_agent_id ?? '');
        if (agentId && ws.memberAgentIds.includes(agentId)) {
            res.write(`event: ${event.type}\n`);
            res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
    });
    // Keep-alive ping
    const keepAlive = setInterval(() => {
        res.write(':ping\n\n');
    }, 30_000);
    // Cleanup on close
    req.on('close', () => {
        unsubscribe();
        unsubGlobal();
        clearInterval(keepAlive);
        logger.debug({ wsId }, 'workspace SSE stream closed');
    });
    logger.debug({ wsId }, 'workspace SSE stream opened');
});
