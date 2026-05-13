"use strict";
/**
 * @module a2a-event-bus
 *
 * EventEmitter-based pub/sub system for real-time A2A events.
 *
 * Provides a typed, singleton event bus that bridges the TaskLifecycleService
 * audit sink, CollaborationService messages, and agent registration events
 * into a unified stream consumable by SSE endpoints.
 *
 * Event taxonomy:
 *
 * | Category   | Event                | Payload                              |
 * |------------|----------------------|--------------------------------------|
 * | Task       | task.submitted       | { task: TaskEnvelope }               |
 * | Task       | task.started         | { task: TaskEnvelope }               |
 * | Task       | task.progress        | { task: TaskEnvelope, progress: ... } |
 * | Task       | task.input-required  | { task: TaskEnvelope }               |
 * | Task       | task.completed       | { task: TaskEnvelope }               |
 * | Task       | task.failed          | { task: TaskEnvelope }               |
 * | Task       | task.cancelled       | { task: TaskEnvelope }               |
 * | Channel    | message.new          | { channelId, message }               |
 * | Channel    | thread.created       | { channelId, thread }                |
 * | Channel    | member.joined        | { channelId, member }                |
 * | Channel    | member.left          | { channelId, member }                |
 * | Agent      | agent.registered     | { agent }                            |
 * | Agent      | agent.deregistered   | { agentId }                          |
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.A2AEventBus = exports.WORKTREE_EVENT_TYPES = exports.APPROVAL_EVENT_TYPES = exports.HANDOFF_EVENT_TYPES = exports.WORKSPACE_EVENT_TYPES = exports.AGENT_EVENT_TYPES = exports.CHANNEL_EVENT_TYPES = exports.TERMINAL_TASK_EVENT_TYPES = exports.TASK_EVENT_TYPES = exports.A2AEventType = void 0;
exports.getA2AEventBus = getA2AEventBus;
exports.resetA2AEventBus = resetA2AEventBus;
const events_1 = require("events");
const logger_1 = require("../logger");
const data_hygiene_1 = require("./data-hygiene");
const a2a_persistence_1 = require("./a2a-persistence");
const logger = (0, logger_1.createLogger)('a2a-event-bus');
// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------
exports.A2AEventType = {
    // Task events
    TaskSubmitted: 'task.submitted',
    TaskStarted: 'task.started',
    TaskProgress: 'task.progress',
    ArtifactAttached: 'artifact.attached',
    TaskStream: 'task.stream',
    TaskInputRequired: 'task.input-required',
    TaskCompleted: 'task.completed',
    TaskFailed: 'task.failed',
    TaskCancelled: 'task.cancelled',
    TaskInterrupted: 'task.interrupted',
    // Channel events
    MessageNew: 'message.new',
    MessageUpdated: 'message.updated',
    MessageDeleted: 'message.deleted',
    ThreadCreated: 'thread.created',
    MemberJoined: 'member.joined',
    MemberLeft: 'member.left',
    // Agent events
    AgentRegistered: 'agent.registered',
    AgentDeregistered: 'agent.deregistered',
    AgentOnline: 'agent.online',
    AgentOffline: 'agent.offline',
    // Workspace events
    WorkspaceCreated: 'workspace.created',
    WorkspaceUpdated: 'workspace.updated',
    WorkspaceDeleted: 'workspace.deleted',
    WorkspaceAgentAdded: 'workspace.agent-added',
    WorkspaceAgentRemoved: 'workspace.agent-removed',
    // Handoff / delegation events
    HandoffInitiated: 'handoff.initiated',
    HandoffCompleted: 'handoff.completed',
    DelegationCreated: 'delegation.created',
    DelegationCompleted: 'delegation.completed',
    ReviewAccepted: 'review.accepted',
    MergeRequested: 'merge.requested',
    // Approval events
    ApprovalRequested: 'approval.requested',
    ApprovalGranted: 'approval.granted',
    ApprovalRejected: 'approval.rejected',
    ApprovalEscalated: 'approval.escalated',
    // Worktree events
    WorktreeCreated: 'worktree.created',
    WorktreeMerged: 'worktree.merged',
    WorktreeConflict: 'worktree.conflict',
    WorktreeRemoved: 'worktree.removed',
    // Canvas events
    CanvasUpdate: 'canvas.update',
    // Inbox push events
    InboxNew: 'inbox.new',
    InboxTaskAssigned: 'inbox.task-assigned',
};
/** All task event types (for filtering). */
exports.TASK_EVENT_TYPES = new Set([
    exports.A2AEventType.TaskSubmitted,
    exports.A2AEventType.TaskStarted,
    exports.A2AEventType.TaskProgress,
    exports.A2AEventType.ArtifactAttached,
    exports.A2AEventType.TaskStream,
    exports.A2AEventType.TaskInputRequired,
    exports.A2AEventType.TaskCompleted,
    exports.A2AEventType.TaskFailed,
    exports.A2AEventType.TaskCancelled,
]);
/** Terminal task event types (stream should auto-close after these). */
exports.TERMINAL_TASK_EVENT_TYPES = new Set([
    exports.A2AEventType.TaskCompleted,
    exports.A2AEventType.TaskFailed,
    exports.A2AEventType.TaskCancelled,
]);
/** All channel event types. */
exports.CHANNEL_EVENT_TYPES = new Set([
    exports.A2AEventType.MessageNew,
    exports.A2AEventType.ThreadCreated,
    exports.A2AEventType.MemberJoined,
    exports.A2AEventType.MemberLeft,
]);
/** All agent event types. */
exports.AGENT_EVENT_TYPES = new Set([
    exports.A2AEventType.AgentRegistered,
    exports.A2AEventType.AgentDeregistered,
    exports.A2AEventType.AgentOnline,
    exports.A2AEventType.AgentOffline,
]);
/** All workspace event types. */
exports.WORKSPACE_EVENT_TYPES = new Set([
    exports.A2AEventType.WorkspaceCreated,
    exports.A2AEventType.WorkspaceUpdated,
    exports.A2AEventType.WorkspaceDeleted,
    exports.A2AEventType.WorkspaceAgentAdded,
    exports.A2AEventType.WorkspaceAgentRemoved,
]);
/** All handoff/delegation event types. */
exports.HANDOFF_EVENT_TYPES = new Set([
    exports.A2AEventType.HandoffInitiated,
    exports.A2AEventType.HandoffCompleted,
    exports.A2AEventType.DelegationCreated,
    exports.A2AEventType.DelegationCompleted,
    exports.A2AEventType.ReviewAccepted,
    exports.A2AEventType.MergeRequested,
]);
/** All approval event types. */
exports.APPROVAL_EVENT_TYPES = new Set([
    exports.A2AEventType.ApprovalRequested,
    exports.A2AEventType.ApprovalGranted,
    exports.A2AEventType.ApprovalRejected,
    exports.A2AEventType.ApprovalEscalated,
]);
/** All worktree event types. */
exports.WORKTREE_EVENT_TYPES = new Set([
    exports.A2AEventType.WorktreeCreated,
    exports.A2AEventType.WorktreeMerged,
    exports.A2AEventType.WorktreeConflict,
    exports.A2AEventType.WorktreeRemoved,
]);
// ---------------------------------------------------------------------------
// Internal event names used by the EventEmitter
// ---------------------------------------------------------------------------
/**
 * Internal event name for the global stream (all events).
 * SSE endpoints subscribe to this to receive every event.
 */
const GLOBAL_EVENT = '__a2a_global__';
/**
 * Internal event name prefix for task-scoped streams.
 * Format: __a2a_task__:{taskId}
 */
function taskEventKey(taskId) {
    return `__a2a_task__:${taskId}`;
}
/**
 * Internal event name prefix for channel-scoped streams.
 * Format: __a2a_channel__:{channelId}
 */
function channelEventKey(channelId) {
    return `__a2a_channel__:${channelId}`;
}
/**
 * Internal event name prefix for workspace-scoped streams.
 * Format: __a2a_workspace__:{workspaceId}
 */
function workspaceEventKey(workspaceId) {
    return `__a2a_workspace__:${workspaceId}`;
}
// ---------------------------------------------------------------------------
// A2AEventBus
// ---------------------------------------------------------------------------
class A2AEventBus {
    emitter;
    _eventCount = 0;
    retention = (0, data_hygiene_1.getA2ARetentionWindowConfig)();
    recentEvents = [];
    // ── NATS integration ────────────────────────────────────────────────────
    // Lazy-loaded: connectNats() initialises these. All publish() calls mirror
    // to NATS if connected; a NATS subscriber feeds remote events back into
    // the local EventEmitter for cross-process fan-in.
    _nats = null;
    _natsConnected = false;
    /** Track event IDs published by this instance to avoid re-emitting our own NATS messages. */
    _localEventIds = new Set();
    static LOCAL_ID_CAP = 10_000;
    constructor() {
        this.emitter = new events_1.EventEmitter();
        // Allow many concurrent SSE listeners without warning
        this.emitter.setMaxListeners(0);
        // Hydrate recent events from disk
        const persisted = (0, a2a_persistence_1.loadA2AEvents)();
        if (persisted.length > 0) {
            const now = Date.now();
            for (const event of persisted) {
                this.recentEvents.push({
                    event,
                    expiresAt: now + this.retention.eventTtlMs,
                });
            }
            logger.info({ count: persisted.length }, 'loaded persisted A2A events');
        }
        // Non-blocking NATS bootstrap
        void this.connectNats();
    }
    // -----------------------------------------------------------------------
    // NATS lifecycle
    // -----------------------------------------------------------------------
    /**
     * Connect to NATS JetStream and subscribe to the A2A_EVENTS stream.
     * Events published by other processes are fed into the local EventEmitter
     * so SSE subscribers see them without additional wiring.
     */
    async connectNats() {
        const natsUrl = process.env.NATS_URL;
        if (!natsUrl) {
            logger.debug('NATS_URL not set — event bus operating in local-only mode');
            return;
        }
        let natsLib;
        try {
            natsLib = await Function('return import("nats")')();
        }
        catch {
            logger.debug('nats package not installed — event bus operating in local-only mode');
            return;
        }
        try {
            const nc = await natsLib.connect({ servers: natsUrl });
            const js = nc.jetstream();
            const jsm = await nc.jetstreamManager();
            const codec = natsLib.JSONCodec();
            // Ensure A2A_EVENTS stream exists (catches all a2a.> subjects)
            const streamName = 'A2A_EVENTS';
            const streamConfig = {
                name: streamName,
                subjects: ['a2a.>'],
                max_age: 6 * 60 * 60 * 1_000_000_000, // 6h retention (nanoseconds)
                storage: 'file',
                retention: 'limits',
                discard: 'old',
            };
            try {
                await jsm.streams.info(streamName);
            }
            catch {
                await jsm.streams.add(streamConfig);
                logger.info('Created NATS JetStream stream: A2A_EVENTS');
            }
            this._nats = { js, codec, nc };
            this._natsConnected = true;
            // ── Cross-process fan-in: subscribe to a2a.> and emit locally ──
            const sub = nc.subscribe('a2a.>');
            (async () => {
                for await (const msg of sub) {
                    try {
                        const event = codec.decode(msg.data);
                        // Skip events we published ourselves
                        if (this._localEventIds.has(event.id))
                            continue;
                        // Emit into local EventEmitter so SSE consumers see it
                        this.emitter.emit(GLOBAL_EVENT, event);
                        if (event.taskId)
                            this.emitter.emit(taskEventKey(event.taskId), event);
                        if (event.channelId)
                            this.emitter.emit(channelEventKey(event.channelId), event);
                        if (event.workspaceId)
                            this.emitter.emit(workspaceEventKey(event.workspaceId), event);
                    }
                    catch (err) {
                        logger.debug({ err }, 'NATS message decode error');
                    }
                }
            })().catch(() => { });
            logger.info({ url: natsUrl }, 'A2A event bus connected to NATS — all events mirrored');
        }
        catch (err) {
            logger.warn({ err }, 'NATS connection failed — event bus operating in local-only mode');
        }
    }
    /**
     * Publish an event to NATS JetStream (non-blocking, best-effort).
     * Subject format: a2a.{event_type} e.g. a2a.task.submitted, a2a.canvas.update
     */
    publishToNats(event) {
        if (!this._nats || !this._natsConnected)
            return;
        // Track our own event IDs so we don't re-emit them from the NATS subscriber
        this._localEventIds.add(event.id);
        if (this._localEventIds.size > A2AEventBus.LOCAL_ID_CAP) {
            // Trim oldest 2000 entries (Set preserves insertion order)
            const iter = this._localEventIds.values();
            for (let i = 0; i < 2000; i++) {
                const { value } = iter.next();
                if (value !== undefined)
                    this._localEventIds.delete(value);
            }
        }
        const subject = `a2a.${event.type}`;
        this._nats.js.publish(subject, this._nats.codec.encode(event)).catch(() => {
            // Fire-and-forget — NATS is supplementary to the local EventEmitter
        });
    }
    // -----------------------------------------------------------------------
    // Publishing
    // -----------------------------------------------------------------------
    /**
     * Publish an event to the bus.
     *
     * The event is dispatched to:
     * 1. The global stream (always).
     * 2. The task-scoped stream (if taskId is present).
     * 3. The channel-scoped stream (if channelId is present).
     */
    publish(event) {
        this._eventCount++;
        event.data = (0, data_hygiene_1.redactSensitiveData)(event.data);
        this.trackEvent(event);
        logger.debug({ event_id: event.id, event_type: event.type, task_id: event.taskId, channel_id: event.channelId, workspace_id: event.workspaceId }, 'event published');
        // Local EventEmitter dispatch (in-process SSE consumers)
        this.emitter.emit(GLOBAL_EVENT, event);
        if (event.taskId)
            this.emitter.emit(taskEventKey(event.taskId), event);
        if (event.channelId)
            this.emitter.emit(channelEventKey(event.channelId), event);
        if (event.workspaceId)
            this.emitter.emit(workspaceEventKey(event.workspaceId), event);
        // NATS JetStream publish (cross-process fan-out)
        this.publishToNats(event);
    }
    trackEvent(event) {
        const now = Date.now();
        this.recentEvents.push({
            event,
            expiresAt: now + this.retention.eventTtlMs,
        });
        this.pruneRecentEvents(now);
        this.persistEvents();
    }
    /** Debounced write of recent events to disk. */
    persistEvents() {
        const events = this.recentEvents.map((item) => item.event);
        (0, a2a_persistence_1.saveA2AEvents)(events);
    }
    pruneRecentEvents(now = Date.now()) {
        while (this.recentEvents.length > 0 && this.recentEvents[0].expiresAt <= now) {
            this.recentEvents.shift();
        }
        while (this.recentEvents.length > this.retention.eventMaxRecords) {
            this.recentEvents.shift();
        }
    }
    // -----------------------------------------------------------------------
    // Subscribing
    // -----------------------------------------------------------------------
    /**
     * Subscribe to the global event stream (all events).
     * Returns an unsubscribe function.
     */
    subscribeGlobal(listener) {
        this.emitter.on(GLOBAL_EVENT, listener);
        return () => {
            this.emitter.removeListener(GLOBAL_EVENT, listener);
        };
    }
    /**
     * Subscribe to events for a specific task.
     * Returns an unsubscribe function.
     */
    subscribeTask(taskId, listener) {
        const key = taskEventKey(taskId);
        this.emitter.on(key, listener);
        return () => {
            this.emitter.removeListener(key, listener);
        };
    }
    /**
     * Subscribe to events for a specific channel.
     * Returns an unsubscribe function.
     */
    subscribeChannel(channelId, listener) {
        const key = channelEventKey(channelId);
        this.emitter.on(key, listener);
        return () => {
            this.emitter.removeListener(key, listener);
        };
    }
    /**
     * Subscribe to events for a specific workspace.
     * Returns an unsubscribe function.
     */
    subscribeWorkspace(workspaceId, listener) {
        const key = workspaceEventKey(workspaceId);
        this.emitter.on(key, listener);
        return () => {
            this.emitter.removeListener(key, listener);
        };
    }
    // -----------------------------------------------------------------------
    // Diagnostics
    // -----------------------------------------------------------------------
    /** Total number of events published since construction. */
    get eventCount() {
        return this._eventCount;
    }
    /** Number of listeners on the global stream. */
    get globalListenerCount() {
        return this.emitter.listenerCount(GLOBAL_EVENT);
    }
    /** Number of listeners for a specific task. */
    taskListenerCount(taskId) {
        return this.emitter.listenerCount(taskEventKey(taskId));
    }
    /** Number of listeners for a specific channel. */
    channelListenerCount(channelId) {
        return this.emitter.listenerCount(channelEventKey(channelId));
    }
    /** Number of listeners for a specific workspace. */
    workspaceListenerCount(workspaceId) {
        return this.emitter.listenerCount(workspaceEventKey(workspaceId));
    }
    /** Whether NATS JetStream is connected for cross-process event mirroring. */
    get natsConnected() {
        return this._natsConnected;
    }
    /** Remove all listeners and close NATS (for testing / shutdown). */
    removeAllListeners() {
        this.emitter.removeAllListeners();
        if (this._nats && this._natsConnected) {
            this._natsConnected = false;
            this._nats.nc.drain().catch(() => { });
            this._nats = null;
        }
    }
    /** Return recent retained events (newest last). */
    getRecentEvents(limit = 100) {
        this.pruneRecentEvents();
        const normalizedLimit = Math.max(0, Math.floor(limit));
        if (normalizedLimit === 0)
            return [];
        return this.recentEvents.slice(-normalizedLimit).map((item) => item.event);
    }
}
exports.A2AEventBus = A2AEventBus;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _defaultEventBus = null;
/** Get or create the default singleton event bus. */
function getA2AEventBus() {
    if (!_defaultEventBus) {
        _defaultEventBus = new A2AEventBus();
    }
    return _defaultEventBus;
}
/** Reset the singleton (for testing). */
function resetA2AEventBus() {
    if (_defaultEventBus) {
        _defaultEventBus.removeAllListeners();
    }
    _defaultEventBus = null;
}
