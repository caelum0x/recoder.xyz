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
import { createLogger } from '../logger';
import type { AuditEvent, TaskEnvelope, TaskEvidenceItem } from '@recoder/shared/a2a';

const logger = createLogger('a2a-event-bridge');

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

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

const AUDIT_TO_CONTROL_PLANE_EVENT_TYPE: Record<string, string> = {
  'task.submitted': 'task.submitted',
  'task.started': 'task.started',
  'task.input_required': 'task.input-required',
  'task.completed': 'task.completed',
  'task.failed': 'task.failed',
  'task.cancelled': 'task.cancelled',
};

type ControlPlaneGatewayModule = {
  appendTaskScopedControlPlaneLifecycleEvent(input: {
    taskId: string;
    eventType: string;
    actorId?: string | null;
    state?: string | null;
    detail?: Record<string, unknown>;
  }): Promise<void>;
  appendControlPlaneEvidence(input: {
    workspaceId: string;
    threadId: string;
    traceId: string;
    taskId?: string | null;
    agentId?: string | null;
    evidence: Array<{
      kind: string;
      label: string;
      ref?: string | null;
      metadata?: Record<string, unknown> | null;
    }>;
  }): Promise<void>;
};

let controlPlaneGatewayModulePromise: Promise<ControlPlaneGatewayModule> | null = null;

function getControlPlaneGatewayModule(): Promise<ControlPlaneGatewayModule> {
  if (!controlPlaneGatewayModulePromise) {
    controlPlaneGatewayModulePromise = import('../a2a-gateway.js').then((module) => ({
      appendTaskScopedControlPlaneLifecycleEvent: module.appendTaskScopedControlPlaneLifecycleEvent,
      appendControlPlaneEvidence: module.appendControlPlaneEvidence,
    }));
  }
  return controlPlaneGatewayModulePromise;
}

function readEvidenceMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function extractTaskEvidence(task: TaskEnvelope): Array<{
  kind: string;
  label: string;
  ref?: string | null;
  metadata?: Record<string, unknown> | null;
}> {
  const evidence = Array.isArray(task.result?.evidence) ? task.result?.evidence : [];
  return evidence
    .map((item: TaskEvidenceItem) => ({
      kind: typeof item.kind === 'string' ? item.kind : '',
      label: typeof item.label === 'string' ? item.label : '',
      ref: typeof item.ref === 'string' && item.ref.trim().length > 0 ? item.ref : null,
      metadata: readEvidenceMetadata(item.metadata),
    }))
    .filter((item) => Boolean(item.kind && item.label));
}

async function projectAuditEventToControlPlaneHistory(
  lifecycleService: ReturnType<typeof getTaskLifecycleService>,
  auditEvent: AuditEvent,
): Promise<void> {
  const taskId = auditEvent.task_id;
  if (!taskId) return;

  const taskResult = lifecycleService.getTask(taskId);
  if (!taskResult.ok) return;

  const task = taskResult.data;
  const gateway = await getControlPlaneGatewayModule();
  const lifecycleEventType = AUDIT_TO_CONTROL_PLANE_EVENT_TYPE[auditEvent.event_type];
  const actorId =
    typeof auditEvent.actor?.id === 'string' && auditEvent.actor.id.trim().length > 0
      ? auditEvent.actor.id
      : null;

  if (lifecycleEventType) {
    await gateway.appendTaskScopedControlPlaneLifecycleEvent({
      taskId: task.id,
      eventType: lifecycleEventType,
      actorId,
      state: task.state,
      detail: {
        auditEventType: auditEvent.event_type,
        ...(toRecord(auditEvent.metadata) ?? {}),
      },
    });
  }

  const evidence = extractTaskEvidence(task);
  if (evidence.length === 0) return;

  await gateway.appendControlPlaneEvidence({
    workspaceId: task.workspace_id,
    threadId: task.thread_id,
    traceId: task.trace_id,
    taskId: task.id,
    agentId: task.assignee.agent_id,
    evidence,
  });
}

// ---------------------------------------------------------------------------
// Bridge setup
// ---------------------------------------------------------------------------

let _bridgeWired = false;
let _heartbeatOnlineListener: ((payload: any) => void) | null = null;
let _heartbeatOfflineListener: ((payload: any) => void) | null = null;
let controlPlaneProjectionQueue: Promise<void> = Promise.resolve();

function enqueueControlPlaneProjection(
  lifecycleService: ReturnType<typeof getTaskLifecycleService>,
  auditEvent: AuditEvent,
): void {
  controlPlaneProjectionQueue = controlPlaneProjectionQueue
    .catch(() => undefined)
    .then(() => projectAuditEventToControlPlaneHistory(lifecycleService, auditEvent))
    .catch((error) => {
      logger.warn(
        {
          err: error,
          taskId: auditEvent.task_id,
          auditEventType: auditEvent.event_type,
        },
        'failed to project task audit event into control-plane history',
      );
    });
}

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
    // NATS mirroring is handled automatically by A2AEventBus.publishToNats()

    enqueueControlPlaneProjection(lifecycleService, auditEvent);

    // ── PM integration: completed tasks with intent=feature → create PM feature ──
    if (auditEvent.event_type === 'task.completed' && taskId) {
      const taskResult = lifecycleService.getTask(taskId);
      if (taskResult.ok) {
        const payload = toRecord(taskResult.data.payload);
        const intent = payload?.intent;
        if (intent === 'feature' || intent === 'implement') {
          const title = String(payload?.task ?? payload?.title ?? `Feature from task ${taskId}`);
          const result = toRecord(taskResult.data.result);
          const description = String(
            result?.text
            ?? payload?.description
            ?? ''
          );
          // Non-blocking: create PM feature via recoder-pm API
          const pmUrl = process.env.RECODER_PM_URL ?? 'http://recoder-pm:3004';
          fetch(`${pmUrl}/api/features`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: title.slice(0, 200),
              description: description.slice(0, 2000),
              status: 'done',
              source: 'a2a',
              sourceTaskId: taskId,
            }),
            signal: AbortSignal.timeout(10_000),
          }).then((res) => {
            if (res.ok) logger.info({ taskId, title: title.slice(0, 80) }, 'PM feature created from completed task');
            else logger.debug({ taskId, status: res.status }, 'PM feature creation skipped (API error)');
          }).catch(() => {
            // Non-fatal — PM might not be running
          });
        }
      }
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

  // NATS connection is managed by A2AEventBus itself (connectNats on construction).
  // All events published via eventBus.publish() are automatically mirrored to NATS.

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
  controlPlaneProjectionQueue = Promise.resolve();
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
