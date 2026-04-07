"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.wireA2AEventBridge = wireA2AEventBridge;
exports.resetA2AEventBridge = resetA2AEventBridge;
exports.publishChannelMessage = publishChannelMessage;
exports.publishMessageUpdated = publishMessageUpdated;
exports.publishMessageDeleted = publishMessageDeleted;
exports.publishThreadCreated = publishThreadCreated;
exports.publishMemberJoined = publishMemberJoined;
exports.publishMemberLeft = publishMemberLeft;
exports.publishAgentRegistered = publishAgentRegistered;
exports.publishAgentDeregistered = publishAgentDeregistered;
exports.publishAgentOnline = publishAgentOnline;
exports.publishAgentOffline = publishAgentOffline;
const a2a_event_bus_1 = require("./a2a-event-bus");
const task_lifecycle_service_1 = require("./task-lifecycle.service");
const heartbeat_tracker_service_1 = require("./heartbeat-tracker.service");
const logger_1 = require("../logger");
const logger = (0, logger_1.createLogger)('a2a-event-bridge');
function toRecord(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return undefined;
    }
    return value;
}
// ---------------------------------------------------------------------------
// Audit event type -> SSE event type mapping
// ---------------------------------------------------------------------------
/**
 * Maps audit event types (from AuditEventTypeEnum) to SSE event types
 * (from A2AEventType). The audit events use dot-separated names like
 * 'task.submitted', 'task.started', etc.
 */
const AUDIT_TO_SSE_EVENT_TYPE = {
    'task.submitted': a2a_event_bus_1.A2AEventType.TaskSubmitted,
    'task.started': a2a_event_bus_1.A2AEventType.TaskStarted,
    'task.progress': a2a_event_bus_1.A2AEventType.TaskProgress,
    'task.input_required': a2a_event_bus_1.A2AEventType.TaskInputRequired,
    'task.completed': a2a_event_bus_1.A2AEventType.TaskCompleted,
    'task.failed': a2a_event_bus_1.A2AEventType.TaskFailed,
    'task.cancelled': a2a_event_bus_1.A2AEventType.TaskCancelled,
};
// ---------------------------------------------------------------------------
// Bridge setup
// ---------------------------------------------------------------------------
let _bridgeWired = false;
let _heartbeatOnlineListener = null;
let _heartbeatOfflineListener = null;
/**
 * Wire the A2A event bridge.
 *
 * This registers an AuditEventSink on the TaskLifecycleService singleton
 * that publishes every audit event to the A2AEventBus. The event bus then
 * dispatches to all SSE subscribers.
 *
 * Safe to call multiple times; only the first invocation has effect.
 */
function wireA2AEventBridge() {
    if (_bridgeWired) {
        logger.debug('A2A event bridge already wired, skipping');
        return;
    }
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    const lifecycleService = (0, task_lifecycle_service_1.getTaskLifecycleService)();
    // Register audit sink that bridges to event bus
    const auditSink = (auditEvent) => {
        const sseEventType = AUDIT_TO_SSE_EVENT_TYPE[auditEvent.event_type];
        if (!sseEventType) {
            logger.debug({ audit_event_type: auditEvent.event_type }, 'no SSE mapping for audit event type, skipping');
            return;
        }
        // Fetch the current task envelope to include in the event payload
        const taskId = auditEvent.task_id;
        let taskData = {};
        if (taskId) {
            const taskResult = lifecycleService.getTask(taskId);
            if (taskResult.ok) {
                taskData = { task: taskResult.data };
            }
        }
        const event = {
            id: auditEvent.id || (0, task_lifecycle_service_1.generateId)('sse'),
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
        // ── PM integration: completed tasks with intent=feature → create PM feature ──
        if (auditEvent.event_type === 'task.completed' && taskId) {
            const taskResult = lifecycleService.getTask(taskId);
            if (taskResult.ok) {
                const payload = toRecord(taskResult.data.payload);
                const intent = payload?.intent;
                if (intent === 'feature' || intent === 'implement') {
                    const title = String(payload?.task ?? payload?.title ?? `Feature from task ${taskId}`);
                    const result = toRecord(taskResult.data.result);
                    const description = String(result?.text
                        ?? payload?.description
                        ?? '');
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
                        if (res.ok)
                            logger.info({ taskId, title: title.slice(0, 80) }, 'PM feature created from completed task');
                        else
                            logger.debug({ taskId, status: res.status }, 'PM feature creation skipped (API error)');
                    }).catch(() => {
                        // Non-fatal — PM might not be running
                    });
                }
            }
        }
    };
    lifecycleService.addAuditSink(auditSink);
    // Wire HeartbeatTracker agent:online / agent:offline events to the event bus
    const heartbeatTracker = (0, heartbeat_tracker_service_1.getHeartbeatTracker)();
    _heartbeatOnlineListener = (payload) => {
        eventBus.publish({
            id: (0, task_lifecycle_service_1.generateId)('sse'),
            type: a2a_event_bus_1.A2AEventType.AgentOnline,
            timestamp: payload.timestamp,
            data: {
                agentId: payload.agentId,
                status: payload.status,
            },
        });
    };
    _heartbeatOfflineListener = (payload) => {
        eventBus.publish({
            id: (0, task_lifecycle_service_1.generateId)('sse'),
            type: a2a_event_bus_1.A2AEventType.AgentOffline,
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
function resetA2AEventBridge() {
    // Clean up HeartbeatTracker listeners if they were registered
    if (_heartbeatOnlineListener || _heartbeatOfflineListener) {
        try {
            const heartbeatTracker = (0, heartbeat_tracker_service_1.getHeartbeatTracker)();
            if (_heartbeatOnlineListener) {
                heartbeatTracker.events.off('agent:online', _heartbeatOnlineListener);
            }
            if (_heartbeatOfflineListener) {
                heartbeatTracker.events.off('agent:offline', _heartbeatOfflineListener);
            }
        }
        catch {
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
function publishChannelMessage(channelId, message) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.MessageNew,
        timestamp: new Date().toISOString(),
        data: { channelId, message },
        channelId,
    });
}
/**
 * Publish a message updated event to the event bus.
 */
function publishMessageUpdated(channelId, message) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.MessageUpdated,
        timestamp: new Date().toISOString(),
        data: { channelId, message },
        channelId,
    });
}
/**
 * Publish a message deleted event to the event bus.
 */
function publishMessageDeleted(channelId, messageId) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.MessageDeleted,
        timestamp: new Date().toISOString(),
        data: { channelId, messageId },
        channelId,
    });
}
/**
 * Publish a thread created event to the event bus.
 */
function publishThreadCreated(channelId, thread) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.ThreadCreated,
        timestamp: new Date().toISOString(),
        data: { channelId, thread },
        channelId,
    });
}
/**
 * Publish a member joined event to the event bus.
 */
function publishMemberJoined(channelId, member) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.MemberJoined,
        timestamp: new Date().toISOString(),
        data: { channelId, member },
        channelId,
    });
}
/**
 * Publish a member left event to the event bus.
 */
function publishMemberLeft(channelId, member) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.MemberLeft,
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
function publishAgentRegistered(agent) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.AgentRegistered,
        timestamp: new Date().toISOString(),
        data: { agent },
    });
}
/**
 * Publish an agent deregistered event to the event bus.
 */
function publishAgentDeregistered(agentId) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.AgentDeregistered,
        timestamp: new Date().toISOString(),
        data: { agentId },
    });
}
/**
 * Publish an agent online event to the event bus.
 */
function publishAgentOnline(agentId, status) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.AgentOnline,
        timestamp: new Date().toISOString(),
        data: { agentId, status },
    });
}
/**
 * Publish an agent offline event to the event bus.
 */
function publishAgentOffline(agentId, lastHeartbeat) {
    const eventBus = (0, a2a_event_bus_1.getA2AEventBus)();
    eventBus.publish({
        id: (0, task_lifecycle_service_1.generateId)('sse'),
        type: a2a_event_bus_1.A2AEventType.AgentOffline,
        timestamp: new Date().toISOString(),
        data: { agentId, lastHeartbeat },
    });
}
