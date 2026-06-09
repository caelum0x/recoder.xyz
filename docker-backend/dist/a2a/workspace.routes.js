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
const approval_gate_service_1 = require("./approval-gate.service");
const delegation_chain_service_1 = require("./delegation-chain.service");
const agent_registry_service_1 = require("./agent-registry.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const run_context_service_1 = require("./run-context.service");
const logger_1 = require("../logger");
const a2a_gateway_1 = require("../a2a-gateway");
const logger = (0, logger_1.createLogger)('a2a-workspace-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
function mapDelegationStatus(status) {
    switch (status) {
        case 'accepted':
            return 'accepted';
        case 'completed':
            return 'completed';
        case 'rejected':
        case 'failed':
        case 'cancelled':
            return 'declined';
        case 'pending':
        case 'in-progress':
        default:
            return 'active';
    }
}
function inferWorkspaceIdForDelegation(delegation) {
    const directWorkspace = delegation.metadata?.workspaceId;
    if (directWorkspace)
        return directWorkspace;
    const channelId = delegation.metadata?.channelId;
    if (!channelId)
        return null;
    const workspace = (0, workspace_service_1.getWorkspaceService)().list().find((ws) => ws.defaultChannelId === channelId);
    return workspace?.workspaceId || null;
}
function mapDelegationToHandoffRecord(delegation, workspaceId) {
    return {
        handoffId: delegation.delegationId,
        workspaceId,
        fromAgentId: delegation.fromAgentId,
        toAgentId: delegation.toAgentId,
        taskId: delegation.metadata?.sourceTaskId || delegation.metadata?.handoffSourceTaskId || '',
        intent: (delegation.metadata?.intent || 'handoff'),
        context: delegation.metadata ? { ...delegation.metadata } : {},
        status: mapDelegationStatus(delegation.status),
        createdAt: delegation.createdAt,
    };
}
async function buildWorkspaceAgentRows(workspaceId) {
    const agentIds = (0, workspace_service_1.getWorkspaceService)().listAgents(workspaceId);
    if (!agentIds)
        return null;
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    const registry = (0, agent_registry_service_1.getAgentRegistryService)();
    return agentIds.map((agentId) => {
        const connected = bridge.getAgent(agentId);
        const sessions = bridge.getSessionsForAgent(agentId);
        const registryAgent = registry.getWithHealth(agentId);
        const bridgeCapabilities = Array.from(new Set(sessions.flatMap((session) => session.capabilities)));
        const skillNames = registryAgent?.card.skills.map((skill) => skill.name) ?? [];
        const status = connected
            ? connected.status
            : registryAgent?.health.online
                ? 'online'
                : 'offline';
        return {
            agentId,
            name: registryAgent?.identity.name ?? agentId,
            platform: registryAgent?.identity.platform ?? 'custom',
            status,
            isLocal: sessions.length > 0,
            capabilities: bridgeCapabilities,
            skills: skillNames,
            lastSeen: connected?.lastHeartbeat ?? registryAgent?.health.lastHeartbeat ?? '',
            connectedSessionCount: sessions.length,
            registry: registryAgent
                ? {
                    online: registryAgent.health.online,
                    lastHeartbeat: registryAgent.health.lastHeartbeat,
                    reconnectCount: registryAgent.lifecycle.reconnectCount,
                    registrationCount: registryAgent.lifecycle.registrationCount,
                }
                : null,
        };
    });
}
async function buildWorkspaceTaskRows(workspaceId, limit = 200) {
    const rawTasks = (0, task_lifecycle_service_1.getTaskLifecycleService)().list({
        workspace_id: workspaceId,
        limit,
    });
    return Promise.all(rawTasks.map((task) => (0, run_context_service_1.buildTaskRunSummary)(task)));
}
function buildWorkspaceApprovalRows(workspaceId) {
    return (0, approval_gate_service_1.getApprovalGateService)().listByWorkspace(workspaceId);
}
function buildWorkspaceHandoffRows(workspaceId, activeOnly = false) {
    const activeStatuses = ['pending', 'accepted', 'in-progress'];
    const rawDelegations = (0, delegation_chain_service_1.getDelegationChainService)().list({
        statuses: activeOnly ? activeStatuses : undefined,
    });
    return rawDelegations
        .map((delegation) => {
        const delegationWorkspaceId = inferWorkspaceIdForDelegation(delegation);
        return delegationWorkspaceId === workspaceId
            ? mapDelegationToHandoffRecord(delegation, delegationWorkspaceId)
            : null;
    })
        .filter((value) => value !== null);
}
async function buildWorkspaceControlPlaneSnapshot(wsId) {
    const ws = (0, workspace_service_1.getWorkspaceService)().get(wsId);
    if (!ws)
        return null;
    const [agents, tasks, bridgeSessions] = await Promise.all([
        buildWorkspaceAgentRows(ws.workspaceId),
        buildWorkspaceTaskRows(ws.workspaceId),
        (0, a2a_gateway_1.listBridgeSessionsForBinding)({ workspaceId: ws.workspaceId }),
    ]);
    if (!agents)
        return null;
    const approvals = buildWorkspaceApprovalRows(ws.workspaceId);
    const handoffs = buildWorkspaceHandoffRows(ws.workspaceId);
    const tasksByState = tasks.reduce((acc, task) => {
        acc[task.state] = (acc[task.state] || 0) + 1;
        return acc;
    }, {});
    const summary = tasks.reduce((acc, task) => {
        acc.totalTasks += 1;
        if (task.state === 'working' || task.state === 'input-required') {
            acc.activeTasks += 1;
        }
        if (task.claim) {
            acc.claimedTasks += 1;
        }
        acc.evidenceItems += typeof task.runtime?.evidenceCount === 'number' ? task.runtime.evidenceCount : 0;
        acc.previews += typeof task.runtime?.previewCount === 'number' ? task.runtime.previewCount : 0;
        acc.artifacts += typeof task.runtime?.artifactCount === 'number' ? task.runtime.artifactCount : 0;
        acc.logEvidence += typeof task.runtime?.logCount === 'number' ? task.runtime.logCount : 0;
        acc.runtimeEvidence += typeof task.runtime?.runtimeCount === 'number' ? task.runtime.runtimeCount : 0;
        acc.orchestrationRuns += task.controlPlane ? 1 : 0;
        acc.orchestrationLifecycleEvents += typeof task.controlPlane?.lifecycleCount === 'number' ? task.controlPlane.lifecycleCount : 0;
        acc.orchestrationEvidenceItems += typeof task.controlPlane?.evidenceCount === 'number' ? task.controlPlane.evidenceCount : 0;
        return acc;
    }, {
        totalAgents: agents.length,
        onlineAgents: agents.filter((agent) => agent.status !== 'offline').length,
        offlineAgents: agents.filter((agent) => agent.status === 'offline').length,
        localBridgeSessions: agents.reduce((sum, agent) => sum + agent.connectedSessionCount, 0),
        pairedBridgeSessions: bridgeSessions.length,
        healthyPairedBridgeSessions: bridgeSessions.filter((session) => session.registry.online).length,
        unhealthyPairedBridgeSessions: bridgeSessions.filter((session) => !session.registry.online).length,
        totalTasks: 0,
        activeTasks: 0,
        claimedTasks: 0,
        tasksByState,
        pendingApprovals: approvals.filter((approval) => approval.status === 'pending' || approval.status === 'escalated').length,
        totalApprovals: approvals.length,
        activeHandoffs: handoffs.filter((handoff) => handoff.status === 'active' || handoff.status === 'accepted').length,
        totalHandoffs: handoffs.length,
        evidenceItems: 0,
        previews: 0,
        artifacts: 0,
        logEvidence: 0,
        runtimeEvidence: 0,
        orchestrationRuns: 0,
        orchestrationLifecycleEvents: 0,
        orchestrationEvidenceItems: 0,
    });
    return {
        workspace: ws,
        summary,
        agents,
        tasks,
        approvals,
        handoffs,
        bridgeSessions: bridgeSessions.map((session) => ({
            bridgeId: session.bridgeId,
            durableIdentity: session.durableIdentity,
            scope: session.scope || null,
            agentId: session.agentId || null,
            agentName: session.agentName || null,
            agentPlatform: session.agentPlatform || null,
            workspaceId: session.workspaceId || null,
            projectId: session.projectId || null,
            capabilities: session.capabilities || [],
            normalizedCapabilities: session.capabilities || [],
            metadata: session.metadata || null,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
            heartbeat: session.heartbeat,
            registry: session.registry,
        })),
    };
}
function buildWorkspaceContextPackageFromSnapshot(snapshot) {
    return {
        contextVersion: '2026-05-12',
        workspace: {
            workspaceId: snapshot.workspace.workspaceId,
            name: snapshot.workspace.name,
            projectId: snapshot.workspace.projectId,
            ownerId: snapshot.workspace.ownerId,
            defaultChannelId: snapshot.workspace.defaultChannelId,
            settings: snapshot.workspace.settings,
            createdAt: snapshot.workspace.createdAt,
            updatedAt: snapshot.workspace.updatedAt,
        },
        summary: snapshot.summary,
        agents: snapshot.agents.map((agent) => ({
            agentId: agent.agentId,
            name: agent.name,
            platform: agent.platform,
            status: agent.status,
            capabilities: agent.capabilities,
            skills: agent.skills,
            lastSeen: agent.lastSeen,
            connectedSessionCount: agent.connectedSessionCount,
            isLocal: agent.isLocal,
        })),
        recentTasks: snapshot.tasks.slice(0, 20).map((task) => ({
            id: task.id,
            prompt: task.prompt,
            state: task.state,
            workspace_id: task.workspace_id,
            assignee_agent_id: task.assignee_agent_id,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt,
            claim: task.claim ?? null,
            approvalStatus: task.approval?.status ?? null,
            handoffStatus: task.handoff?.status ?? null,
            review: task.review ?? null,
            delivery: task.delivery ?? null,
            runtime: task.runtime ?? null,
            controlPlane: task.controlPlane ?? null,
        })),
        pendingApprovals: snapshot.approvals
            .filter((approval) => approval.status === 'pending' || approval.status === 'escalated')
            .map((approval) => ({
            approvalId: approval.approvalId,
            taskId: typeof approval.details.sourceTaskId === 'string'
                ? approval.details.sourceTaskId
                : typeof approval.details.taskId === 'string'
                    ? approval.details.taskId
                    : null,
            status: approval.status,
            action: approval.action,
            requester: approval.requestingAgentId,
            target: approval.targetAgentId,
            createdAt: approval.createdAt,
        })),
        activeHandoffs: snapshot.handoffs
            .filter((handoff) => handoff.status === 'active' || handoff.status === 'accepted')
            .map((handoff) => ({
            handoffId: handoff.handoffId,
            taskId: handoff.taskId,
            fromAgentId: handoff.fromAgentId,
            toAgentId: handoff.toAgentId,
            intent: handoff.intent,
            status: handoff.status,
            createdAt: handoff.createdAt,
        })),
        bridgeSessions: snapshot.bridgeSessions.map((session) => ({
            bridgeId: session.bridgeId,
            durableIdentity: session.durableIdentity,
            agentId: session.agentId,
            agentName: session.agentName,
            agentPlatform: session.agentPlatform,
            workspaceId: session.workspaceId,
            projectId: session.projectId,
            capabilities: session.capabilities,
            normalizedCapabilities: session.normalizedCapabilities,
            registry: session.registry,
            createdAt: session.createdAt,
            expiresAt: session.expiresAt,
        })),
    };
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
        buildWorkspaceAgentRows(req.params.wsId).then((agents) => {
            if (!agents) {
                sendError(res, 404, (0, a2a_1.buildA2AError)({
                    code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                    message: `Workspace not found: ${req.params.wsId}`,
                }));
                return;
            }
            sendSuccess(res, { agents, total: agents.length });
        }).catch((err) => {
            sendError(res, 500, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InternalError,
                message: err.message,
            }));
        });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/control-plane — Unified workspace control-plane snapshot ──
exports.workspaceRouter.get('/:wsId/control-plane', async (req, res) => {
    try {
        const snapshot = await buildWorkspaceControlPlaneSnapshot(req.params.wsId);
        if (!snapshot) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, snapshot);
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/context — Structured Recoder Space context package ───────
exports.workspaceRouter.get('/:wsId/context', async (req, res) => {
    try {
        const snapshot = await buildWorkspaceControlPlaneSnapshot(req.params.wsId);
        if (!snapshot) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        sendSuccess(res, buildWorkspaceContextPackageFromSnapshot(snapshot));
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
exports.workspaceRouter.get('/:wsId/tasks', async (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        const tasks = await buildWorkspaceTaskRows(ws.workspaceId, Number(req.query.limit || 200));
        sendSuccess(res, { tasks, total: tasks.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/approvals — List workspace approvals ─────────────────────
exports.workspaceRouter.get('/:wsId/approvals', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        const statusQuery = String(req.query.status || '').trim().toLowerCase();
        const approvals = statusQuery === 'pending'
            ? (0, approval_gate_service_1.getApprovalGateService)().listPending(ws.workspaceId)
            : buildWorkspaceApprovalRows(ws.workspaceId);
        sendSuccess(res, { approvals, total: approvals.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── GET /:wsId/handoffs — List workspace handoffs ───────────────────────
exports.workspaceRouter.get('/:wsId/handoffs', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        const requestedStatus = String(req.query.status || '').trim().toLowerCase();
        const handoffs = buildWorkspaceHandoffRows(ws.workspaceId, requestedStatus === 'active');
        sendSuccess(res, { handoffs, total: handoffs.length });
    }
    catch (err) {
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: err.message,
        }));
    }
});
// ── POST /:wsId/handoffs — Create workspace handoff ─────────────────────
exports.workspaceRouter.post('/:wsId/handoffs', (req, res) => {
    try {
        const ws = (0, workspace_service_1.getWorkspaceService)().get(req.params.wsId);
        if (!ws) {
            return sendError(res, 404, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
                message: `Workspace not found: ${req.params.wsId}`,
            }));
        }
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const fromAgentId = String(body?.fromAgentId || '').trim();
        const toAgentId = String(body?.toAgentId || '').trim();
        const taskId = String(body?.taskId || '').trim();
        const intent = String(body?.intent || 'handoff').trim().toLowerCase();
        const context = body?.context && typeof body.context === 'object' ? body.context : {};
        if (!fromAgentId || !toAgentId || !taskId) {
            return sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidParams,
                message: 'fromAgentId, toAgentId, and taskId are required',
            }));
        }
        const prompt = typeof context.prompt === 'string' &&
            context.prompt
            ? String(context.prompt)
            : `Continue ${intent} for task ${taskId}`;
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().delegate({
            fromAgentId,
            toAgentId,
            prompt,
            metadata: {
                workspaceId: ws.workspaceId,
                projectId: ws.projectId,
                channelId: ws.defaultChannelId,
                sourceTaskId: taskId,
                intent: intent === 'delegate' || intent === 'review' ? intent : 'handoff',
            },
        });
        void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
            taskId,
            eventType: 'handoff.initiated',
            actorId: toAgentId,
            state: 'working',
            detail: {
                delegationId: delegation.delegationId,
                intent: intent === 'delegate' || intent === 'review' ? intent : 'handoff',
                fromAgentId,
                toAgentId,
            },
        });
        sendSuccess(res, mapDelegationToHandoffRecord(delegation, ws.workspaceId), 201);
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
