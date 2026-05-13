"use strict";
/**
 * @module task-lifecycle.routes
 *
 * Express route handlers for A2A task lifecycle operations.
 *
 * Provides the following endpoints under the `/api/a2a/tasks` prefix:
 *
 * | Method | Path                          | Description                              |
 * |--------|-------------------------------|------------------------------------------|
 * | POST   | /                             | Create a new task (state: submitted)     |
 * | PATCH  | /:taskId/transition           | Transition task to a new state           |
 * | GET    | /:taskId                      | Get a task with full envelope            |
 * | GET    | /:taskId/history              | Get transition history for a task        |
 * | GET    | /                             | List tasks with optional filters         |
 * | POST   | /:taskId/execute              | Execute a task via Pi/OpenCode agent     |
 *
 * All error responses use the canonical A2A error taxonomy from
 * `@recoder/shared/a2a/schemas`.
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
exports.taskLifecycleRouter = void 0;
const express_1 = require("express");
const a2a_1 = require("@recoder/shared/a2a");
const agent_bridge_service_1 = require("./agent-bridge.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const run_context_service_1 = require("./run-context.service");
const workspace_service_1 = require("./workspace.service");
const agent_registry_service_1 = require("./agent-registry.service");
const capability_matcher_service_1 = require("./capability-matcher.service");
const multi_dispatch_service_1 = require("./multi-dispatch.service");
const approval_gate_service_1 = require("./approval-gate.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const task_lifecycle_middleware_1 = require("./task-lifecycle.middleware");
const logger_1 = require("../logger");
const memory_store_1 = require("./memory-store");
const logger = (0, logger_1.createLogger)('a2a-task-routes');
function sendSuccess(res, data, statusCode = 200) {
    const response = { success: true, data };
    res.status(statusCode).json(response);
}
function sendError(res, httpStatus, error) {
    const response = { success: false, error };
    res.status(httpStatus).json(response);
}
function extractBridgePrompt(payload) {
    if (typeof payload === 'string') {
        return payload;
    }
    if (Array.isArray(payload)) {
        for (const part of payload) {
            const prompt = extractBridgePrompt(part);
            if (prompt)
                return prompt;
        }
        return '';
    }
    if (!payload || typeof payload !== 'object') {
        return '';
    }
    const record = payload;
    if (record.kind === 'text' && typeof record.text === 'string') {
        return record.text;
    }
    if (typeof record.task === 'string') {
        return record.task;
    }
    if (typeof record.prompt === 'string') {
        return record.prompt;
    }
    if (typeof record.content === 'string') {
        return record.content;
    }
    return '';
}
function extractBridgeIntent(payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return undefined;
    }
    const intent = payload.intent;
    return typeof intent === 'string' && intent.trim() ? intent : undefined;
}
function parseRoutingHints(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value;
}
function deriveConnectorProtocol(platform) {
    if (platform === 'claude_code')
        return 'mcp';
    if (platform === 'codex' || platform === 'cursor' || platform === 'windsurf')
        return 'jsonrpc';
    return 'rest';
}
function readRecord(value) {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : undefined;
}
function emitReviewLifecycleEvents(input) {
    const review = readRecord(input.metadataPatch.handoff);
    const merge = readRecord(input.metadataPatch.merge);
    const now = new Date().toISOString();
    const bus = (0, a2a_event_bus_1.getA2AEventBus)();
    if (review?.status === 'review-accepted') {
        bus.publish({
            id: `evt_${Date.now()}_review_${input.taskId}`,
            type: a2a_event_bus_1.A2AEventType.ReviewAccepted,
            timestamp: now,
            taskId: input.taskId,
            workspaceId: input.workspaceId,
            data: {
                taskId: input.taskId,
                status: review.status,
                intent: typeof review.intent === 'string' ? review.intent : null,
                reviewTarget: typeof review.reviewTarget === 'string' ? review.reviewTarget : null,
                reviewPath: typeof review.reviewPath === 'string' ? review.reviewPath : null,
                assignedBy: typeof review.assignedBy === 'string' ? review.assignedBy : input.triggeredBy,
            },
        });
    }
    if (merge?.status === 'merge-requested') {
        bus.publish({
            id: `evt_${Date.now()}_merge_${input.taskId}`,
            type: a2a_event_bus_1.A2AEventType.MergeRequested,
            timestamp: now,
            taskId: input.taskId,
            workspaceId: input.workspaceId,
            data: {
                taskId: input.taskId,
                status: merge.status,
                branchName: typeof merge.branchName === 'string' ? merge.branchName : null,
                baseBranch: typeof merge.baseBranch === 'string' ? merge.baseBranch : null,
                suggestedAction: typeof merge.suggestedAction === 'string' ? merge.suggestedAction : null,
                requestedBy: input.triggeredBy,
            },
        });
    }
}
function buildReviewHistoryEntries(input) {
    const review = readRecord(input.metadataPatch.handoff);
    const merge = readRecord(input.metadataPatch.merge);
    const now = new Date().toISOString();
    const entries = [];
    if (review?.status === 'review-accepted') {
        entries.push({
            at: now,
            type: 'review.accepted',
            taskId: input.taskId,
            actor: input.triggeredBy,
            status: review.status,
            intent: typeof review.intent === 'string' ? review.intent : null,
            reviewTarget: typeof review.reviewTarget === 'string' ? review.reviewTarget : null,
            reviewPath: typeof review.reviewPath === 'string' ? review.reviewPath : null,
            note: input.reason,
        });
    }
    if (merge?.status === 'merge-requested') {
        entries.push({
            at: now,
            type: 'merge.requested',
            taskId: input.taskId,
            actor: input.triggeredBy,
            status: merge.status,
            branchName: typeof merge.branchName === 'string' ? merge.branchName : null,
            baseBranch: typeof merge.baseBranch === 'string' ? merge.baseBranch : null,
            suggestedAction: typeof merge.suggestedAction === 'string' ? merge.suggestedAction : null,
            note: input.reason,
        });
    }
    return entries;
}
async function resolveAutoRouteAssignee(input) {
    const workspace = (0, workspace_service_1.getWorkspaceService)().get(input.workspaceId);
    if (!workspace) {
        throw (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.TaskNotFound,
            message: `Workspace not found: ${input.workspaceId}`,
        });
    }
    const prompt = extractBridgePrompt(input.payload);
    const routingPlan = (0, multi_dispatch_service_1.deriveRoutingPlan)(prompt, input.routingHints);
    const matcher = (0, capability_matcher_service_1.getCapabilityMatcher)();
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    const registry = (0, agent_registry_service_1.getAgentRegistryService)();
    const ranked = matcher.matchAgents({
        ...routingPlan.requirements,
        tags: [],
    }).matches
        .filter((candidate) => workspace.memberAgentIds.includes(candidate.agentId))
        .map((candidate) => ({
        ...candidate,
        onlineBonus: bridge.isAgentOnline(candidate.agentId) ? 15 : 0,
        totalScore: candidate.score + (bridge.isAgentOnline(candidate.agentId) ? 15 : 0),
    }))
        .sort((a, b) => b.totalScore - a.totalScore);
    const fallbackAgentId = workspace.memberAgentIds.find((agentId) => bridge.isAgentOnline(agentId))
        ?? workspace.memberAgentIds[0];
    const selected = ranked[0];
    const selectedAgentId = selected?.agentId ?? fallbackAgentId;
    if (!selectedAgentId) {
        throw (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InvalidParams,
            message: `Workspace ${input.workspaceId} has no eligible member agents`,
        });
    }
    const registryAgent = registry.get(selectedAgentId);
    const platform = registryAgent?.identity.platform ?? selected?.platform ?? routingPlan.requirements.preferredPlatform ?? 'custom';
    return {
        assignee: {
            agent_id: selectedAgentId,
            platform,
            name: registryAgent?.identity.name,
        },
        connector: {
            connector_id: registryAgent?.identity.id ? `registry-${registryAgent.identity.id}` : `auto-${selectedAgentId}`,
            platform,
            protocol: deriveConnectorProtocol(platform),
            metadata: {
                autoRouted: true,
            },
        },
        routing: {
            runtimeCategory: routingPlan.runtimeCategory,
            routingRequirements: routingPlan.requirements,
            intentCategory: routingPlan.intent.category,
            intentConfidence: routingPlan.intent.confidence,
            routingReason: selected?.reason ?? 'Fallback to first available workspace member',
            selectedBy: selected ? 'capability-matcher' : 'workspace-fallback',
            onlineAtRouting: bridge.isAgentOnline(selectedAgentId),
        },
    };
}
async function gateTaskForApproval(task, input) {
    const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    const approvalGate = (0, approval_gate_service_1.getApprovalGateService)();
    const approval = approvalGate.createRequest({
        workspaceId: task.workspace_id,
        requestingAgentId: input.requesterAgentId,
        targetAgentId: input.assigneeAgentId,
        action: input.action,
        details: {
            prompt: input.prompt,
            taskId: task.id,
            threadId: task.thread_id,
            ...(input.routing ? { routing: input.routing } : {}),
        },
        timeoutMs: 300_000,
    });
    lifecycle.updateTaskMetadata(task.id, {
        metadataPatch: {
            approval: {
                approvalId: approval.approvalId,
                status: approval.status,
                action: input.action,
                targetAgentId: input.assigneeAgentId,
            },
            ...(input.routing ? { routing: input.routing } : {}),
        },
        triggeredBy: 'approval-gate',
        reason: 'Task approval requested',
    });
    lifecycle.startTask(task.id, 'approval-gate');
    const gated = lifecycle.requestInput(task.id, `Awaiting approval for ${input.action} to ${input.assigneeAgentId}`, 'approval-gate');
    const pending = gated.ok ? gated.data : task;
    approvalGate.onResolved(approval.approvalId, (resolved) => {
        lifecycle.updateTaskMetadata(task.id, {
            metadataPatch: {
                approval: {
                    approvalId: resolved.approvalId,
                    status: resolved.status,
                    action: resolved.action,
                    targetAgentId: resolved.targetAgentId,
                    resolvedAt: resolved.resolvedAt,
                    resolvedBy: resolved.resolvedBy,
                },
                ...(input.routing ? { routing: input.routing } : {}),
            },
            triggeredBy: 'approval-gate',
            reason: `Task approval ${resolved.status}`,
        });
        if (resolved.status === 'granted') {
            const resumed = lifecycle.startTask(task.id, 'approval-gate');
            if (resumed.ok) {
                void dispatchTaskToBridgeIfOnline(resumed.data);
            }
            return;
        }
        lifecycle.cancelTask(task.id, `Approval ${resolved.status}`, 'approval-gate');
    });
    (0, a2a_event_bus_1.getA2AEventBus)().publish({
        id: `evt_${Date.now()}_${approval.approvalId}`,
        type: a2a_event_bus_1.A2AEventType.ApprovalRequested,
        timestamp: new Date().toISOString(),
        data: { approval, taskId: task.id },
        taskId: task.id,
        workspaceId: task.workspace_id,
    });
    return pending;
}
async function dispatchTaskToBridgeIfOnline(task) {
    const assigneeId = task.assignee?.agent_id;
    if (!assigneeId)
        return;
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    if (!bridge.isAgentOnline(assigneeId)) {
        return;
    }
    const prompt = extractBridgePrompt(task.payload);
    const intent = extractBridgeIntent(task.payload);
    // Fetch agent's recent memory context before dispatch
    const connected = bridge.getAgent(assigneeId);
    const memoryContext = connected?.userId && prompt
        ? await (0, memory_store_1.getRecentContext)({ query: prompt, userId: connected.userId })
        : [];
    const delivered = bridge.sendToAgent(assigneeId, {
        type: 'task.assigned',
        taskId: task.id,
        prompt,
        ...(intent ? { intent } : {}),
        context: {
            source: 'a2a-rest',
            from: task.requester?.agent_id || 'unknown',
            workspace_id: task.workspace_id,
            thread_id: task.thread_id,
            trace_id: task.trace_id,
            connector: task.connector,
            payload: task.payload,
            ...(memoryContext.length > 0 ? { memoryContext } : {}),
        },
    });
    if (delivered) {
        if (connected)
            connected.status = 'working';
        logger.info({ taskId: task.id, assigneeId, memoryEntries: memoryContext.length }, 'REST-created task dispatched to bridge-connected agent');
    }
    else {
        logger.warn({ taskId: task.id, assigneeId }, 'failed to dispatch REST-created task to bridge-connected agent');
    }
}
// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter = (0, express_1.Router)();
// All routes expect JSON bodies. Since the parent A2A mount may use
// express.text() for raw verification, we parse it back first.
exports.taskLifecycleRouter.use(task_lifecycle_middleware_1.parseJsonTextBody);
// ---------------------------------------------------------------------------
// POST / -- Create a new task
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.post('/', task_lifecycle_middleware_1.validateCreateTaskBody, async (req, res) => {
    try {
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const routingHints = parseRoutingHints(req.body.routing_hints);
        const wantsAutoRoute = req.body.auto_route === true;
        const resolvedAssignment = wantsAutoRoute
            ? await resolveAutoRouteAssignee({
                workspaceId: req.body.workspace_id,
                payload: req.body.payload,
                routingHints,
            })
            : null;
        const workspace = (0, workspace_service_1.getWorkspaceService)().get(req.body.workspace_id);
        const assignee = resolvedAssignment?.assignee ?? req.body.assignee;
        const connector = resolvedAssignment?.connector ?? req.body.connector;
        const metadata = {
            ...(readRecord(req.body.metadata) ?? {}),
            ...(resolvedAssignment?.routing ? { routing: resolvedAssignment.routing } : {}),
        };
        const input = {
            workspace_id: req.body.workspace_id,
            thread_id: req.body.thread_id,
            trace_id: req.body.trace_id,
            parent_id: req.body.parent_id,
            requester: req.body.requester,
            assignee,
            connector,
            payload: req.body.payload,
            metadata,
            tags: req.body.tags,
        };
        const result = service.createTask(input);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        const createdTask = result.data;
        const prompt = extractBridgePrompt(createdTask.payload);
        const requiresApproval = Boolean(workspace?.settings.approvalRequired &&
            createdTask.requester.agent_id !== createdTask.assignee.agent_id);
        if (requiresApproval) {
            const gatedTask = await gateTaskForApproval(createdTask, {
                requesterAgentId: createdTask.requester.agent_id,
                assigneeAgentId: createdTask.assignee.agent_id,
                action: wantsAutoRoute ? 'auto-route' : 'delegate',
                prompt,
                routing: resolvedAssignment?.routing,
            });
            sendSuccess(res, gatedTask, 201);
            return;
        }
        // Bridge dispatch is best-effort and async (memory lookup) — fire-and-forget.
        void dispatchTaskToBridgeIfOnline(createdTask);
        sendSuccess(res, createdTask, 201);
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in POST /api/a2a/tasks');
        if (err && typeof err === 'object' && 'code' in err && 'message' in err) {
            sendError(res, 400, err);
            return;
        }
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while creating task',
        }));
    }
});
// ---------------------------------------------------------------------------
// PATCH /:taskId/transition -- Transition task state
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.patch('/:taskId/transition', task_lifecycle_middleware_1.validateTransitionBody, (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const input = {
            target_state: req.body.target_state,
            reason: req.body.reason,
            triggered_by: req.body.triggered_by,
            result: req.body.result,
            error: req.body.error,
        };
        const result = service.transitionTask(taskId, input);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in PATCH /api/a2a/tasks/:taskId/transition');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while transitioning task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId -- Get task with full envelope
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        // Guard against matching the literal string "undefined" or empty
        if (!taskId || taskId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'taskId parameter is required',
            }));
            return;
        }
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.getTask(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId/history -- Get transition history
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/:taskId/history', (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.getTaskHistory(taskId);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, {
            task_id: taskId,
            transitions: result.data,
            transition_count: result.data.length,
        });
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/history');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching task history',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET /:taskId/context -- Unified run context view
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/:taskId/context', async (req, res) => {
    try {
        const { taskId } = req.params;
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const taskResult = service.getTask(taskId);
        if (!taskResult.ok) {
            sendError(res, taskResult.httpStatus, taskResult.error);
            return;
        }
        const context = await (0, run_context_service_1.buildTaskRunContext)(taskResult.data);
        sendSuccess(res, context);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in GET /api/a2a/tasks/:taskId/context');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while fetching task context',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:taskId/metadata -- Merge metadata into a task without state change
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.post('/:taskId/metadata', (req, res) => {
    try {
        const { taskId } = req.params;
        const metadataPatch = readRecord(req.body?.metadataPatch);
        const reason = typeof req.body?.reason === 'string' && req.body.reason.trim().length > 0
            ? req.body.reason.trim()
            : 'Task metadata updated';
        const triggeredBy = typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim().length > 0
            ? req.body.triggeredBy.trim()
            : 'external-client';
        if (!metadataPatch) {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InvalidEnvelope,
                message: 'metadataPatch must be an object',
            }));
            return;
        }
        const taskResult = (0, task_lifecycle_service_1.getTaskLifecycleService)().getTask(taskId);
        if (!taskResult.ok) {
            sendError(res, taskResult.httpStatus, taskResult.error);
            return;
        }
        const historyEntries = buildReviewHistoryEntries({
            taskId,
            metadataPatch,
            triggeredBy,
            reason,
        });
        const existingHistory = Array.isArray(taskResult.data.metadata?.reviewHistory)
            ? taskResult.data.metadata?.reviewHistory.filter((entry) => Boolean(entry))
            : [];
        const metadataPatchWithHistory = historyEntries.length > 0
            ? {
                ...metadataPatch,
                reviewHistory: [...existingHistory, ...historyEntries].slice(-50),
            }
            : metadataPatch;
        const result = (0, task_lifecycle_service_1.getTaskLifecycleService)().updateTaskMetadata(taskId, {
            metadataPatch: metadataPatchWithHistory,
            reason,
            triggeredBy,
        });
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        emitReviewLifecycleEvents({
            taskId,
            workspaceId: result.data.workspace_id,
            metadataPatch: metadataPatchWithHistory,
            triggeredBy,
        });
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/metadata');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while updating task metadata',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:taskId/claim -- Claim a task for exclusive processing by a session
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.post('/:taskId/claim', (req, res) => {
    try {
        const { taskId } = req.params;
        const { session_id, agent_id } = req.body ?? {};
        if (!session_id || typeof session_id !== 'string') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'session_id is required',
            }));
            return;
        }
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const result = service.claimTask(taskId, session_id, typeof agent_id === 'string' ? agent_id : 'unknown');
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, result.data);
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/claim');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while claiming task',
        }));
    }
});
// ---------------------------------------------------------------------------
// GET / -- List tasks with optional filters
// ---------------------------------------------------------------------------
exports.taskLifecycleRouter.get('/', (req, res) => {
    try {
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const filter = {};
        if (typeof req.query.workspace_id === 'string')
            filter.workspace_id = req.query.workspace_id;
        if (typeof req.query.thread_id === 'string')
            filter.thread_id = req.query.thread_id;
        if (typeof req.query.state === 'string')
            filter.state = req.query.state;
        if (typeof req.query.assignee_agent_id === 'string')
            filter.assignee_agent_id = req.query.assignee_agent_id;
        if (typeof req.query.limit === 'string') {
            const parsed = parseInt(req.query.limit, 10);
            if (!isNaN(parsed) && parsed > 0)
                filter.limit = Math.min(parsed, 1000);
        }
        if (typeof req.query.offset === 'string') {
            const parsed = parseInt(req.query.offset, 10);
            if (!isNaN(parsed) && parsed >= 0)
                filter.offset = parsed;
        }
        const result = service.listTasks(filter);
        if (!result.ok) {
            sendError(res, result.httpStatus, result.error);
            return;
        }
        sendSuccess(res, {
            tasks: result.data,
            count: result.data.length,
            filter,
        });
    }
    catch (err) {
        logger.error({ err }, 'unhandled error in GET /api/a2a/tasks');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while listing tasks',
        }));
    }
});
// ---------------------------------------------------------------------------
// POST /:taskId/execute -- Execute a task via Pi or OpenCode agent
// ---------------------------------------------------------------------------
// Takes a task that has a prompt in its payload and dispatches it to the
// coding agent. The agent creates/edits files in the Daytona sandbox and
// returns the result. The task is transitioned to "working" → "completed".
exports.taskLifecycleRouter.post('/:taskId/execute', async (req, res) => {
    try {
        const { taskId } = req.params;
        const { project_id, sandbox_id } = req.body ?? {};
        if (!taskId || taskId === 'undefined') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'taskId parameter is required',
            }));
            return;
        }
        const service = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        // Get the task
        const taskResult = service.getTask(taskId);
        if (!taskResult.ok) {
            sendError(res, taskResult.httpStatus, taskResult.error);
            return;
        }
        const task = taskResult.data;
        const payload = Array.isArray(task.payload) ? task.payload[0] : task.payload;
        const prompt = payload?.prompt || payload?.message || payload?.content;
        if (!prompt || typeof prompt !== 'string') {
            sendError(res, 400, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.MissingEnvelopeField,
                message: 'Task payload must contain a prompt, message, or content field',
            }));
            return;
        }
        // Transition to working
        service.transitionTask(taskId, { target_state: 'working', triggered_by: 'a2a-execute' });
        // Try Pi agent first, then OpenCode
        const targetProjectId = project_id || task.metadata?.project_id || taskId;
        let result;
        if (sandbox_id) {
            try {
                const { promptPiSession } = await Promise.resolve().then(() => __importStar(require('./pi-runtime-adapter.js')));
                result = await promptPiSession(targetProjectId, sandbox_id, prompt);
            }
            catch {
                // Pi unavailable — try OpenCode
            }
        }
        if (!result) {
            try {
                const { handleOpencodeServicePrompt } = await Promise.resolve().then(() => __importStar(require('./opencode-service-handler.js')));
                const ocResult = await handleOpencodeServicePrompt({
                    projectId: targetProjectId,
                    prompt,
                });
                result = {
                    success: ocResult.success,
                    text: ocResult.text,
                };
            }
            catch {
                // OpenCode also unavailable
            }
        }
        if (!result) {
            service.transitionTask(taskId, { target_state: 'failed', reason: 'No coding agent available' });
            sendError(res, 503, (0, a2a_1.buildA2AError)({
                code: a2a_1.A2AErrorCodeEnum.InternalError,
                message: 'No coding agent available to execute the task',
            }));
            return;
        }
        // Transition to completed or failed
        if (result.success) {
            service.transitionTask(taskId, { target_state: 'completed', reason: result.text });
        }
        else {
            service.transitionTask(taskId, { target_state: 'failed', reason: result.text });
        }
        sendSuccess(res, {
            task_id: taskId,
            success: result.success,
            text: result.text,
            files_changed: result.filesChanged || [],
        });
    }
    catch (err) {
        logger.error({ err, taskId: req.params.taskId }, 'unhandled error in POST /api/a2a/tasks/:taskId/execute');
        sendError(res, 500, (0, a2a_1.buildA2AError)({
            code: a2a_1.A2AErrorCodeEnum.InternalError,
            message: 'Internal server error while executing task',
        }));
    }
});
