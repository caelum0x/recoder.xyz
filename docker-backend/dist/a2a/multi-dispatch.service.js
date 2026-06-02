"use strict";
/**
 * @module multi-dispatch.service
 *
 * Multi-agent task dispatch for workspace collaboration.
 *
 * Dispatches a prompt to multiple agents simultaneously using the selected
 * orchestration pattern (direct, fan-out, pipeline, competitive). Leverages
 * existing services for capability matching, task lifecycle, and result aggregation.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiDispatchService = void 0;
exports.deriveRoutingPlan = deriveRoutingPlan;
exports.getMultiDispatchService = getMultiDispatchService;
exports.resetMultiDispatchService = resetMultiDispatchService;
const uuid_1 = require("uuid");
const dockerode_1 = __importDefault(require("dockerode"));
const capability_matcher_service_1 = require("./capability-matcher.service");
const intent_gate_1 = require("./intent-gate");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const collaboration_service_1 = require("./collaboration.service");
const workspace_service_1 = require("./workspace.service");
const worktree_manager_service_1 = require("./worktree-manager.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const agent_bridge_service_1 = require("./agent-bridge.service");
const agent_registry_service_1 = require("./agent-registry.service");
const approval_gate_service_1 = require("./approval-gate.service");
const a2a_persistence_1 = require("./a2a-persistence");
const memory_store_1 = require("./memory-store");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-multi-dispatch');
const docker = new dockerode_1.default();
function deriveConnectorProtocol(platform) {
    if (platform === 'claude_code')
        return 'mcp';
    if (platform === 'codex' || platform === 'cursor' || platform === 'windsurf')
        return 'jsonrpc';
    return 'rest';
}
function readPlatformForAgent(agentId, fallback) {
    const registryAgent = (0, agent_registry_service_1.getAgentRegistryService)().get(agentId);
    return registryAgent?.identity.platform ?? fallback ?? 'custom';
}
async function dispatchTaskToBridgeAgent(input) {
    const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
    if (!bridge.isAgentOnline(input.agentId))
        return;
    let memoryContext = [];
    try {
        if (input.ownerId) {
            const memories = await (0, memory_store_1.getRecentContext)({
                query: input.prompt,
                userId: input.ownerId,
                limit: 10,
            });
            memoryContext = memories.map((m) => ({
                content: m.content,
                type: m.type,
                score: m.score,
            }));
        }
    }
    catch (memErr) {
        logger.debug({ err: memErr }, 'memory context injection skipped');
    }
    bridge.sendToAgent(input.agentId, {
        type: 'task.assigned',
        taskId: input.taskId,
        prompt: input.prompt,
        context: {
            workspaceId: input.workspaceId,
            dispatchId: input.dispatchId,
            priority: input.priority,
            ...(input.worktreeInfo ? {
                worktreeBranch: input.worktreeInfo.branchName,
                worktreePath: input.worktreeInfo.worktreePath,
            } : {}),
            ...(input.routingReason ? { routingReason: input.routingReason } : {}),
            ...(memoryContext.length > 0 ? { memories: memoryContext } : {}),
        },
    });
    const connected = bridge.getAgent(input.agentId);
    if (connected)
        connected.status = 'working';
}
function deriveRoutingPlan(prompt, routingHints) {
    const intent = (0, intent_gate_1.classifyIntent)(prompt);
    const defaultsByCategory = {
        'bug-fix': {
            runtimeCategory: 'implementation',
            requiredCapabilities: ['code-generation'],
            preferredCapabilities: ['code-review'],
            preferredPlatform: 'codex',
        },
        feature: {
            runtimeCategory: 'implementation',
            requiredCapabilities: ['code-generation'],
            preferredCapabilities: ['testing'],
            preferredPlatform: 'codex',
        },
        refactor: {
            runtimeCategory: 'implementation',
            requiredCapabilities: ['code-generation'],
            preferredCapabilities: ['refactoring'],
            preferredPlatform: 'codex',
        },
        test: {
            runtimeCategory: 'implementation',
            requiredCapabilities: ['testing'],
            preferredCapabilities: ['code-generation'],
            preferredPlatform: 'codex',
        },
        doc: {
            runtimeCategory: 'documentation',
            requiredCapabilities: ['code-review'],
            preferredCapabilities: ['documentation'],
            preferredPlatform: 'claude_code',
        },
        visual: {
            runtimeCategory: 'visual',
            requiredCapabilities: ['web-interface'],
            preferredCapabilities: ['design', 'ui'],
            preferredPlatform: 'recoder_web',
        },
        debug: {
            runtimeCategory: 'debug',
            requiredCapabilities: ['code-review'],
            preferredCapabilities: ['debugging'],
            preferredPlatform: 'claude_code',
        },
        other: {
            runtimeCategory: 'general',
            requiredCapabilities: [],
            preferredCapabilities: [],
        },
    };
    const categoryDefaults = defaultsByCategory[intent.category];
    return {
        requirements: {
            requiredCapabilities: routingHints?.requiredCapabilities ?? categoryDefaults.requiredCapabilities,
            preferredCapabilities: routingHints?.preferredCapabilities ?? categoryDefaults.preferredCapabilities,
            preferredPlatform: routingHints?.preferredPlatform ?? categoryDefaults.preferredPlatform,
        },
        runtimeCategory: routingHints?.runtimeCategory ?? categoryDefaults.runtimeCategory,
        intent,
    };
}
/**
 * Resolve a Docker container ID from a project ID by matching the `projectId`
 * label applied when the container was created.  Returns `undefined` when no
 * running container is found for the given project.
 */
async function resolveContainerId(projectId) {
    try {
        const containers = await docker.listContainers({
            filters: JSON.stringify({
                label: [`projectId=${projectId}`],
                status: ['running'],
            }),
        });
        if (containers.length > 0) {
            return containers[0].Id;
        }
    }
    catch (err) {
        logger.warn({ err, projectId }, 'failed to resolve container for project');
    }
    return undefined;
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class MultiDispatchService {
    dispatches;
    constructor() {
        this.dispatches = (0, a2a_persistence_1.loadA2ADispatches)();
        logger.info({ count: this.dispatches.size }, 'loaded persisted dispatches');
    }
    persist() {
        (0, a2a_persistence_1.saveA2ADispatches)(this.dispatches);
    }
    /**
     * Dispatch a prompt to one or more agents.
     */
    async dispatch(workspaceId, request) {
        const dispatchId = `dispatch_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`;
        const now = new Date().toISOString();
        const ws = (0, workspace_service_1.getWorkspaceService)().get(workspaceId);
        if (!ws) {
            throw new Error(`Workspace not found: ${workspaceId}`);
        }
        const pattern = request.orchestrationPattern ?? ws.settings.defaultOrchestrationPattern;
        const aggregation = request.aggregationStrategy ?? 'merge-all';
        // Resolve target agents
        let agentIds;
        // Per-agent routing reasons (populated when auto-routing)
        const routingReasons = {};
        const selectedPlatforms = {};
        const routingPlan = deriveRoutingPlan(request.prompt, request.routingHints);
        if (request.autoRoute || (!request.agentIds?.length)) {
            // Auto-route using capability matcher
            const matcher = (0, capability_matcher_service_1.getCapabilityMatcher)();
            const matchResult = matcher.matchAgents({
                ...routingPlan.requirements,
                tags: [],
            });
            // Filter to workspace members
            const selectedMatches = matchResult.matches
                .filter((m) => ws.memberAgentIds.includes(m.agentId))
                .sort((a, b) => b.score - a.score)
                .slice(0, ws.settings.maxConcurrentTasks);
            agentIds = selectedMatches.map((m) => m.agentId);
            // Capture routing reasons for each selected agent
            for (const m of selectedMatches) {
                routingReasons[m.agentId] = m.reason;
                selectedPlatforms[m.agentId] = readPlatformForAgent(m.agentId, m.platform);
            }
            if (agentIds.length === 0) {
                agentIds = ws.memberAgentIds.slice(0, ws.settings.maxConcurrentTasks);
            }
        }
        else {
            agentIds = request.agentIds;
        }
        for (const agentId of agentIds) {
            if (!selectedPlatforms[agentId]) {
                selectedPlatforms[agentId] = readPlatformForAgent(agentId);
            }
        }
        // Create a thread in the workspace's default channel before task creation so the
        // canonical task envelopes can share the same thread identity.
        let channelThreadId;
        try {
            const collab = (0, collaboration_service_1.getCollaborationSvc)();
            const thread = collab.createThread(ws.defaultChannelId, `Dispatch: ${request.prompt.slice(0, 80)}`);
            channelThreadId = thread.id;
            const hasRoutingReasons = Object.keys(routingReasons).length > 0;
            let dispatchText = `Multi-dispatch started: "${request.prompt.slice(0, 100)}" → ${agentIds.length} agent(s) [${pattern}]`;
            if (hasRoutingReasons) {
                const reasonLines = agentIds
                    .filter((id) => routingReasons[id])
                    .map((id) => `  ${id}: ${routingReasons[id]}`)
                    .join('\n');
                dispatchText += `\n\nAuto-routed:\n${reasonLines}`;
            }
            collab.sendMessage({
                threadId: thread.id,
                senderAgentId: 'system',
                text: dispatchText,
            });
        }
        catch (err) {
            logger.warn({ err }, 'failed to create dispatch thread');
        }
        // Determine whether worktree isolation is requested
        const useWorktreeIsolation = request.worktreeIsolation ?? ws.settings.worktreeIsolation;
        // If worktree isolation is enabled, resolve the project's container up front
        let containerId;
        if (useWorktreeIsolation) {
            containerId = await resolveContainerId(ws.projectId);
            if (!containerId) {
                logger.warn({ workspaceId, projectId: ws.projectId }, 'worktree isolation requested but no running container found for project – dispatching without isolation');
            }
        }
        // Create tasks for each agent
        const taskLifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        const worktreeManager = (0, worktree_manager_service_1.getWorktreeManagerService)();
        const taskIds = [];
        const worktrees = {};
        for (const agentId of agentIds) {
            const platform = selectedPlatforms[agentId];
            const createInput = {
                workspace_id: workspaceId,
                thread_id: channelThreadId ?? `dispatch-${dispatchId}`,
                requester: {
                    agent_id: 'multi-dispatch',
                    platform: 'recoder_backend',
                    name: 'multi-dispatch',
                },
                assignee: {
                    agent_id: agentId,
                    platform,
                },
                connector: {
                    connector_id: `dispatch-${agentId}`,
                    platform,
                    protocol: deriveConnectorProtocol(platform),
                },
                payload: {
                    kind: 'text',
                    text: request.prompt,
                },
                metadata: {
                    dispatchId,
                    orchestrationPattern: pattern,
                    runtimeCategory: routingPlan.runtimeCategory,
                    routingHints: request.routingHints,
                    routingRequirements: routingPlan.requirements,
                    intentCategory: routingPlan.intent.category,
                    intentConfidence: routingPlan.intent.confidence,
                    priority: request.priority ?? 'normal',
                    ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
                },
            };
            const created = taskLifecycle.createTask(createInput);
            if (!created.ok) {
                throw new Error(created.error.message);
            }
            const task = created.data;
            taskIds.push(task.id);
            // Create an isolated worktree for this agent's task when enabled
            let worktreeInfo;
            if (useWorktreeIsolation && containerId) {
                try {
                    worktreeInfo = await worktreeManager.createWorktree(containerId, ws.projectId, task.id, agentId);
                    worktrees[task.id] = worktreeInfo;
                    logger.info({ taskId: task.id, agentId, branch: worktreeInfo.branchName }, 'worktree created for dispatched task');
                }
                catch (wtErr) {
                    logger.warn({ err: wtErr, taskId: task.id, agentId }, 'failed to create worktree for task – dispatching without isolation');
                }
            }
            if (ws.settings.approvalRequired) {
                const approval = (0, approval_gate_service_1.getApprovalGateService)().createRequest({
                    workspaceId,
                    requestingAgentId: 'multi-dispatch',
                    targetAgentId: agentId,
                    action: 'dispatch',
                    details: {
                        prompt: request.prompt,
                        dispatchId,
                        taskId: task.id,
                        priority: request.priority ?? 'normal',
                        ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
                    },
                    timeoutMs: 300_000,
                });
                taskLifecycle.updateTaskMetadata(task.id, {
                    metadataPatch: {
                        approval: {
                            approvalId: approval.approvalId,
                            status: approval.status,
                            action: 'dispatch',
                            targetAgentId: agentId,
                        },
                    },
                    triggeredBy: 'approval-gate',
                    reason: 'Dispatch approval requested',
                });
                taskLifecycle.startTask(task.id, 'approval-gate');
                taskLifecycle.requestInput(task.id, `Awaiting approval for dispatch to ${agentId}`, 'approval-gate');
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.ApprovalRequested,
                    timestamp: new Date().toISOString(),
                    data: { approval, taskId: task.id, dispatchId },
                    taskId: task.id,
                    workspaceId,
                });
                (0, approval_gate_service_1.getApprovalGateService)().onResolved(approval.approvalId, (resolved) => {
                    taskLifecycle.updateTaskMetadata(task.id, {
                        metadataPatch: {
                            approval: {
                                approvalId: resolved.approvalId,
                                status: resolved.status,
                                action: resolved.action,
                                targetAgentId: resolved.targetAgentId,
                                resolvedAt: resolved.resolvedAt,
                                resolvedBy: resolved.resolvedBy,
                            },
                        },
                        triggeredBy: 'approval-gate',
                        reason: `Dispatch approval ${resolved.status}`,
                    });
                    if (resolved.status === 'granted') {
                        taskLifecycle.startTask(task.id, 'approval-gate');
                        void dispatchTaskToBridgeAgent({
                            workspaceId,
                            dispatchId,
                            agentId,
                            taskId: task.id,
                            prompt: request.prompt,
                            priority: request.priority ?? 'normal',
                            ownerId: ws.ownerId,
                            worktreeInfo,
                            routingReason: routingReasons[agentId],
                        });
                    }
                    else {
                        taskLifecycle.cancelTask(task.id, `Dispatch approval ${resolved.status}`, 'approval-gate');
                    }
                });
            }
            else {
                void dispatchTaskToBridgeAgent({
                    workspaceId,
                    dispatchId,
                    agentId,
                    taskId: task.id,
                    prompt: request.prompt,
                    priority: request.priority ?? 'normal',
                    ownerId: ws.ownerId,
                    worktreeInfo,
                    routingReason: routingReasons[agentId],
                });
            }
        }
        const record = {
            dispatchId,
            workspaceId,
            prompt: request.prompt,
            orchestrationPattern: pattern,
            aggregationStrategy: aggregation,
            taskIds,
            agentIds,
            channelThreadId,
            status: 'running',
            results: [],
            ...(Object.keys(worktrees).length > 0 ? { worktrees } : {}),
            ...(Object.keys(routingReasons).length > 0 ? { routingReasons } : {}),
            routingHints: request.routingHints,
            intentClassification: {
                category: routingPlan.intent.category,
                confidence: routingPlan.intent.confidence,
                keywords: routingPlan.intent.keywords,
            },
            createdAt: now,
        };
        this.dispatches.set(dispatchId, record);
        this.persist();
        // Publish event
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: 'dispatch.started',
            timestamp: now,
            data: { dispatchId, agentIds, pattern },
            workspaceId,
        });
        logger.info({ dispatchId, workspaceId, agentCount: agentIds.length, pattern }, 'multi-dispatch started');
        // Monitor task completion
        this.monitorTasks(record);
        return record;
    }
    get(dispatchId) {
        return this.dispatches.get(dispatchId);
    }
    getResults(dispatchId) {
        return this.dispatches.get(dispatchId);
    }
    async cancel(dispatchId) {
        const record = this.dispatches.get(dispatchId);
        if (!record)
            return false;
        const taskLifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
        for (const taskId of record.taskIds) {
            try {
                taskLifecycle.transition(taskId, 'cancelled');
            }
            catch {
                // Task may already be in terminal state
            }
        }
        record.status = 'cancelled';
        record.completedAt = new Date().toISOString();
        this.persist();
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: 'dispatch.cancelled',
            timestamp: record.completedAt,
            data: { dispatchId },
            workspaceId: record.workspaceId,
        });
        return true;
    }
    listByWorkspace(workspaceId) {
        return [...this.dispatches.values()]
            .filter((d) => d.workspaceId === workspaceId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    monitorTasks(record) {
        const bus = (0, a2a_event_bus_1.getA2AEventBus)();
        const completed = new Set();
        const failed = new Set();
        for (const taskId of record.taskIds) {
            const unsub = bus.subscribeTask(taskId, (event) => {
                if (event.type === a2a_event_bus_1.A2AEventType.TaskCompleted) {
                    completed.add(taskId);
                    record.results.push(event.data);
                    this.persist();
                    unsub();
                    checkDone();
                }
                else if (event.type === a2a_event_bus_1.A2AEventType.TaskFailed || event.type === a2a_event_bus_1.A2AEventType.TaskCancelled) {
                    failed.add(taskId);
                    unsub();
                    checkDone();
                }
            });
        }
        const checkDone = () => {
            const total = record.taskIds.length;
            const done = completed.size + failed.size;
            if (done >= total) {
                record.status = failed.size === total ? 'failed' : 'completed';
                record.completedAt = new Date().toISOString();
                this.persist();
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: 'dispatch.completed',
                    timestamp: record.completedAt,
                    data: {
                        dispatchId: record.dispatchId,
                        completedTasks: completed.size,
                        failedTasks: failed.size,
                    },
                    workspaceId: record.workspaceId,
                });
                logger.info({ dispatchId: record.dispatchId, completed: completed.size, failed: failed.size }, 'multi-dispatch completed');
            }
        };
    }
}
exports.MultiDispatchService = MultiDispatchService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getMultiDispatchService() {
    if (!_instance) {
        _instance = new MultiDispatchService();
    }
    return _instance;
}
function resetMultiDispatchService() {
    _instance = null;
}
