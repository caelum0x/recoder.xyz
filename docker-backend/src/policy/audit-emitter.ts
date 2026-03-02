/**
 * @module policy/audit-emitter
 *
 * Audit event emitter for the policy plane.
 *
 * Translates policy decisions, approval operations, and revocations
 * into canonical AuditEvent records as defined in
 * @recoder/shared/a2a/schemas/audit-event.
 *
 * Events are emitted to:
 * 1. The structured logger (always)
 * 2. An optional event handler callback (for wiring into Redis streams,
 *    the a2a audit pipeline, etc.)
 */

import { v4 as uuid } from 'uuid';
import { createLogger } from '../logger.js';
import type { PolicyDecision } from './types.js';
import type { Approval } from './types.js';
import { PolicyDecisionOutcomeEnum } from './types.js';

const logger = createLogger('policy:audit');

// ---------------------------------------------------------------------------
// Audit Event Types (aligned with canonical AuditEventTypeEnum)
// ---------------------------------------------------------------------------

/**
 * Policy-specific audit event types.
 * These values match the canonical AuditEventTypeEnum from shared/a2a/schemas.
 */
export const PolicyAuditEventType = {
  PolicyChecked: 'policy.checked',
  PolicyApproved: 'policy.approved',
  PolicyDenied: 'policy.denied',
  /** Extension: approval was revoked. */
  PolicyRevoked: 'policy.revoked',
  /** Extension: approval was created. */
  PolicyApprovalCreated: 'policy.approval_created',
} as const;

export type PolicyAuditEventTypeValue =
  (typeof PolicyAuditEventType)[keyof typeof PolicyAuditEventType];

// ---------------------------------------------------------------------------
// Audit Event Structure
// ---------------------------------------------------------------------------

/**
 * A policy audit event record.
 *
 * Structured to be compatible with the canonical AuditEvent schema
 * while remaining self-contained for the policy plane.
 */
export interface PolicyAuditEvent {
  /** Unique event ID. */
  id: string;
  /** Event type. */
  event_type: PolicyAuditEventTypeValue;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** Distributed trace ID. */
  trace_id: string;
  /** Actor who triggered the event. */
  actor: {
    kind: 'agent' | 'user' | 'system';
    id: string;
  };
  /** Target resource of the event. */
  target: {
    kind: 'policy' | 'task';
    id: string;
  };
  /** Policy decision context. */
  policy: {
    action: string;
    resource: string;
    rule: string;
    approved: boolean;
    reason: string;
  };
  /** Optional task ID. */
  task_id?: string;
  /** Optional approval ID. */
  approval_id?: string;
  /** Duration of policy check in milliseconds. */
  duration_ms?: number;
  /** Additional metadata. */
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Event Handler
// ---------------------------------------------------------------------------

/**
 * Callback type for external audit event consumers.
 */
export type PolicyAuditHandler = (event: PolicyAuditEvent) => void;

/** Registered external handlers. */
const handlers: PolicyAuditHandler[] = [];

/**
 * Register an external handler to receive policy audit events.
 *
 * @param handler - The handler callback.
 */
export function onPolicyAuditEvent(handler: PolicyAuditHandler): void {
  handlers.push(handler);
}

/**
 * Remove all registered handlers (for testing).
 */
export function clearPolicyAuditHandlers(): void {
  handlers.length = 0;
}

// ---------------------------------------------------------------------------
// Emit Functions
// ---------------------------------------------------------------------------

function emit(event: PolicyAuditEvent): void {
  // Always log
  logger.info(
    {
      eventId: event.id,
      eventType: event.event_type,
      traceId: event.trace_id,
      action: event.policy.action,
      approved: event.policy.approved,
      actorId: event.actor.id,
      taskId: event.task_id,
    },
    `audit: ${event.event_type}`,
  );

  // Notify external handlers
  for (const handler of handlers) {
    try {
      handler(event);
    } catch (err) {
      logger.error({ err, eventId: event.id }, 'audit handler error');
    }
  }
}

/**
 * Emit an audit event for a policy decision.
 *
 * @param decision - The policy decision to audit.
 */
export function emitPolicyDecisionAudit(decision: PolicyDecision): void {
  const isApproved = decision.outcome === PolicyDecisionOutcomeEnum.Allowed;

  const eventType = isApproved
    ? PolicyAuditEventType.PolicyApproved
    : PolicyAuditEventType.PolicyDenied;

  emit({
    id: `pevt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    event_type: eventType,
    timestamp: decision.timestamp,
    trace_id: decision.trace_id,
    actor: {
      kind: 'agent',
      id: decision.actor_id,
    },
    target: {
      kind: 'policy',
      id: `${decision.action}:${decision.resource}`,
    },
    policy: {
      action: decision.action,
      resource: decision.resource,
      rule: decision.rule,
      approved: isApproved,
      reason: decision.reason,
    },
    task_id: decision.task_id,
    approval_id: decision.approval_id,
    duration_ms: decision.duration_ms,
  });
}

/**
 * Emit an audit event for a newly created approval.
 *
 * @param approval - The approval that was created.
 */
export function emitApprovalCreatedAudit(approval: Approval): void {
  emit({
    id: `pevt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    event_type: PolicyAuditEventType.PolicyApprovalCreated,
    timestamp: approval.granted_at,
    trace_id: approval.trace_id,
    actor: {
      kind: 'user',
      id: approval.granted_by,
    },
    target: {
      kind: 'task',
      id: approval.task_id,
    },
    policy: {
      action: approval.action,
      resource: approval.resource,
      rule: 'prompt',
      approved: true,
      reason: approval.reason,
    },
    task_id: approval.task_id,
    approval_id: approval.id,
    metadata: {
      expires_at: approval.expires_at,
      workspace_id: approval.workspace_id,
    },
  });
}

/**
 * Emit an audit event for a revoked approval.
 *
 * @param approval - The approval that was revoked.
 * @param revokedBy - Who revoked the approval.
 */
export function emitApprovalRevokedAudit(
  approval: Approval,
  revokedBy: string,
): void {
  emit({
    id: `pevt_${uuid().replace(/-/g, '').slice(0, 16)}`,
    event_type: PolicyAuditEventType.PolicyRevoked,
    timestamp: approval.revoked_at || new Date().toISOString(),
    trace_id: approval.trace_id,
    actor: {
      kind: 'user',
      id: revokedBy,
    },
    target: {
      kind: 'task',
      id: approval.task_id,
    },
    policy: {
      action: approval.action,
      resource: approval.resource,
      rule: 'prompt',
      approved: false,
      reason: `Approval ${approval.id} revoked by ${revokedBy}.`,
    },
    task_id: approval.task_id,
    approval_id: approval.id,
    metadata: {
      workspace_id: approval.workspace_id,
      originally_granted_by: approval.granted_by,
      originally_granted_at: approval.granted_at,
    },
  });
}
