"use strict";
/**
 * @module agent-bridge.service
 *
 * WebSocket-based bridge that connects local agents (recoder-code CLI)
 * to the A2A workspace system.
 *
 * Local agents connect via ws://docker-backend/agent-bridge?token=<session_token>
 * and exchange JSON messages to register, receive task assignments, report
 * progress, and participate in channel conversations.
 *
 * Protocol — Client → Server:
 *   { type: "register", agentId, capabilities, workspaceIds }
 *   { type: "heartbeat" }
 *   { type: "task.progress", taskId, progress, output }
 *   { type: "task.complete", taskId, result }
 *   { type: "task.failed", taskId, error }
 *   { type: "channel.message", channelId, content }
 *   { type: "join_workspace", workspaceId }
 *   { type: "leave_workspace", workspaceId }
 *
 * Protocol — Server → Client:
 *   { type: "registered", agentId, workspaces }
 *   { type: "task.assigned", taskId, prompt, context, worktreeBranch? }
 *   { type: "task.cancelled", taskId }
 *   { type: "channel.message", channelId, from, content }
 *   { type: "workspace.updated", workspaceId, changes }
 *   { type: "ping" }
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentBridgeService = void 0;
exports.getAgentBridgeService = getAgentBridgeService;
exports.resetAgentBridgeService = resetAgentBridgeService;
const ws_1 = __importDefault(require("ws"));
const uuid_1 = require("uuid");
const a2a_event_bus_1 = require("./a2a-event-bus");
const workspace_service_1 = require("./workspace.service");
const collaboration_service_1 = require("./collaboration.service");
const heartbeat_tracker_service_1 = require("./heartbeat-tracker.service");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const logger_1 = require("../logger");
const memory_store_1 = require("./memory-store");
const agent_registry_service_1 = require("./agent-registry.service");
const a2a_1 = require("@recoder/shared/a2a");
/**
 * Known A2A platform identifiers. A bridge agentId that matches one of these is
 * registered under that platform so PLATFORM_DEFAULTS apply; anything else is
 * registered as 'custom'. Mirrors RecoderAgentPlatform from @recoder/shared/a2a.
 */
const KNOWN_BRIDGE_PLATFORMS = new Set([
    'claude_code',
    'codex',
    'cursor',
    'windsurf',
    'replit',
    'recoder_web',
    'recoder_pm',
    'recoder_agency',
    'custom',
]);
function resolveBridgePlatform(agentId) {
    return KNOWN_BRIDGE_PLATFORMS.has(agentId)
        ? agentId
        : 'custom';
}
const logger = (0, logger_1.createLogger)('agent-bridge');
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function normalizeBridgeArtifacts(value) {
    if (!Array.isArray(value))
        return undefined;
    const artifacts = value
        .map((artifact) => {
        if (!isRecord(artifact))
            return null;
        if (typeof artifact.key !== 'string' ||
            typeof artifact.artifact_type !== 'string' ||
            typeof artifact.mime_type !== 'string' ||
            typeof artifact.content !== 'string') {
            return null;
        }
        return {
            key: artifact.key,
            artifact_type: artifact.artifact_type,
            mime_type: artifact.mime_type,
            content: artifact.content,
            ...(typeof artifact.path === 'string' ? { path: artifact.path } : {}),
            ...(isRecord(artifact.metadata) ? { metadata: artifact.metadata } : {}),
        };
    })
        .filter((artifact) => artifact !== null);
    return artifacts.length > 0 ? artifacts : undefined;
}
function normalizeBridgeTaskResult(value) {
    if (typeof value === 'string') {
        return { text: value };
    }
    if (!isRecord(value))
        return undefined;
    const text = typeof value.text === 'string' ? value.text : undefined;
    const data = isRecord(value.data) ? value.data : undefined;
    const artifacts = normalizeBridgeArtifacts(value.artifacts);
    if (!text && !data && !artifacts)
        return undefined;
    return {
        ...(text ? { text } : {}),
        ...(data ? { data } : {}),
        ...(artifacts ? { artifacts } : {}),
    };
}
function normalizeBridgeTaskError(value) {
    if (typeof value === 'string') {
        return {
            code: 'BRIDGE_TASK_FAILED',
            category: 'bridge',
            message: value,
            severity: 'medium',
            retryable: true,
        };
    }
    if (!isRecord(value)) {
        return {
            code: 'BRIDGE_TASK_FAILED',
            category: 'bridge',
            message: 'Task failed via bridge',
            severity: 'medium',
            retryable: true,
        };
    }
    return {
        code: typeof value.code === 'string' ? value.code : 'BRIDGE_TASK_FAILED',
        category: typeof value.category === 'string' ? value.category : 'bridge',
        message: typeof value.message === 'string' ? value.message : 'Task failed via bridge',
        severity: value.severity === 'low' ||
            value.severity === 'medium' ||
            value.severity === 'high' ||
            value.severity === 'critical'
            ? value.severity
            : 'medium',
        retryable: typeof value.retryable === 'boolean' ? value.retryable : true,
        ...(isRecord(value.details) ? { details: value.details } : {}),
    };
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class AgentBridgeService {
    /** Primary registry: sessionId → ConnectedAgent */
    agents = new Map();
    /** Secondary index: agentId (type) → Set<sessionId>. Lets us fan-out by type. */
    agentTypeIndex = new Map();
    /** Socket → sessionId */
    socketToAgent = new Map();
    /** Stream subscriptions: taskId → Set<sessionId> watching the stream */
    streamSubscribers = new Map();
    heartbeatInterval = null;
    constructor() {
        this.startHeartbeatSweep();
    }
    recordBridgeHeartbeat(agent) {
        const sessions = this.getSessionsForAgent(agent.agentId);
        const workspaceIds = new Set();
        const capabilities = new Set();
        for (const session of sessions) {
            for (const workspaceId of session.workspaceIds) {
                workspaceIds.add(workspaceId);
            }
            for (const capability of session.capabilities) {
                capabilities.add(capability);
            }
        }
        (0, heartbeat_tracker_service_1.getHeartbeatTracker)().recordHeartbeat(agent.agentId, 'healthy', {
            source: 'bridge',
            userId: agent.userId,
            sessionCount: Math.max(sessions.length, 1),
            capabilityCount: capabilities.size,
            workspaceCount: workspaceIds.size,
        });
    }
    removeBridgeHeartbeat(agentId) {
        const tracker = (0, heartbeat_tracker_service_1.getHeartbeatTracker)();
        const remainingSessions = this.getSessionsForAgent(agentId);
        if (remainingSessions.length > 0) {
            const primarySession = remainingSessions[0];
            this.recordBridgeHeartbeat(primarySession);
            return;
        }
        const record = tracker.getRecord(agentId);
        if (record?.metadata?.source === 'bridge') {
            tracker.removeAgent(agentId);
        }
    }
    // -----------------------------------------------------------------------
    // Agent connection lifecycle
    // -----------------------------------------------------------------------
    registerAgent(ws, agentId, userId, capabilities = [], workspaceIds = [], sessionId, label) {
        // Use provided sessionId or generate a unique one.
        // Multiple sessions of the same agentId (e.g. two "claude_code" terminals) are
        // allowed — they each get their own slot in the registry.
        const resolvedSessionId = sessionId || `${agentId}_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 12)}`;
        // If a session with this exact sessionId is reconnecting, close the stale socket first.
        const existingSession = this.agents.get(resolvedSessionId);
        if (existingSession && existingSession.socket !== ws) {
            try {
                existingSession.socket.close(1000, 'Replaced by new connection with same sessionId');
            }
            catch { /* ignore */ }
            this.socketToAgent.delete(existingSession.socket);
        }
        const now = new Date().toISOString();
        const agent = {
            sessionId: resolvedSessionId,
            agentId,
            userId,
            socket: ws,
            workspaceIds: [...workspaceIds],
            capabilities,
            status: 'online',
            connectedAt: now,
            lastHeartbeat: now,
            label,
        };
        this.agents.set(resolvedSessionId, agent);
        this.socketToAgent.set(ws, resolvedSessionId);
        // Maintain the agentId → sessionId[] secondary index
        if (!this.agentTypeIndex.has(agentId)) {
            this.agentTypeIndex.set(agentId, new Set());
        }
        this.agentTypeIndex.get(agentId).add(resolvedSessionId);
        // Auto-add to workspace member lists
        const wsSvc = (0, workspace_service_1.getWorkspaceService)();
        for (const wsId of workspaceIds) {
            wsSvc.addAgent(wsId, agentId);
        }
        // Publish agent.online event for each workspace
        const bus = (0, a2a_event_bus_1.getA2AEventBus)();
        for (const wsId of workspaceIds) {
            bus.publish({
                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                type: a2a_event_bus_1.A2AEventType.AgentOnline,
                timestamp: now,
                data: { agentId, userId, capabilities, isLocal: true },
                workspaceId: wsId,
            });
        }
        logger.info({ agentId, sessionId: resolvedSessionId, userId, workspaces: workspaceIds.length, capabilities: capabilities.length }, 'agent registered via bridge');
        // Sync into the HTTP-queryable Agent Registry so bridge-connected agents are
        // discoverable via GET /api/a2a/agents (REST) and not only in the bridge map.
        try {
            (0, agent_registry_service_1.getAgentRegistryService)().selfRegister({
                agentId,
                name: label || agentId,
                platform: resolveBridgePlatform(agentId),
                ...(capabilities.length > 0 ? { tags: capabilities } : {}),
            });
        }
        catch (err) {
            logger.warn({ agentId, err }, 'failed to sync bridge agent into agent registry (non-fatal)');
        }
        this.recordBridgeHeartbeat(agent);
        // Pre-warm agent memory context in background (fire-and-forget)
        if (userId && userId !== 'system') {
            Promise.resolve().then(() => __importStar(require('./trigger-jobs.js'))).then(({ queueMemoryRefresh }) => queueMemoryRefresh(userId, `session start for ${agentId}`))
                .catch(() => { });
        }
        return agent;
    }
    /** Unregister by sessionId (preferred) or fall back to first session of agentId. */
    unregisterAgent(sessionIdOrAgentId) {
        // Try exact sessionId first
        let agent = this.agents.get(sessionIdOrAgentId);
        if (!agent) {
            // Fall back: if it looks like an agentId type, close the first session
            const sessions = this.agentTypeIndex.get(sessionIdOrAgentId);
            if (sessions && sessions.size > 0) {
                const firstSessionId = sessions.values().next().value;
                if (firstSessionId)
                    agent = this.agents.get(firstSessionId);
            }
        }
        if (!agent)
            return;
        const { sessionId, agentId } = agent;
        this.socketToAgent.delete(agent.socket);
        this.agents.delete(sessionId);
        // Remove from agentType index
        const sessions = this.agentTypeIndex.get(agentId);
        if (sessions) {
            sessions.delete(sessionId);
            if (sessions.size === 0)
                this.agentTypeIndex.delete(agentId);
        }
        this.removeBridgeHeartbeat(agentId);
        // Publish agent.offline
        const bus = (0, a2a_event_bus_1.getA2AEventBus)();
        const now = new Date().toISOString();
        for (const wsId of agent.workspaceIds) {
            bus.publish({
                id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                type: a2a_event_bus_1.A2AEventType.AgentOffline,
                timestamp: now,
                data: { agentId, sessionId, isLocal: true },
                workspaceId: wsId,
            });
        }
        logger.info({ agentId, sessionId }, 'agent unregistered from bridge');
    }
    unregisterBySocket(ws) {
        const sessionId = this.socketToAgent.get(ws);
        if (sessionId) {
            this.unregisterAgent(sessionId);
        }
    }
    // -----------------------------------------------------------------------
    // Queries
    // -----------------------------------------------------------------------
    getOnlineAgents(workspaceId) {
        const all = [...this.agents.values()];
        if (!workspaceId)
            return all;
        return all.filter((a) => a.workspaceIds.includes(workspaceId));
    }
    /**
     * Look up an agent by sessionId (exact) or by agentId type (returns first session).
     * Returns undefined if not found.
     */
    getAgent(sessionIdOrAgentId) {
        // Exact sessionId match
        const bySession = this.agents.get(sessionIdOrAgentId);
        if (bySession)
            return bySession;
        // Fall back: first session for that agentId type
        const sessions = this.agentTypeIndex.get(sessionIdOrAgentId);
        if (sessions && sessions.size > 0) {
            const firstSessionId = sessions.values().next().value;
            if (firstSessionId)
                return this.agents.get(firstSessionId);
        }
        return undefined;
    }
    /** Returns true if at least one session of the given agentId type is connected. */
    isAgentOnline(agentId) {
        // Check agentId type index (multiple sessions allowed)
        const sessions = this.agentTypeIndex.get(agentId);
        if (sessions && sessions.size > 0)
            return true;
        // Also check as exact sessionId fallback
        return this.agents.has(agentId);
    }
    /** All sessions connected for a given agentId type. */
    getSessionsForAgent(agentId) {
        const sessions = this.agentTypeIndex.get(agentId);
        if (!sessions || sessions.size === 0)
            return [];
        return [...sessions].flatMap((sid) => {
            const a = this.agents.get(sid);
            return a ? [a] : [];
        });
    }
    /**
     * Returns a serializable snapshot of all connected sessions (no socket reference).
     */
    listConnectedSessions() {
        return [...this.agents.values()].map(({ socket: _socket, ...rest }) => rest);
    }
    // -----------------------------------------------------------------------
    // Messaging
    // -----------------------------------------------------------------------
    /**
     * Send to a specific session by sessionId, or fan out to ALL sessions of an agentId type.
     * Returns true if at least one delivery succeeded.
     */
    sendToAgent(agentIdOrSessionId, message) {
        // Try exact sessionId first
        const bySession = this.agents.get(agentIdOrSessionId);
        if (bySession) {
            return this.deliverToSession(bySession, message);
        }
        // Fan out to all sessions of that agentId type
        const sessions = this.agentTypeIndex.get(agentIdOrSessionId);
        if (!sessions || sessions.size === 0)
            return false;
        let anyDelivered = false;
        for (const sid of sessions) {
            const agent = this.agents.get(sid);
            if (agent && this.deliverToSession(agent, message)) {
                anyDelivered = true;
            }
        }
        return anyDelivered;
    }
    deliverToSession(agent, message) {
        if (agent.socket.readyState !== ws_1.default.OPEN)
            return false;
        try {
            agent.socket.send(JSON.stringify(message));
            return true;
        }
        catch (err) {
            logger.warn({ agentId: agent.agentId, sessionId: agent.sessionId, err }, 'failed to send message to agent session');
            return false;
        }
    }
    broadcastToWorkspace(workspaceId, message) {
        for (const agent of this.agents.values()) {
            if (agent.workspaceIds.includes(workspaceId)) {
                this.sendToAgent(agent.sessionId, message);
            }
        }
    }
    // -----------------------------------------------------------------------
    // Workspace join/leave (accepts sessionId or agentId)
    // -----------------------------------------------------------------------
    joinWorkspace(sessionIdOrAgentId, workspaceId) {
        const agent = this.getAgent(sessionIdOrAgentId);
        if (!agent)
            return false;
        if (!agent.workspaceIds.includes(workspaceId)) {
            agent.workspaceIds.push(workspaceId);
        }
        (0, workspace_service_1.getWorkspaceService)().addAgent(workspaceId, agent.agentId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.AgentOnline,
            timestamp: new Date().toISOString(),
            data: { agentId: agent.agentId, sessionId: agent.sessionId, isLocal: true },
            workspaceId,
        });
        return true;
    }
    leaveWorkspace(sessionIdOrAgentId, workspaceId) {
        const agent = this.getAgent(sessionIdOrAgentId);
        if (!agent)
            return false;
        agent.workspaceIds = agent.workspaceIds.filter((id) => id !== workspaceId);
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.AgentOffline,
            timestamp: new Date().toISOString(),
            data: { agentId: agent.agentId, sessionId: agent.sessionId, isLocal: true },
            workspaceId,
        });
        return true;
    }
    // -----------------------------------------------------------------------
    // Handle incoming messages from a connected agent
    // -----------------------------------------------------------------------
    handleMessage(ws, raw) {
        // socketToAgent now maps to sessionId
        const sessionId = this.socketToAgent.get(ws);
        const agent = sessionId ? this.agents.get(sessionId) : undefined;
        const agentId = agent?.agentId;
        let msg;
        try {
            msg = JSON.parse(raw);
        }
        catch {
            logger.warn('invalid JSON from agent bridge connection');
            return;
        }
        switch (msg.type) {
            case 'register': {
                // Registration is handled separately in the WS handler (needs userId from auth)
                // This handles capability/workspace updates over an existing connection
                if (sessionId && agent) {
                    if (Array.isArray(msg.capabilities)) {
                        agent.capabilities = msg.capabilities;
                    }
                    if (Array.isArray(msg.workspaceIds)) {
                        for (const wsId of msg.workspaceIds) {
                            this.joinWorkspace(sessionId, wsId);
                        }
                    }
                    this.sendToAgent(sessionId, {
                        type: 'registered',
                        agentId,
                        sessionId,
                        workspaces: agent.workspaceIds,
                    });
                }
                break;
            }
            case 'heartbeat': {
                if (sessionId && agent) {
                    agent.lastHeartbeat = new Date().toISOString();
                    this.recordBridgeHeartbeat(agent);
                }
                break;
            }
            case 'task.progress': {
                if (!sessionId || !agentId)
                    break;
                if (agent)
                    agent.status = 'working';
                const taskId = msg.taskId;
                const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                const existing = lifecycle.getTask(taskId);
                if (existing.ok) {
                    if (existing.data.state === a2a_1.TaskStateEnum.Submitted || existing.data.state === a2a_1.TaskStateEnum.InputRequired) {
                        lifecycle.startTask(taskId, agentId);
                    }
                    const currentMetadata = isRecord(existing.data.metadata) ? existing.data.metadata : {};
                    const priorEvents = Array.isArray(currentMetadata.bridgeProgressEvents)
                        ? currentMetadata.bridgeProgressEvents.filter((entry) => isRecord(entry))
                        : [];
                    const progressEvent = {
                        at: new Date().toISOString(),
                        sessionId,
                        agentId,
                        progress: typeof msg.progress === 'number' ? msg.progress : null,
                        output: typeof msg.output === 'string' ? msg.output : null,
                    };
                    const nextEvents = [...priorEvents, progressEvent].slice(-20);
                    lifecycle.updateTaskMetadata(taskId, {
                        metadataPatch: {
                            bridgeProgress: progressEvent,
                            bridgeProgressEvents: nextEvents,
                        },
                        triggeredBy: agentId,
                        reason: 'Bridge task progress received',
                    });
                }
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.TaskProgress,
                    timestamp: new Date().toISOString(),
                    taskId,
                    data: {
                        agentId,
                        sessionId,
                        progress: msg.progress,
                        output: msg.output,
                    },
                });
                break;
            }
            case 'task.complete': {
                if (!sessionId || !agentId)
                    break;
                if (agent)
                    agent.status = 'idle';
                const taskId = msg.taskId;
                const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                const existing = lifecycle.getTask(taskId);
                if (existing.ok) {
                    if (existing.data.state === a2a_1.TaskStateEnum.Submitted || existing.data.state === a2a_1.TaskStateEnum.InputRequired) {
                        lifecycle.startTask(taskId, agentId);
                    }
                    lifecycle.completeTask(taskId, normalizeBridgeTaskResult(msg.result), agentId);
                }
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.TaskCompleted,
                    timestamp: new Date().toISOString(),
                    taskId,
                    data: {
                        agentId,
                        sessionId,
                        result: msg.result,
                    },
                });
                break;
            }
            case 'task.failed': {
                if (!sessionId || !agentId)
                    break;
                if (agent)
                    agent.status = 'idle';
                const taskId = msg.taskId;
                const lifecycle = (0, task_lifecycle_service_1.getTaskLifecycleService)();
                const existing = lifecycle.getTask(taskId);
                if (existing.ok) {
                    if (existing.data.state === a2a_1.TaskStateEnum.Submitted || existing.data.state === a2a_1.TaskStateEnum.InputRequired) {
                        lifecycle.startTask(taskId, agentId);
                    }
                    lifecycle.failTask(taskId, normalizeBridgeTaskError(msg.error), agentId);
                }
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.TaskFailed,
                    timestamp: new Date().toISOString(),
                    taskId,
                    data: {
                        agentId,
                        sessionId,
                        error: msg.error,
                    },
                });
                break;
            }
            // ── Streaming: token-by-token output fan-out ──
            case 'task.stream': {
                if (!sessionId || !agentId)
                    break;
                const streamTaskId = msg.taskId;
                const chunk = msg.chunk;
                const done = Boolean(msg.done);
                // Fan out stream chunk to all subscribers of this task
                const subscribers = this.streamSubscribers.get(streamTaskId);
                if (subscribers) {
                    for (const subSessionId of subscribers) {
                        if (subSessionId === sessionId)
                            continue; // Don't echo back to sender
                        this.sendToAgent(subSessionId, {
                            type: 'task.stream',
                            taskId: streamTaskId,
                            chunk,
                            done,
                            from: agentId,
                        });
                    }
                }
                // Also publish to event bus for SSE consumers
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.TaskStream,
                    timestamp: new Date().toISOString(),
                    taskId: streamTaskId,
                    data: { agentId, sessionId, chunk, done },
                });
                if (done) {
                    // Clean up subscriptions when stream ends
                    this.streamSubscribers.delete(streamTaskId);
                }
                break;
            }
            // ── Subscribe: agent wants to watch another agent's task output ──
            case 'task.subscribe': {
                if (!sessionId)
                    break;
                const subTaskId = msg.taskId;
                if (!this.streamSubscribers.has(subTaskId)) {
                    this.streamSubscribers.set(subTaskId, new Set());
                }
                this.streamSubscribers.get(subTaskId).add(sessionId);
                this.sendToAgent(sessionId, {
                    type: 'task.subscribed',
                    taskId: subTaskId,
                });
                break;
            }
            // ── Interrupt: agent A tells agent B to stop mid-task ──
            case 'task.interrupt': {
                if (!sessionId || !agentId)
                    break;
                const interruptTaskId = msg.taskId;
                const targetAgent = msg.targetAgent;
                const reason = msg.reason ?? 'Interrupted by another agent';
                // Route interrupt to the agent working on this task
                if (targetAgent) {
                    this.sendToAgent(targetAgent, {
                        type: 'task.interrupt',
                        taskId: interruptTaskId,
                        from: agentId,
                        reason,
                    });
                }
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.TaskInterrupted,
                    timestamp: new Date().toISOString(),
                    taskId: interruptTaskId,
                    data: { from: agentId, targetAgent, reason },
                });
                break;
            }
            case 'channel.message': {
                if (!sessionId || !agentId)
                    break;
                const channelWorkspaceId = msg.channelId;
                // 1. Persist to collaboration service for history
                try {
                    (0, collaboration_service_1.getCollaborationSvc)().sendMessage({
                        threadId: channelWorkspaceId || 'default',
                        senderAgentId: agentId,
                        text: msg.content,
                    });
                }
                catch (err) {
                    logger.warn({ agentId, sessionId, err }, 'failed to persist channel message');
                }
                // 2. Relay to all other sessions in the same workspace (skip sender session)
                if (channelWorkspaceId) {
                    for (const peer of this.agents.values()) {
                        if (peer.sessionId === sessionId)
                            continue; // skip sender
                        if (!peer.workspaceIds.includes(channelWorkspaceId))
                            continue;
                        this.sendToAgent(peer.sessionId, {
                            type: 'channel.message',
                            channelId: channelWorkspaceId,
                            from: agentId,
                            content: msg.content,
                        });
                    }
                }
                // 3. Publish event for SSE subscribers
                (0, a2a_event_bus_1.getA2AEventBus)().publish({
                    id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                    type: a2a_event_bus_1.A2AEventType.MessageNew,
                    timestamp: new Date().toISOString(),
                    data: {
                        channelId: channelWorkspaceId,
                        from: agentId,
                        content: msg.content,
                    },
                    workspaceId: channelWorkspaceId,
                });
                break;
            }
            case 'intent': {
                // Sent by recoder-a2a MCP clients (recoder_send_task tool)
                if (!sessionId || !agentId)
                    break;
                const targetAgentId = msg.target;
                if (!targetAgentId) {
                    logger.warn({ agentId, sessionId }, 'intent message missing target agent');
                    break;
                }
                // Capture locals for the async closure
                const intentTaskId = `task_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`;
                const intentPrompt = msg.task;
                const intentType = msg.intent || 'execute';
                const intentFrom = agentId;
                const intentFromSession = sessionId;
                // Async: fetch target agent's memory context, then dispatch — fire-and-forget
                void (async () => {
                    const targetAgent = this.getAgent(targetAgentId);
                    const memoryContext = targetAgent?.userId && intentPrompt
                        ? await (0, memory_store_1.getRecentContext)({ query: intentPrompt, userId: targetAgent.userId })
                        : [];
                    const delivered = this.sendToAgent(targetAgentId, {
                        type: 'task.assigned',
                        taskId: intentTaskId,
                        from: intentFrom,
                        fromSession: intentFromSession,
                        intent: intentType,
                        prompt: intentPrompt,
                        context: {
                            source: 'a2a-bridge',
                            from: intentFrom,
                            fromSession: intentFromSession,
                            ...(memoryContext.length > 0 ? { memoryContext } : {}),
                        },
                    });
                    // Acknowledge back to sender session
                    this.sendToAgent(intentFromSession, {
                        type: 'intent.ack',
                        target: targetAgentId,
                        delivered,
                        reason: delivered ? undefined : 'target agent not connected',
                    });
                    (0, a2a_event_bus_1.getA2AEventBus)().publish({
                        id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
                        type: a2a_event_bus_1.A2AEventType.TaskSubmitted,
                        timestamp: new Date().toISOString(),
                        data: {
                            from: intentFrom,
                            fromSession: intentFromSession,
                            target: targetAgentId,
                            intent: intentType,
                            task: intentPrompt,
                            delivered,
                        },
                    });
                    logger.info({ from: intentFrom, fromSession: intentFromSession, target: targetAgentId, delivered, intent: intentType, memoryEntries: memoryContext.length }, 'intent routed via bridge');
                })();
                break;
            }
            case 'join_workspace': {
                if (sessionId && msg.workspaceId) {
                    this.joinWorkspace(sessionId, msg.workspaceId);
                    this.sendToAgent(sessionId, {
                        type: 'workspace.joined',
                        workspaceId: msg.workspaceId,
                    });
                }
                break;
            }
            case 'leave_workspace': {
                if (sessionId && msg.workspaceId) {
                    this.leaveWorkspace(sessionId, msg.workspaceId);
                    this.sendToAgent(sessionId, {
                        type: 'workspace.left',
                        workspaceId: msg.workspaceId,
                    });
                }
                break;
            }
            default:
                logger.debug({ type: msg.type, agentId, sessionId }, 'unknown bridge message type');
        }
    }
    // -----------------------------------------------------------------------
    // Heartbeat sweep
    // -----------------------------------------------------------------------
    startHeartbeatSweep() {
        // Every 60s, check for agents that haven't sent a heartbeat in 90s
        this.heartbeatInterval = setInterval(() => {
            const cutoff = Date.now() - 90_000;
            for (const [sessionId, agent] of this.agents) {
                const lastBeat = new Date(agent.lastHeartbeat).getTime();
                if (lastBeat < cutoff) {
                    logger.info({ agentId: agent.agentId, sessionId }, 'agent session timed out, disconnecting');
                    try {
                        agent.socket.close(1000, 'Heartbeat timeout');
                    }
                    catch { /* ignore */ }
                    this.unregisterAgent(sessionId);
                }
            }
        }, 60_000);
    }
    // -----------------------------------------------------------------------
    // Diagnostics
    // -----------------------------------------------------------------------
    get connectionCount() {
        return this.agents.size;
    }
    getStats() {
        const byWorkspace = {};
        const byStatus = {};
        for (const agent of this.agents.values()) {
            byStatus[agent.status] = (byStatus[agent.status] || 0) + 1;
            for (const wsId of agent.workspaceIds) {
                byWorkspace[wsId] = (byWorkspace[wsId] || 0) + 1;
            }
        }
        return {
            totalConnections: this.agents.size,
            byWorkspace,
            byStatus,
        };
    }
    shutdown() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        for (const agent of this.agents.values()) {
            try {
                agent.socket.close(1001, 'Server shutting down');
            }
            catch { /* ignore */ }
        }
        this.agents.clear();
        this.socketToAgent.clear();
        this.agentTypeIndex.clear();
    }
}
exports.AgentBridgeService = AgentBridgeService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getAgentBridgeService() {
    if (!_instance) {
        _instance = new AgentBridgeService();
    }
    return _instance;
}
function resetAgentBridgeService() {
    if (_instance) {
        _instance.shutdown();
    }
    _instance = null;
}
