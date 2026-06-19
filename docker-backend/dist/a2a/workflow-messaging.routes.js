"use strict";
/**
 * @module workflow-messaging.routes
 *
 * HTTP route layer for the A2A workflow engine, agent messaging, and
 * delegation chain services.  Each domain gets its own sub-router and the
 * three are combined into the exported `workflowMessagingRouter`.
 *
 * Mount point (expected):  `/a2a`
 *
 * Routes:
 *   /workflows    — Workflow definition CRUD + execution
 *   /messages     — Agent-to-agent messaging
 *   /delegations  — Delegation chain management
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.workflowMessagingRouter = void 0;
const express_1 = require("express");
const workflow_engine_service_1 = require("./workflow-engine.service");
const agent_messaging_service_1 = require("./agent-messaging.service");
const delegation_chain_service_1 = require("./delegation-chain.service");
const agent_registry_service_1 = require("./agent-registry.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const a2a_gateway_1 = require("../a2a-gateway");
function mapDelegationStatusToLifecycleEvent(status) {
    switch (status) {
        case 'accepted':
            return 'handoff.accepted';
        case 'completed':
            return 'handoff.completed';
        case 'rejected':
        case 'failed':
        case 'cancelled':
            return 'handoff.declined';
        case 'pending':
        case 'in-progress':
        default:
            return 'handoff.initiated';
    }
}
function syncDelegationToTaskMetadata(delegation, patch, reason) {
    const sourceTaskId = delegation.metadata?.sourceTaskId;
    if (!sourceTaskId)
        return;
    const taskService = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    taskService.updateTaskMetadata(sourceTaskId, {
        metadataPatch: {
            handoff: {
                delegationId: delegation.delegationId,
                targetAgentId: delegation.toAgentId,
                status: delegation.status,
                ...(delegation.metadata?.approvalId ? { approvalId: delegation.metadata.approvalId } : {}),
                ...patch,
            },
        },
        triggeredBy: 'workflow-messaging',
        reason,
    });
    void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
        taskId: sourceTaskId,
        eventType: mapDelegationStatusToLifecycleEvent(delegation.status),
        actorId: delegation.toAgentId,
        state: delegation.status === 'completed'
            ? 'completed'
            : delegation.status === 'rejected' || delegation.status === 'failed' || delegation.status === 'cancelled'
                ? 'failed'
                : 'working',
        detail: {
            delegationId: delegation.delegationId,
            targetAgentId: delegation.toAgentId,
            status: delegation.status,
            intent: delegation.metadata?.intent || 'handoff',
            ...(delegation.error ? { error: delegation.error } : {}),
            ...(delegation.result ? { result: delegation.result } : {}),
        },
    });
}
// ---------------------------------------------------------------------------
// Stub executor (kept for reference)
// ---------------------------------------------------------------------------
// const stubExecutor = async (agentId: string, prompt: string): Promise<string> => {
//   return '[stub] ' + agentId + ': ' + prompt.substring(0, 100);
// };
// ---------------------------------------------------------------------------
// Real agent task executor
// ---------------------------------------------------------------------------
/**
 * Execute a task by delegating to a registered agent.
 *
 * For agents with a URL endpoint, POSTs the task and waits up to 30 seconds.
 * For agents without an endpoint, creates the task and returns a reference
 * for async polling.
 */
async function executeAgentTask(agentIdOrRequest, promptArg) {
    const request = typeof agentIdOrRequest === 'string'
        ? {
            workflowId: 'legacy-workflow',
            executionId: 'legacy-execution',
            stepId: 'legacy-step',
            agentId: agentIdOrRequest,
            prompt: promptArg ?? '',
            envelope: null,
            instructionBundle: null,
            context: {},
        }
        : agentIdOrRequest;
    const agentId = request.agentId;
    const prompt = request.instructionBundle?.agent_specific_prompt ?? request.prompt;
    const requestContext = request.context;
    const registry = (0, agent_registry_service_1.getAgentRegistryService)();
    const agent = registry.get(agentId);
    if (!agent) {
        throw new Error(`Agent "${agentId}" not found in registry`);
    }
    const health = registry.getHealth(agentId);
    if (!health?.online) {
        throw new Error(`Agent "${agentId}" is offline`);
    }
    const taskService = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    // Create task using the legacy input format (compatible with existing service)
    const task = taskService.createTask({
        prompt,
        workspace_id: requestContext._workspaceId || 'default',
        thread_id: requestContext._threadId || `workflow-${Date.now()}`,
        assignee_agent_id: agentId,
        requester_agent_id: 'workflow-engine',
    });
    // For REST-based agents with endpoints, POST the task
    if (agent.card?.url) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 30_000);
            const response = await fetch(`${agent.card.url}/tasks`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    taskId: task.id,
                    prompt,
                    ...(request.instructionBundle ? { instructionBundle: request.instructionBundle } : {}),
                }),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            if (!response.ok) {
                taskService.failTask(task.id, {
                    code: 'AGENT_ERROR',
                    category: 'connector',
                    message: `Agent returned ${response.status}`,
                    severity: 'high',
                    retryable: response.status >= 500,
                });
                throw new Error(`Agent "${agentId}" returned ${response.status}`);
            }
            const result = await response.json();
            taskService.completeTask(task.id, { data: result });
            return JSON.stringify(result);
        }
        catch (e) {
            if (e instanceof DOMException && e.name === 'AbortError') {
                taskService.failTask(task.id, {
                    code: 'DELEGATION_TIMEOUT',
                    category: 'connector',
                    message: `Agent "${agentId}" timed out after 30s`,
                    severity: 'high',
                    retryable: true,
                });
                throw new Error(`Agent "${agentId}" timed out after 30s`);
            }
            const msg = e instanceof Error ? e.message : 'Unknown error';
            // Only fail the task if it hasn't already been failed above
            try {
                taskService.failTask(task.id, {
                    code: 'DELEGATION_ERROR',
                    category: 'connector',
                    message: msg,
                    severity: 'high',
                    retryable: false,
                });
            }
            catch {
                // Task may already be in a terminal state from the !response.ok branch
            }
            throw e;
        }
    }
    // For agents without endpoints, return task reference for async polling
    return JSON.stringify({ taskId: task.id, status: 'submitted', agentId });
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sendSuccess(res, data, statusCode = 200) {
    res.status(statusCode).json({ success: true, data });
}
function sendError(res, statusCode, message) {
    res.status(statusCode).json({ success: false, error: { message } });
}
// ---------------------------------------------------------------------------
// Workflow routes
// ---------------------------------------------------------------------------
const workflowRouter = (0, express_1.Router)();
/** POST /workflows — Register a workflow definition */
workflowRouter.post('/', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { workflowId, name, description, steps, timeoutMs, errorStrategy } = body;
        if (!workflowId || typeof workflowId !== 'string' || !workflowId.trim()) {
            return sendError(res, 400, 'workflowId is required');
        }
        if (!name || typeof name !== 'string' || !name.trim()) {
            return sendError(res, 400, 'name is required');
        }
        if (!Array.isArray(steps)) {
            return sendError(res, 400, 'steps must be an array');
        }
        const engine = (0, workflow_engine_service_1.getWorkflowEngine)();
        if (engine.getWorkflow(workflowId)) {
            return sendError(res, 409, `Workflow ${workflowId} is already registered`);
        }
        engine.registerWorkflow({ workflowId, name, description, steps, timeoutMs, errorStrategy });
        sendSuccess(res, engine.getWorkflow(workflowId), 201);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /workflows — List all workflows */
workflowRouter.get('/', (_req, res) => {
    try {
        const workflows = (0, workflow_engine_service_1.getWorkflowEngine)().listWorkflows();
        sendSuccess(res, workflows);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /workflows/:workflowId — Get a workflow */
workflowRouter.get('/:workflowId', (req, res) => {
    try {
        const workflow = (0, workflow_engine_service_1.getWorkflowEngine)().getWorkflow(req.params.workflowId);
        if (!workflow) {
            return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
        }
        sendSuccess(res, workflow);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** DELETE /workflows/:workflowId — Remove a workflow */
workflowRouter.delete('/:workflowId', (req, res) => {
    try {
        const deleted = (0, workflow_engine_service_1.getWorkflowEngine)().removeWorkflow(req.params.workflowId);
        if (!deleted) {
            return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
        }
        sendSuccess(res, { removed: true });
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /workflows/:workflowId/execute — Execute a workflow */
workflowRouter.post('/:workflowId/execute', async (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { input } = body;
        if (typeof input !== 'string') {
            return sendError(res, 400, 'input is required and must be a string');
        }
        const engine = (0, workflow_engine_service_1.getWorkflowEngine)();
        const workflow = engine.getWorkflow(req.params.workflowId);
        if (!workflow) {
            return sendError(res, 404, `Workflow not found: ${req.params.workflowId}`);
        }
        const execution = await engine.execute(req.params.workflowId, input, executeAgentTask);
        sendSuccess(res, execution, 201);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /workflows/executions/:executionId — Get an execution */
workflowRouter.get('/executions/:executionId', (req, res) => {
    try {
        const execution = (0, workflow_engine_service_1.getWorkflowEngine)().getExecution(req.params.executionId);
        if (!execution) {
            return sendError(res, 404, `Execution not found: ${req.params.executionId}`);
        }
        sendSuccess(res, execution);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /workflows/executions/:executionId/cancel — Cancel an execution */
workflowRouter.post('/executions/:executionId/cancel', (req, res) => {
    try {
        const cancelled = (0, workflow_engine_service_1.getWorkflowEngine)().cancelExecution(req.params.executionId);
        if (!cancelled) {
            return sendError(res, 404, `Execution not found or not cancellable: ${req.params.executionId}`);
        }
        sendSuccess(res, { cancelled: true });
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
// ---------------------------------------------------------------------------
// Messaging routes
// ---------------------------------------------------------------------------
const messagingRouter = (0, express_1.Router)();
/** POST /messages — Send a message */
messagingRouter.post('/', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { fromAgentId, toAgentId, type, subject, body: msgBody, correlationId, ttlMs, priority, metadata } = body;
        if (!fromAgentId || !toAgentId || !subject || !msgBody) {
            return sendError(res, 400, 'fromAgentId, toAgentId, subject, and body are required');
        }
        const message = (0, agent_messaging_service_1.getAgentMessagingService)().sendMessage({
            fromAgentId,
            toAgentId,
            type: type ?? 'request',
            subject,
            body: msgBody,
            correlationId,
            ttlMs,
            priority,
            metadata,
        });
        sendSuccess(res, message, 201);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /messages/:messageId — Get a message */
messagingRouter.get('/:messageId', (req, res) => {
    try {
        const message = (0, agent_messaging_service_1.getAgentMessagingService)().getMessage(req.params.messageId);
        if (!message) {
            return sendError(res, 404, `Message not found: ${req.params.messageId}`);
        }
        sendSuccess(res, message);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /messages/:messageId/reply — Reply to a message */
messagingRouter.post('/:messageId/reply', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { body: replyBody, type } = body;
        if (!replyBody || typeof replyBody !== 'string') {
            return sendError(res, 400, 'body is required');
        }
        const reply = (0, agent_messaging_service_1.getAgentMessagingService)().reply(req.params.messageId, replyBody, type);
        if (!reply) {
            return sendError(res, 404, `Message not found: ${req.params.messageId}`);
        }
        sendSuccess(res, reply, 201);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /messages/:messageId/delivered — Mark message as delivered */
messagingRouter.post('/:messageId/delivered', (req, res) => {
    try {
        const svc = (0, agent_messaging_service_1.getAgentMessagingService)();
        const message = svc.getMessage(req.params.messageId);
        if (!message) {
            return sendError(res, 404, `Message not found: ${req.params.messageId}`);
        }
        svc.markDelivered(req.params.messageId);
        sendSuccess(res, svc.getMessage(req.params.messageId));
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /messages/:messageId/read — Mark message as read */
messagingRouter.post('/:messageId/read', (req, res) => {
    try {
        const svc = (0, agent_messaging_service_1.getAgentMessagingService)();
        const message = svc.getMessage(req.params.messageId);
        if (!message) {
            return sendError(res, 404, `Message not found: ${req.params.messageId}`);
        }
        svc.markRead(req.params.messageId);
        sendSuccess(res, svc.getMessage(req.params.messageId));
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /messages/inbox/:agentId — Get agent inbox */
messagingRouter.get('/inbox/:agentId', (req, res) => {
    try {
        const { type, from, unreadOnly, limit } = req.query;
        const inbox = (0, agent_messaging_service_1.getAgentMessagingService)().getInbox({
            agentId: req.params.agentId,
            type: type,
            fromAgentId: from,
            unreadOnly: unreadOnly === 'true',
            limit: limit ? parseInt(limit, 10) : undefined,
        });
        sendSuccess(res, inbox);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /messages/outbox/:agentId — Get agent outbox */
messagingRouter.get('/outbox/:agentId', (req, res) => {
    try {
        const { limit } = req.query;
        const outbox = (0, agent_messaging_service_1.getAgentMessagingService)().getOutbox(req.params.agentId, limit ? parseInt(limit, 10) : undefined);
        sendSuccess(res, outbox);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /messages/threads/:correlationId — Get conversation thread */
messagingRouter.get('/threads/:correlationId', (req, res) => {
    try {
        const thread = (0, agent_messaging_service_1.getAgentMessagingService)().getThread(req.params.correlationId);
        if (!thread) {
            return sendError(res, 404, `Thread not found: ${req.params.correlationId}`);
        }
        sendSuccess(res, thread);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /messages/unread/:agentId — Get unread count */
messagingRouter.get('/unread/:agentId', (req, res) => {
    try {
        const count = (0, agent_messaging_service_1.getAgentMessagingService)().getUnreadCount(req.params.agentId);
        sendSuccess(res, { agentId: req.params.agentId, unreadCount: count });
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /messages/expire — Trigger message expiry */
messagingRouter.post('/expire', (_req, res) => {
    try {
        const expired = (0, agent_messaging_service_1.getAgentMessagingService)().expireMessages();
        sendSuccess(res, { expiredCount: expired });
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
// ---------------------------------------------------------------------------
// Delegation routes
// ---------------------------------------------------------------------------
const delegationRouter = (0, express_1.Router)();
function sendDelegationResponse(res, delegation) {
    sendSuccess(res, delegation);
}
/** POST /delegations — Create a delegation */
delegationRouter.post('/', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { fromAgentId, toAgentId, prompt, priority, parentDelegationId, metadata } = body;
        if (!fromAgentId || !toAgentId || !prompt) {
            return sendError(res, 400, 'fromAgentId, toAgentId, and prompt are required');
        }
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().delegate({
            fromAgentId,
            toAgentId,
            prompt,
            priority,
            parentDelegationId,
            metadata,
        });
        syncDelegationToTaskMetadata(delegation, {}, 'Delegation created via workflow messaging route');
        sendSuccess(res, delegation, 201);
    }
    catch (err) {
        const message = err?.message ?? 'Internal error';
        // Policy violations (self-delegation, circular, depth) return 400
        if (message.includes('not allowed') || message.includes('exceeded') || message.includes('Circular')) {
            return sendError(res, 400, message);
        }
        // Parent not found
        if (message.includes('not found')) {
            return sendError(res, 404, message);
        }
        sendError(res, 500, message);
    }
});
/** GET /delegations/:delegationId — Get a delegation */
delegationRouter.get('/:delegationId', (req, res) => {
    try {
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().getDelegation(req.params.delegationId);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        sendSuccess(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /delegations/:delegationId/accept — Accept a delegation */
delegationRouter.post('/:delegationId/accept', (req, res) => {
    try {
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().accept(req.params.delegationId);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { acceptedAt: delegation.acceptedAt }, 'Delegation accepted via workflow messaging route');
        sendDelegationResponse(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /delegations/:delegationId/reject — Reject a delegation */
delegationRouter.post('/:delegationId/reject', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().reject(req.params.delegationId, body.reason);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { error: delegation.error, completedAt: delegation.completedAt }, 'Delegation rejected via workflow messaging route');
        sendDelegationResponse(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /delegations/:delegationId/complete — Complete a delegation */
delegationRouter.post('/:delegationId/complete', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { result } = body;
        if (!result || typeof result !== 'string') {
            return sendError(res, 400, 'result is required');
        }
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().complete(req.params.delegationId, result);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { result: delegation.result, completedAt: delegation.completedAt }, 'Delegation completed via workflow messaging route');
        sendSuccess(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /delegations/:delegationId/fail — Fail a delegation */
delegationRouter.post('/:delegationId/fail', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const { error } = body;
        if (!error || typeof error !== 'string') {
            return sendError(res, 400, 'error is required');
        }
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().fail(req.params.delegationId, error);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { error: delegation.error, completedAt: delegation.completedAt }, 'Delegation failed via workflow messaging route');
        sendSuccess(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** POST /delegations/:delegationId/cancel — Cancel a delegation */
delegationRouter.post('/:delegationId/cancel', (req, res) => {
    try {
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().cancel(req.params.delegationId);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { completedAt: delegation.completedAt }, 'Delegation cancelled via workflow messaging route');
        sendSuccess(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /delegations/chain/:delegationId — Get full delegation chain */
delegationRouter.get('/chain/:delegationId', (req, res) => {
    try {
        const chain = (0, delegation_chain_service_1.getDelegationChainService)().getChain(req.params.delegationId);
        if (!chain) {
            return sendError(res, 404, `Delegation chain not found: ${req.params.delegationId}`);
        }
        sendSuccess(res, chain);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /delegations/from/:agentId — Get delegations from agent */
delegationRouter.get('/from/:agentId', (req, res) => {
    try {
        const delegations = (0, delegation_chain_service_1.getDelegationChainService)().getDelegationsFrom(req.params.agentId);
        sendSuccess(res, delegations);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
/** GET /delegations/to/:agentId — Get delegations to agent */
delegationRouter.get('/to/:agentId', (req, res) => {
    try {
        const delegations = (0, delegation_chain_service_1.getDelegationChainService)().getDelegationsTo(req.params.agentId);
        sendSuccess(res, delegations);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
// ---------------------------------------------------------------------------
// Combined router
// ---------------------------------------------------------------------------
exports.workflowMessagingRouter = (0, express_1.Router)();
exports.workflowMessagingRouter.use('/workflows', workflowRouter);
exports.workflowMessagingRouter.use('/messages', messagingRouter);
exports.workflowMessagingRouter.use('/delegations', delegationRouter);
exports.workflowMessagingRouter.post('/handoffs/:delegationId/accept', (req, res) => {
    try {
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().accept(req.params.delegationId);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { acceptedAt: delegation.acceptedAt }, 'Delegation accepted via handoff alias route');
        sendDelegationResponse(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
exports.workflowMessagingRouter.post('/handoffs/:delegationId/decline', (req, res) => {
    try {
        const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        const delegation = (0, delegation_chain_service_1.getDelegationChainService)().reject(req.params.delegationId, body?.reason);
        if (!delegation) {
            return sendError(res, 404, `Delegation not found: ${req.params.delegationId}`);
        }
        syncDelegationToTaskMetadata(delegation, { error: delegation.error, completedAt: delegation.completedAt }, 'Delegation declined via handoff alias route');
        sendDelegationResponse(res, delegation);
    }
    catch (err) {
        sendError(res, 500, err?.message ?? 'Internal error');
    }
});
