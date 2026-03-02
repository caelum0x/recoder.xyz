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

import { EventEmitter } from 'events';
import { createLogger } from '../logger';
import { getA2ARetentionWindowConfig, redactSensitiveData } from './data-hygiene';
import { loadA2AEvents, saveA2AEvents } from './a2a-persistence';

const logger = createLogger('a2a-event-bus');

// ---------------------------------------------------------------------------
// Event type constants
// ---------------------------------------------------------------------------

export const A2AEventType = {
  // Task events
  TaskSubmitted: 'task.submitted',
  TaskStarted: 'task.started',
  TaskProgress: 'task.progress',
  TaskInputRequired: 'task.input-required',
  TaskCompleted: 'task.completed',
  TaskFailed: 'task.failed',
  TaskCancelled: 'task.cancelled',

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
} as const;

export type A2AEventTypeValue = (typeof A2AEventType)[keyof typeof A2AEventType];

/** All task event types (for filtering). */
export const TASK_EVENT_TYPES = new Set<string>([
  A2AEventType.TaskSubmitted,
  A2AEventType.TaskStarted,
  A2AEventType.TaskProgress,
  A2AEventType.TaskInputRequired,
  A2AEventType.TaskCompleted,
  A2AEventType.TaskFailed,
  A2AEventType.TaskCancelled,
]);

/** Terminal task event types (stream should auto-close after these). */
export const TERMINAL_TASK_EVENT_TYPES = new Set<string>([
  A2AEventType.TaskCompleted,
  A2AEventType.TaskFailed,
  A2AEventType.TaskCancelled,
]);

/** All channel event types. */
export const CHANNEL_EVENT_TYPES = new Set<string>([
  A2AEventType.MessageNew,
  A2AEventType.ThreadCreated,
  A2AEventType.MemberJoined,
  A2AEventType.MemberLeft,
]);

/** All agent event types. */
export const AGENT_EVENT_TYPES = new Set<string>([
  A2AEventType.AgentRegistered,
  A2AEventType.AgentDeregistered,
  A2AEventType.AgentOnline,
  A2AEventType.AgentOffline,
]);

/** All workspace event types. */
export const WORKSPACE_EVENT_TYPES = new Set<string>([
  A2AEventType.WorkspaceCreated,
  A2AEventType.WorkspaceUpdated,
  A2AEventType.WorkspaceDeleted,
  A2AEventType.WorkspaceAgentAdded,
  A2AEventType.WorkspaceAgentRemoved,
]);

/** All handoff/delegation event types. */
export const HANDOFF_EVENT_TYPES = new Set<string>([
  A2AEventType.HandoffInitiated,
  A2AEventType.HandoffCompleted,
  A2AEventType.DelegationCreated,
  A2AEventType.DelegationCompleted,
]);

/** All approval event types. */
export const APPROVAL_EVENT_TYPES = new Set<string>([
  A2AEventType.ApprovalRequested,
  A2AEventType.ApprovalGranted,
  A2AEventType.ApprovalRejected,
  A2AEventType.ApprovalEscalated,
]);

/** All worktree event types. */
export const WORKTREE_EVENT_TYPES = new Set<string>([
  A2AEventType.WorktreeCreated,
  A2AEventType.WorktreeMerged,
  A2AEventType.WorktreeConflict,
  A2AEventType.WorktreeRemoved,
]);

// ---------------------------------------------------------------------------
// Event payload types
// ---------------------------------------------------------------------------

export interface A2AEvent {
  /** Unique event ID. */
  id: string;
  /** Event type from the A2AEventType taxonomy. */
  type: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The payload data (shape depends on event type). */
  data: Record<string, unknown>;
  /** Optional: task ID for task-scoped events. */
  taskId?: string;
  /** Optional: channel ID for channel-scoped events. */
  channelId?: string;
  /** Optional: workspace ID for workspace-scoped events. */
  workspaceId?: string;
}

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
function taskEventKey(taskId: string): string {
  return `__a2a_task__:${taskId}`;
}

/**
 * Internal event name prefix for channel-scoped streams.
 * Format: __a2a_channel__:{channelId}
 */
function channelEventKey(channelId: string): string {
  return `__a2a_channel__:${channelId}`;
}

/**
 * Internal event name prefix for workspace-scoped streams.
 * Format: __a2a_workspace__:{workspaceId}
 */
function workspaceEventKey(workspaceId: string): string {
  return `__a2a_workspace__:${workspaceId}`;
}

// ---------------------------------------------------------------------------
// A2AEventBus
// ---------------------------------------------------------------------------

export class A2AEventBus {
  private readonly emitter: EventEmitter;
  private _eventCount = 0;
  private readonly retention = getA2ARetentionWindowConfig();
  private readonly recentEvents: Array<{ event: A2AEvent; expiresAt: number }> = [];

  constructor() {
    this.emitter = new EventEmitter();
    // Allow many concurrent SSE listeners without warning
    this.emitter.setMaxListeners(0);

    // Hydrate recent events from disk
    const persisted = loadA2AEvents();
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
  publish(event: A2AEvent): void {
    this._eventCount++;
    event.data = redactSensitiveData(event.data) as Record<string, unknown>;
    this.trackEvent(event);

    logger.debug(
      { event_id: event.id, event_type: event.type, task_id: event.taskId, channel_id: event.channelId, workspace_id: event.workspaceId },
      'event published',
    );

    // Global stream
    this.emitter.emit(GLOBAL_EVENT, event);

    // Task-scoped stream
    if (event.taskId) {
      this.emitter.emit(taskEventKey(event.taskId), event);
    }

    // Channel-scoped stream
    if (event.channelId) {
      this.emitter.emit(channelEventKey(event.channelId), event);
    }

    // Workspace-scoped stream
    if (event.workspaceId) {
      this.emitter.emit(workspaceEventKey(event.workspaceId), event);
    }
  }

  private trackEvent(event: A2AEvent): void {
    const now = Date.now();
    this.recentEvents.push({
      event,
      expiresAt: now + this.retention.eventTtlMs,
    });
    this.pruneRecentEvents(now);
    this.persistEvents();
  }

  /** Debounced write of recent events to disk. */
  private persistEvents(): void {
    const events = this.recentEvents.map((item) => item.event);
    saveA2AEvents(events);
  }

  private pruneRecentEvents(now = Date.now()): void {
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
  subscribeGlobal(listener: (event: A2AEvent) => void): () => void {
    this.emitter.on(GLOBAL_EVENT, listener);
    return () => {
      this.emitter.removeListener(GLOBAL_EVENT, listener);
    };
  }

  /**
   * Subscribe to events for a specific task.
   * Returns an unsubscribe function.
   */
  subscribeTask(taskId: string, listener: (event: A2AEvent) => void): () => void {
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
  subscribeChannel(channelId: string, listener: (event: A2AEvent) => void): () => void {
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
  subscribeWorkspace(workspaceId: string, listener: (event: A2AEvent) => void): () => void {
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
  get eventCount(): number {
    return this._eventCount;
  }

  /** Number of listeners on the global stream. */
  get globalListenerCount(): number {
    return this.emitter.listenerCount(GLOBAL_EVENT);
  }

  /** Number of listeners for a specific task. */
  taskListenerCount(taskId: string): number {
    return this.emitter.listenerCount(taskEventKey(taskId));
  }

  /** Number of listeners for a specific channel. */
  channelListenerCount(channelId: string): number {
    return this.emitter.listenerCount(channelEventKey(channelId));
  }

  /** Number of listeners for a specific workspace. */
  workspaceListenerCount(workspaceId: string): number {
    return this.emitter.listenerCount(workspaceEventKey(workspaceId));
  }

  /** Remove all listeners (for testing / shutdown). */
  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }

  /** Return recent retained events (newest last). */
  getRecentEvents(limit = 100): A2AEvent[] {
    this.pruneRecentEvents();
    const normalizedLimit = Math.max(0, Math.floor(limit));
    if (normalizedLimit === 0) return [];
    return this.recentEvents.slice(-normalizedLimit).map((item) => item.event);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let _defaultEventBus: A2AEventBus | null = null;

/** Get or create the default singleton event bus. */
export function getA2AEventBus(): A2AEventBus {
  if (!_defaultEventBus) {
    _defaultEventBus = new A2AEventBus();
  }
  return _defaultEventBus;
}

/** Reset the singleton (for testing). */
export function resetA2AEventBus(): void {
  if (_defaultEventBus) {
    _defaultEventBus.removeAllListeners();
  }
  _defaultEventBus = null;
}
