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
exports.getMultiDispatchService = getMultiDispatchService;
exports.resetMultiDispatchService = resetMultiDispatchService;
const uuid_1 = require("uuid");
const dockerode_1 = __importDefault(require("dockerode"));
const capability_matcher_service_1 = require("./capability-matcher.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const collaboration_service_1 = require("./collaboration.service");
const workspace_service_1 = require("./workspace.service");
const worktree_manager_service_1 = require("./worktree-manager.service");
const a2a_event_bus_1 = require("./a2a-event-bus");
const agent_bridge_service_1 = require("./agent-bridge.service");
const a2a_persistence_1 = require("./a2a-persistence");
const memory_store_1 = require("./memory-store");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-multi-dispatch');
const docker = new dockerode_1.default();
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
        if (request.autoRoute || (!request.agentIds?.length)) {
            // Auto-route using capability matcher
            const matcher = (0, capability_matcher_service_1.getCapabilityMatcher)();
            const matchResult = matcher.matchAgents({
                requiredCapabilities: [],
                preferredCapabilities: [],
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
            }
            if (agentIds.length === 0) {
                agentIds = ws.memberAgentIds.slice(0, ws.settings.maxConcurrentTasks);
            }
        }
        else {
            agentIds = request.agentIds;
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
        const bridge = (0, agent_bridge_service_1.getAgentBridgeService)();
        const worktreeManager = (0, worktree_manager_service_1.getWorktreeManagerService)();
        const taskIds = [];
        const worktrees = {};
        for (const agentId of agentIds) {
            const task = taskLifecycle.createTask({
                prompt: request.prompt,
                workspace_id: workspaceId,
                assignee_agent_id: agentId,
                priority: request.priority ?? 'normal',
                metadata: {
                    dispatchId,
                    orchestrationPattern: pattern,
                    ...(routingReasons[agentId] ? { routingReason: routingReasons[agentId] } : {}),
                },
            });
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
            // If the agent is connected via the bridge, push the task assignment
            if (bridge.isAgentOnline(agentId)) {
                // ── Sprint E deep wiring: inject relevant memories into task context ──
                // Fetch top 10 semantically relevant memories for the workspace owner
                // so the receiving agent has persistent context without explicitly recalling.
                let memoryContext = [];
                try {
                    const wsOwner = ws.ownerId;
                    if (wsOwner) {
                        const memories = await (0, memory_store_1.getRecentContext)({
                            query: request.prompt,
                            userId: wsOwner,
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
                    // Non-fatal — dispatch continues without memory context
                    logger.debug({ err: memErr }, 'memory context injection skipped');
                }
                bridge.sendToAgent(agentId, {
                    type: 'task.assigned',
                    taskId: task.id,
                    prompt: request.prompt,
                    context: {
                        workspaceId,
                        dispatchId,
                        priority: request.priority ?? 'normal',
                        ...(worktreeInfo ? {
                            worktreeBranch: worktreeInfo.branchName,
                            worktreePath: worktreeInfo.worktreePath,
                        } : {}),
                        ...(memoryContext.length > 0 ? { memories: memoryContext } : {}),
                    },
                });
                // Mark agent as working
                const connected = bridge.getAgent(agentId);
                if (connected)
                    connected.status = 'working';
            }
        }
        // Create a thread in the workspace's default channel
        let channelThreadId;
        try {
            const collab = (0, collaboration_service_1.getCollaborationSvc)();
            const thread = collab.createThread(ws.defaultChannelId, `Dispatch: ${request.prompt.slice(0, 80)}`);
            channelThreadId = thread.id;
            // Post system message about the dispatch (include routing reasons when auto-routed)
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
