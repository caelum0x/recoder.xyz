/**
 * @module a2a-event-bridge
 *
 * Bridges existing service callbacks (TaskLifecycleService audit sinks,
 * CollaborationService messages, agent registration) into the unified
 * A2AEventBus for SSE streaming.
 *
 * Call `wireA2AEventBridge()` once during server startup to register the
 * audit sink on the TaskLifecycleService singleton and connect all event
 * sources to the event bus.
 */

import {
  getA2AEventBus,
  A2AEventType,
  type A2AEvent,
} from './a2a-event-bus';
import {
  getTaskLifecycleService,
  generateId,
  type AuditEventSink,
} from './task-lifecycle.service';
import { getHeartbeatTracker } from './heartbeat-tracker.service';
import { createNatsEventBus, type NatsEventBus } from './nats-event-bus';
import { createLogger } from '../logger';

const logger = createLogger('a2a-event-bridge');

// NATS event bus singleton — initialised lazily in wireA2AEventBridge
let _natsEventBus: NatsEventBus | null = null;

// ---------------------------------------------------------------------------
// Audit event type -> SSE event type mapping
// ---------------------------------------------------------------------------

/**
 * Maps audit event types (from AuditEventTypeEnum) to SSE event types
 * (from A2AEventType). The audit events use dot-separated names like
 * 'task.submitted', 'task.started', etc.
 */
const AUDIT_TO_SSE_EVENT_TYPE: Record<string, string> = {
  'task.submitted': A2AEventType.TaskSubmitted,
  'task.started': A2AEventType.TaskStarted,
  'task.progress': A2AEventType.TaskProgress,
  'task.input_required': A2AEventType.TaskInputRequired,
  'task.completed': A2AEventType.TaskCompleted,
  'task.failed': A2AEventType.TaskFailed,
  'task.cancelled': A2AEventType.TaskCancelled,
};

// ---------------------------------------------------------------------------
// Bridge setup
// ---------------------------------------------------------------------------

let _bridgeWired = false;
let _heartbeatOnlineListener: ((payload: any) => void) | null = null;
let _heartbeatOfflineListener: ((payload: any) => void) | null = null;

/**
 * Wire the A2A event bridge.
 *
 * This registers an AuditEventSink on the TaskLifecycleService singleton
 * that publishes every audit event to the A2AEventBus. The event bus then
 * dispatches to all SSE subscribers.
 *
 * Safe to call multiple times; only the first invocation has effect.
 */
export function wireA2AEventBridge(): void {
  if (_bridgeWired) {
    logger.debug('A2A event bridge already wired, skipping');
    return;
  }

  const eventBus = getA2AEventBus();
  const lifecycleService = getTaskLifecycleService();

  // Register audit sink that bridges to event bus
  const auditSink: AuditEventSink = (auditEvent) => {
    const sseEventType = AUDIT_TO_SSE_EVENT_TYPE[auditEvent.event_type];
    if (!sseEventType) {
      logger.debug(
        { audit_event_type: auditEvent.event_type },
        'no SSE mapping for audit event type, skipping',
      );
      return;
    }

    // Fetch the current task envelope to include in the event payload
    const taskId = auditEvent.task_id;
    let taskData: Record<string, unknown> = {};

    if (taskId) {
      const taskResult = lifecycleService.getTask(taskId);
      if (taskResult.ok) {
        taskData = { task: taskResult.data };
      }
    }

    const event: A2AEvent = {
      id: auditEvent.id || generateId('sse'),
      type: sseEventType,
      timestamp: auditEvent.timestamp || new Date().toISOString(),
      data: {
        ...taskData,
        audit: {
          event_type: auditEvent.event_type,
          severity: auditEvent.severity,
          actor: auditEvent.actor,
          target: auditEvent.target,
          metadata: auditEvent.metadata,
        },
      },
      taskId: taskId || undefined,
    };

    eventBus.publish(event);

    // ── NATS JetStream publish (non-blocking, best-effort) ──
    // Mirrors every task lifecycle event to NATS A2A_TASKS stream so
    // external consumers (multi-process bridge, monitoring) get real-time feed.
    if (_natsEventBus) {
      const natsSubject = `task.${auditEvent.event_type.replace('task.', '')}`;
      _natsEventBus.publish('A2A_TASKS', natsSubject, {
        id: event.id,
        type: event.type,
        timestamp: event.timestamp,
        taskId: event.taskId,
        data: event.data,
      }).catch(() => {}); // fire-and-forget — NATS is a supplement, not primary
    }
  };

  lifecycleService.addAuditSink(auditSink);

  // Wire HeartbeatTracker agent:online / agent:offline events to the event bus
  const heartbeatTracker = getHeartbeatTracker();

  _heartbeatOnlineListener = (payload: any) => {
    eventBus.publish({
      id: generateId('sse'),
      type: A2AEventType.AgentOnline,
      timestamp: payload.timestamp,
      data: {
        agentId: payload.agentId,
        status: payload.status,
      },
    });
  };

  _heartbeatOfflineListener = (payload: any) => {
    eventBus.publish({
      id: generateId('sse'),
      type: A2AEventType.AgentOffline,
      timestamp: payload.timestamp,
      data: {
        agentId: payload.agentId,
        lastHeartbeat: payload.lastHeartbeat,
      },
    });
  };

  heartbeatTracker.events.on('agent:online', _heartbeatOnlineListener);
  heartbeatTracker.events.on('agent:offline', _heartbeatOfflineListener);

  // ── Bootstrap NATS event bus (non-blocking) ──
  // Connects to NATS if NATS_URL is set; otherwise creates a no-op bus.
  // All NATS publishes above become live once this resolves.
  createNatsEventBus()
    .then((bus) => {
      _natsEventBus = bus;
      if (bus.isConnected()) {
        logger.info('NATS JetStream event bus connected — task lifecycle events will be mirrored');
      } else {
        logger.info('NATS event bus initialised in no-op mode (NATS not available)');
      }
    })
    .catch((err) => {
      logger.warn({ err }, 'NATS event bus bootstrap failed — continuing without NATS');
    });

  _bridgeWired = true;
  logger.info('A2A event bridge wired: TaskLifecycleService + HeartbeatTracker -> A2AEventBus');
}

/**
 * Reset the bridge state (for testing).
 * Removes heartbeat tracker listeners that were added during wiring.
 */
export function resetA2AEventBridge(): void {
  // Clean up HeartbeatTracker listeners if they were registered
  if (_heartbeatOnlineListener || _heartbeatOfflineListener) {
    try {
      const heartbeatTracker = getHeartbeatTracker();
      if (_heartbeatOnlineListener) {
        heartbeatTracker.events.off('agent:online', _heartbeatOnlineListener);
      }
      if (_heartbeatOfflineListener) {
        heartbeatTracker.events.off('agent:offline', _heartbeatOfflineListener);
      }
    } catch {
      // Tracker may already be destroyed
    }
  }
  _heartbeatOnlineListener = null;
  _heartbeatOfflineListener = null;
  _bridgeWired = false;
}

// ---------------------------------------------------------------------------
// Channel event helpers
// ---------------------------------------------------------------------------

/**
 * Publish a channel message event to the event bus.
 *
 * Call this from CollaborationService.sendMessage() or wherever
 * channel messages are created.
 */
export function publishChannelMessage(
  channelId: string,
  message: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.MessageNew,
    timestamp: new Date().toISOString(),
    data: { channelId, message },
    channelId,
  });
}

/**
 * Publish a message updated event to the event bus.
 */
export function publishMessageUpdated(
  channelId: string,
  message: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.MessageUpdated,
    timestamp: new Date().toISOString(),
    data: { channelId, message },
    channelId,
  });
}

/**
 * Publish a message deleted event to the event bus.
 */
export function publishMessageDeleted(
  channelId: string,
  messageId: string,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.MessageDeleted,
    timestamp: new Date().toISOString(),
    data: { channelId, messageId },
    channelId,
  });
}

/**
 * Publish a thread created event to the event bus.
 */
export function publishThreadCreated(
  channelId: string,
  thread: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.ThreadCreated,
    timestamp: new Date().toISOString(),
    data: { channelId, thread },
    channelId,
  });
}

/**
 * Publish a member joined event to the event bus.
 */
export function publishMemberJoined(
  channelId: string,
  member: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.MemberJoined,
    timestamp: new Date().toISOString(),
    data: { channelId, member },
    channelId,
  });
}

/**
 * Publish a member left event to the event bus.
 */
export function publishMemberLeft(
  channelId: string,
  member: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.MemberLeft,
    timestamp: new Date().toISOString(),
    data: { channelId, member },
    channelId,
  });
}

// ---------------------------------------------------------------------------
// Agent event helpers
// ---------------------------------------------------------------------------

/**
 * Publish an agent registered event to the event bus.
 */
export function publishAgentRegistered(
  agent: Record<string, unknown>,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.AgentRegistered,
    timestamp: new Date().toISOString(),
    data: { agent },
  });
}

/**
 * Publish an agent deregistered event to the event bus.
 */
export function publishAgentDeregistered(
  agentId: string,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.AgentDeregistered,
    timestamp: new Date().toISOString(),
    data: { agentId },
  });
}

/**
 * Publish an agent online event to the event bus.
 */
export function publishAgentOnline(
  agentId: string,
  status: string,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.AgentOnline,
    timestamp: new Date().toISOString(),
    data: { agentId, status },
  });
}

/**
 * Publish an agent offline event to the event bus.
 */
export function publishAgentOffline(
  agentId: string,
  lastHeartbeat: string,
): void {
  const eventBus = getA2AEventBus();
  eventBus.publish({
    id: generateId('sse'),
    type: A2AEventType.AgentOffline,
    timestamp: new Date().toISOString(),
    data: { agentId, lastHeartbeat },
  });
}
