"use strict";
/**
 * @module approval-gate.service
 *
 * Approval gate for privileged inter-agent actions.
 *
 * Creates approval requests that block delegation until a human
 * grants or rejects them (or timeout expires). Publishes interactive
 * messages in the workspace channel.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalGateService = void 0;
exports.getApprovalGateService = getApprovalGateService;
exports.resetApprovalGateService = resetApprovalGateService;
const uuid_1 = require("uuid");
const a2a_event_bus_1 = require("./a2a-event-bus");
const logger_1 = require("../logger");
const a2a_persistence_1 = require("./a2a-persistence");
const a2a_gateway_1 = require("../a2a-gateway");
const logger = (0, logger_1.createLogger)('a2a-approval-gate');
function extractApprovalTaskId(request) {
    const sourceTaskId = typeof request.details.sourceTaskId === 'string'
        ? request.details.sourceTaskId
        : typeof request.details.taskId === 'string'
            ? request.details.taskId
            : typeof request.details.task_id === 'string'
                ? request.details.task_id
                : null;
    return sourceTaskId && sourceTaskId.trim().length > 0 ? sourceTaskId : null;
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class ApprovalGateService {
    requests;
    timeouts = new Map();
    callbacks = new Map();
    constructor() {
        // Hydrate from disk and re-arm timeouts for still-pending requests
        this.requests = (0, a2a_persistence_1.loadA2AApprovals)();
        if (this.requests.size > 0) {
            logger.info({ count: this.requests.size }, 'loaded persisted A2A approvals');
        }
        // Re-arm timeout timers for any pending requests that haven't expired
        const now = Date.now();
        for (const [approvalId, request] of this.requests) {
            if (request.status !== 'pending')
                continue;
            const createdMs = new Date(request.createdAt).getTime();
            const remainingMs = request.timeoutMs - (now - createdMs);
            if (remainingMs <= 0) {
                // Already past deadline -- expire immediately
                this.expire(approvalId);
            }
            else {
                const timer = setTimeout(() => {
                    this.expire(approvalId);
                }, remainingMs);
                this.timeouts.set(approvalId, timer);
            }
        }
    }
    createRequest(input) {
        const approvalId = `approval_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`;
        const now = new Date().toISOString();
        const timeoutMs = input.timeoutMs ?? 300_000; // 5 min default
        const request = {
            approvalId,
            workspaceId: input.workspaceId,
            requestingAgentId: input.requestingAgentId,
            targetAgentId: input.targetAgentId,
            action: input.action,
            details: input.details,
            status: 'pending',
            createdAt: now,
            timeoutMs,
        };
        this.requests.set(approvalId, request);
        this.persist();
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.ApprovalRequested,
            timestamp: now,
            data: { approval: request },
            workspaceId: request.workspaceId,
            taskId: extractApprovalTaskId(request) || undefined,
        });
        const requestTaskId = extractApprovalTaskId(request);
        if (requestTaskId) {
            void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
                taskId: requestTaskId,
                eventType: 'approval.requested',
                actorId: request.requestingAgentId,
                state: 'input-required',
                detail: {
                    approvalId: request.approvalId,
                    action: request.action,
                    targetAgentId: request.targetAgentId,
                },
            });
        }
        // Set timeout
        const timer = setTimeout(() => {
            this.expire(approvalId);
        }, timeoutMs);
        this.timeouts.set(approvalId, timer);
        logger.info({ approvalId, action: input.action }, 'approval request created');
        return request;
    }
    grant(approvalId, resolvedBy) {
        const request = this.requests.get(approvalId);
        if (!request || (request.status !== 'pending' && request.status !== 'escalated'))
            return undefined;
        request.status = 'granted';
        request.resolvedAt = new Date().toISOString();
        request.resolvedBy = resolvedBy;
        this.clearTimeout(approvalId);
        this.persist();
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.ApprovalGranted,
            timestamp: request.resolvedAt,
            data: { approval: request },
            workspaceId: request.workspaceId,
        });
        const grantedTaskId = extractApprovalTaskId(request);
        if (grantedTaskId) {
            void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
                taskId: grantedTaskId,
                eventType: 'approval.granted',
                actorId: resolvedBy,
                state: 'working',
                detail: {
                    approvalId: request.approvalId,
                    action: request.action,
                },
            });
        }
        // Fire callbacks
        this.fireCallbacks(approvalId, request);
        logger.info({ approvalId, resolvedBy }, 'approval granted');
        return request;
    }
    reject(approvalId, resolvedBy) {
        const request = this.requests.get(approvalId);
        if (!request || (request.status !== 'pending' && request.status !== 'escalated'))
            return undefined;
        request.status = 'rejected';
        request.resolvedAt = new Date().toISOString();
        request.resolvedBy = resolvedBy;
        this.clearTimeout(approvalId);
        this.persist();
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.ApprovalRejected,
            timestamp: request.resolvedAt,
            data: { approval: request },
            workspaceId: request.workspaceId,
        });
        const rejectedTaskId = extractApprovalTaskId(request);
        if (rejectedTaskId) {
            void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
                taskId: rejectedTaskId,
                eventType: 'approval.rejected',
                actorId: resolvedBy,
                state: 'failed',
                detail: {
                    approvalId: request.approvalId,
                    action: request.action,
                },
            });
        }
        this.fireCallbacks(approvalId, request);
        logger.info({ approvalId, resolvedBy }, 'approval rejected');
        return request;
    }
    /**
     * Escalate an approval — marks it as escalated and extends the timeout by 2x
     * to give more time for human review.
     */
    escalate(approvalId, reason) {
        const request = this.requests.get(approvalId);
        if (!request || (request.status !== 'pending' && request.status !== 'escalated'))
            return undefined;
        request.status = 'escalated';
        // Extend the timeout by 2x from now
        const extendedTimeoutMs = request.timeoutMs * 2;
        request.timeoutMs = extendedTimeoutMs;
        // Clear existing timeout and re-arm with extended duration
        this.clearTimeout(approvalId);
        const createdMs = new Date(request.createdAt).getTime();
        const elapsedMs = Date.now() - createdMs;
        const newRemainingMs = Math.max(0, extendedTimeoutMs - elapsedMs);
        const timer = setTimeout(() => {
            this.expire(approvalId);
        }, newRemainingMs);
        this.timeouts.set(approvalId, timer);
        this.persist();
        (0, a2a_event_bus_1.getA2AEventBus)().publish({
            id: `evt_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 16)}`,
            type: a2a_event_bus_1.A2AEventType.ApprovalEscalated,
            timestamp: new Date().toISOString(),
            data: { approval: request, reason: reason ?? '' },
            workspaceId: request.workspaceId,
        });
        const escalatedTaskId = extractApprovalTaskId(request);
        if (escalatedTaskId) {
            void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
                taskId: escalatedTaskId,
                eventType: 'approval.escalated',
                actorId: request.requestingAgentId,
                state: 'input-required',
                detail: {
                    approvalId: request.approvalId,
                    action: request.action,
                    reason: reason ?? '',
                },
            });
        }
        logger.info({ approvalId, reason, extendedTimeoutMs }, 'approval escalated');
        return request;
    }
    get(approvalId) {
        return this.requests.get(approvalId);
    }
    listPending(workspaceId) {
        return [...this.requests.values()].filter((r) => r.workspaceId === workspaceId && (r.status === 'pending' || r.status === 'escalated'));
    }
    listByWorkspace(workspaceId, statuses) {
        const statusSet = statuses && statuses.length > 0 ? new Set(statuses) : null;
        return [...this.requests.values()].filter((request) => {
            if (request.workspaceId !== workspaceId)
                return false;
            if (!statusSet)
                return true;
            return statusSet.has(request.status);
        });
    }
    /**
     * Register a callback for when an approval is resolved.
     */
    onResolved(approvalId, callback) {
        const existing = this.callbacks.get(approvalId) ?? [];
        existing.push(callback);
        this.callbacks.set(approvalId, existing);
    }
    expire(approvalId) {
        const request = this.requests.get(approvalId);
        if (!request || (request.status !== 'pending' && request.status !== 'escalated'))
            return;
        request.status = 'expired';
        request.resolvedAt = new Date().toISOString();
        this.persist();
        this.fireCallbacks(approvalId, request);
        const expiredTaskId = extractApprovalTaskId(request);
        if (expiredTaskId) {
            void (0, a2a_gateway_1.appendTaskScopedControlPlaneLifecycleEvent)({
                taskId: expiredTaskId,
                eventType: 'approval.expired',
                actorId: request.requestingAgentId,
                state: 'failed',
                detail: {
                    approvalId: request.approvalId,
                    action: request.action,
                },
            });
        }
        logger.info({ approvalId }, 'approval expired');
    }
    clearTimeout(approvalId) {
        const timer = this.timeouts.get(approvalId);
        if (timer) {
            clearTimeout(timer);
            this.timeouts.delete(approvalId);
        }
    }
    /** Write current approval map to disk. */
    persist() {
        (0, a2a_persistence_1.saveA2AApprovals)(this.requests);
    }
    fireCallbacks(approvalId, request) {
        const cbs = this.callbacks.get(approvalId);
        if (cbs) {
            for (const cb of cbs) {
                try {
                    cb(request);
                }
                catch (err) {
                    logger.error({ err, approvalId }, 'approval callback error');
                }
            }
            this.callbacks.delete(approvalId);
        }
    }
    dispose() {
        for (const timer of this.timeouts.values()) {
            clearTimeout(timer);
        }
        this.timeouts.clear();
        this.callbacks.clear();
    }
}
exports.ApprovalGateService = ApprovalGateService;
// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------
let _instance = null;
function getApprovalGateService() {
    if (!_instance) {
        _instance = new ApprovalGateService();
    }
    return _instance;
}
function resetApprovalGateService() {
    _instance?.dispose();
    _instance = null;
}
