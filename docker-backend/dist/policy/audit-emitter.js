"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyAuditEventType = void 0;
exports.onPolicyAuditEvent = onPolicyAuditEvent;
exports.clearPolicyAuditHandlers = clearPolicyAuditHandlers;
exports.emitPolicyDecisionAudit = emitPolicyDecisionAudit;
exports.emitApprovalCreatedAudit = emitApprovalCreatedAudit;
exports.emitApprovalRevokedAudit = emitApprovalRevokedAudit;
const uuid_1 = require("uuid");
const logger_js_1 = require("../logger.js");
const types_js_1 = require("./types.js");
const logger = (0, logger_js_1.createLogger)('policy:audit');
// ---------------------------------------------------------------------------
// Audit Event Types (aligned with canonical AuditEventTypeEnum)
// ---------------------------------------------------------------------------
/**
 * Policy-specific audit event types.
 * These values match the canonical AuditEventTypeEnum from shared/a2a/schemas.
 */
exports.PolicyAuditEventType = {
    PolicyChecked: 'policy.checked',
    PolicyApproved: 'policy.approved',
    PolicyDenied: 'policy.denied',
    /** Extension: approval was revoked. */
    PolicyRevoked: 'policy.revoked',
    /** Extension: approval was created. */
    PolicyApprovalCreated: 'policy.approval_created',
};
/** Registered external handlers. */
const handlers = [];
/**
 * Register an external handler to receive policy audit events.
 *
 * @param handler - The handler callback.
 */
function onPolicyAuditEvent(handler) {
    handlers.push(handler);
}
/**
 * Remove all registered handlers (for testing).
 */
function clearPolicyAuditHandlers() {
    handlers.length = 0;
}
// ---------------------------------------------------------------------------
// Emit Functions
// ---------------------------------------------------------------------------
function emit(event) {
    // Always log
    logger.info({
        eventId: event.id,
        eventType: event.event_type,
        traceId: event.trace_id,
        action: event.policy.action,
        approved: event.policy.approved,
        actorId: event.actor.id,
        taskId: event.task_id,
    }, `audit: ${event.event_type}`);
    // Notify external handlers
    for (const handler of handlers) {
        try {
            handler(event);
        }
        catch (err) {
            logger.error({ err, eventId: event.id }, 'audit handler error');
        }
    }
}
/**
 * Emit an audit event for a policy decision.
 *
 * @param decision - The policy decision to audit.
 */
function emitPolicyDecisionAudit(decision) {
    const isApproved = decision.outcome === types_js_1.PolicyDecisionOutcomeEnum.Allowed;
    const eventType = isApproved
        ? exports.PolicyAuditEventType.PolicyApproved
        : exports.PolicyAuditEventType.PolicyDenied;
    emit({
        id: `pevt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
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
function emitApprovalCreatedAudit(approval) {
    emit({
        id: `pevt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
        event_type: exports.PolicyAuditEventType.PolicyApprovalCreated,
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
function emitApprovalRevokedAudit(approval, revokedBy) {
    emit({
        id: `pevt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
        event_type: exports.PolicyAuditEventType.PolicyRevoked,
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
