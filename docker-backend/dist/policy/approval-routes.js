"use strict";
/**
 * @module policy/approval-routes
 *
 * Express router for the approval management API.
 *
 * Endpoints:
 * - POST   /api/a2a/approvals              - Create/grant an approval
 * - GET    /api/a2a/approvals/:taskId       - Get approval status for a task
 * - POST   /api/a2a/approvals/:taskId/revoke - Revoke approvals for a task
 * - POST   /api/a2a/approvals/:approvalId/escalate - Escalate an approval for human review
 * - GET    /api/a2a/approvals/stats         - Get approval store diagnostics
 *
 * All endpoints emit audit events for every operation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvalRouter = void 0;
const express_1 = require("express");
const logger_js_1 = require("../logger.js");
const approval_store_js_1 = require("./approval-store.js");
const audit_emitter_js_1 = require("./audit-emitter.js");
const types_js_1 = require("./types.js");
const task_lifecycle_service_js_1 = require("../a2a/task-lifecycle.service.js");
const slo_metrics_js_1 = require("../a2a/slo-metrics.js");
const approval_gate_service_js_1 = require("../a2a/approval-gate.service.js");
const logger = (0, logger_js_1.createLogger)('policy:approval-routes');
exports.approvalRouter = (0, express_1.Router)();
// ---------------------------------------------------------------------------
// POST /approvals - Create/grant an approval
// ---------------------------------------------------------------------------
exports.approvalRouter.post('/', (req, res) => {
    try {
        const body = req.body;
        // Validate required fields
        const taskId = body.task_id;
        const action = body.action;
        const resource = body.resource;
        const reason = body.reason;
        const workspaceId = body.workspace_id;
        const traceId = body.trace_id;
        if (!taskId || typeof taskId !== 'string') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'task_id is required and must be a string.',
                },
            });
            return;
        }
        if (!action || typeof action !== 'string') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'action is required and must be a string.',
                },
            });
            return;
        }
        // Validate action is a known privileged action type
        if (!types_js_1.PRIVILEGED_ACTION_TYPES.includes(action)) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: `Invalid action type: ${action}. Must be one of: ${types_js_1.PRIVILEGED_ACTION_TYPES.join(', ')}`,
                },
            });
            return;
        }
        if (!resource || typeof resource !== 'string') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'resource is required and must be a string.',
                },
            });
            return;
        }
        if (!reason || typeof reason !== 'string') {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'reason is required and must be a string.',
                },
            });
            return;
        }
        const grantedBy = req.userId || body.granted_by || 'anonymous';
        const input = {
            task_id: taskId,
            action: action,
            resource,
            granted_by: grantedBy,
            reason,
            workspace_id: workspaceId || 'default',
            trace_id: traceId || req.headers['x-trace-id'] || '',
            ttl_ms: typeof body.ttl_ms === 'number' ? body.ttl_ms : undefined,
            metadata: typeof body.metadata === 'object' && body.metadata !== null
                ? body.metadata
                : undefined,
        };
        const approval = (0, approval_store_js_1.createApproval)(input);
        const grantedAtMs = Date.parse(approval.granted_at);
        const taskResult = (0, task_lifecycle_service_js_1.getTaskLifecycleService)().getTask(taskId);
        if (taskResult.ok) {
            const taskCreatedMs = Date.parse(taskResult.data.created_at);
            if (Number.isFinite(grantedAtMs) && Number.isFinite(taskCreatedMs) && grantedAtMs >= taskCreatedMs) {
                (0, slo_metrics_js_1.getA2ASloMetrics)().recordApprovalTurnaround(grantedAtMs - taskCreatedMs);
            }
        }
        // Emit audit event
        (0, audit_emitter_js_1.emitApprovalCreatedAudit)(approval);
        logger.info({
            approvalId: approval.id,
            taskId: approval.task_id,
            action: approval.action,
            grantedBy: approval.granted_by,
        }, 'approval created via API');
        res.status(201).json({
            success: true,
            data: {
                approval,
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error creating approval');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to create approval.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// GET /approvals/:taskId - Get approval status for a task
// ---------------------------------------------------------------------------
exports.approvalRouter.get('/:taskId', (req, res) => {
    try {
        const { taskId } = req.params;
        if (!taskId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'taskId parameter is required.',
                },
            });
            return;
        }
        const approvals = (0, approval_store_js_1.getApprovalsByTask)(taskId);
        // Optionally filter by action type
        const actionFilter = req.query.action;
        const filtered = actionFilter
            ? approvals.filter(a => a.action === actionFilter)
            : approvals;
        // Optionally filter by status
        const statusFilter = req.query.status;
        const finalResults = statusFilter
            ? filtered.filter(a => a.status === statusFilter)
            : filtered;
        res.status(200).json({
            success: true,
            data: {
                task_id: taskId,
                approvals: finalResults,
                total: finalResults.length,
                has_active: finalResults.some(a => a.status === 'active'),
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error fetching approvals');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch approvals.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /approvals/:taskId/revoke - Revoke approvals for a task
// ---------------------------------------------------------------------------
exports.approvalRouter.post('/:taskId/revoke', (req, res) => {
    try {
        const { taskId } = req.params;
        const body = req.body;
        if (!taskId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'taskId parameter is required.',
                },
            });
            return;
        }
        const revokedBy = req.userId || body.revoked_by || 'anonymous';
        const approvalId = body.approval_id;
        // If a specific approval ID is provided, revoke just that one
        if (approvalId) {
            // Verify the approval belongs to this task
            const taskApprovals = (0, approval_store_js_1.getApprovalsByTask)(taskId);
            const targetApproval = taskApprovals.find(a => a.id === approvalId);
            if (!targetApproval) {
                res.status(404).json({
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: `Approval ${approvalId} not found for task ${taskId}.`,
                    },
                });
                return;
            }
            const revoked = (0, approval_store_js_1.revokeApproval)(approvalId, revokedBy);
            if (revoked) {
                (0, audit_emitter_js_1.emitApprovalRevokedAudit)(revoked, revokedBy);
                logger.info({ approvalId, taskId, revokedBy }, 'single approval revoked via API');
            }
            res.status(200).json({
                success: true,
                data: {
                    task_id: taskId,
                    revoked_count: revoked ? 1 : 0,
                    revoked_approval_ids: revoked ? [approvalId] : [],
                },
                timestamp: new Date().toISOString(),
            });
            return;
        }
        // Revoke all active approvals for the task
        // First get them for audit events
        const activeApprovals = (0, approval_store_js_1.getApprovalsByTask)(taskId).filter(a => a.status === 'active');
        const revokedCount = (0, approval_store_js_1.revokeAllTaskApprovals)(taskId, revokedBy);
        // Emit audit events for each revoked approval
        for (const approval of activeApprovals) {
            // Re-fetch to get updated status
            (0, audit_emitter_js_1.emitApprovalRevokedAudit)({ ...approval, status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: revokedBy }, revokedBy);
        }
        logger.info({ taskId, revokedBy, revokedCount }, 'task approvals revoked via API');
        res.status(200).json({
            success: true,
            data: {
                task_id: taskId,
                revoked_count: revokedCount,
                revoked_approval_ids: activeApprovals.map(a => a.id),
            },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error revoking approvals');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to revoke approvals.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /approvals/:approvalId/escalate - Escalate an approval for human review
// ---------------------------------------------------------------------------
exports.approvalRouter.post('/:approvalId/escalate', (req, res) => {
    try {
        const { approvalId } = req.params;
        const body = req.body;
        if (!approvalId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'approvalId parameter is required.',
                },
            });
            return;
        }
        const reason = typeof body.reason === 'string' ? body.reason : undefined;
        const gate = (0, approval_gate_service_js_1.getApprovalGateService)();
        const escalated = gate.escalate(approvalId, reason);
        if (!escalated) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Approval ${approvalId} not found or not in a pending/escalated state.`,
                },
            });
            return;
        }
        logger.info({ approvalId, reason }, 'approval escalated via API');
        res.status(200).json({
            success: true,
            data: escalated,
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error escalating approval');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to escalate approval.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /approvals/:approvalId/grant - Grant a pending approval
// ---------------------------------------------------------------------------
exports.approvalRouter.post('/:approvalId/grant', (req, res) => {
    try {
        const { approvalId } = req.params;
        if (!approvalId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'approvalId parameter is required.',
                },
            });
            return;
        }
        const body = req.body;
        const resolvedBy = req.userId || (typeof body.resolvedBy === 'string' ? body.resolvedBy : 'anonymous');
        const gate = (0, approval_gate_service_js_1.getApprovalGateService)();
        const granted = gate.grant(approvalId, resolvedBy);
        if (!granted) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Approval ${approvalId} not found or not in a pending/escalated state.`,
                },
            });
            return;
        }
        logger.info({ approvalId, resolvedBy }, 'approval granted via API');
        res.status(200).json({
            success: true,
            data: { approvalId, status: 'granted' },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error granting approval');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to grant approval.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// POST /approvals/:approvalId/reject - Reject a pending approval
// ---------------------------------------------------------------------------
exports.approvalRouter.post('/:approvalId/reject', (req, res) => {
    try {
        const { approvalId } = req.params;
        if (!approvalId) {
            res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'approvalId parameter is required.',
                },
            });
            return;
        }
        const body = req.body;
        const resolvedBy = req.userId || (typeof body.resolvedBy === 'string' ? body.resolvedBy : 'anonymous');
        const gate = (0, approval_gate_service_js_1.getApprovalGateService)();
        const rejected = gate.reject(approvalId, resolvedBy);
        if (!rejected) {
            res.status(404).json({
                success: false,
                error: {
                    code: 'NOT_FOUND',
                    message: `Approval ${approvalId} not found or not in a pending/escalated state.`,
                },
            });
            return;
        }
        logger.info({ approvalId, resolvedBy }, 'approval rejected via API');
        res.status(200).json({
            success: true,
            data: { approvalId, status: 'rejected' },
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error rejecting approval');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to reject approval.',
            },
        });
    }
});
// ---------------------------------------------------------------------------
// GET /approvals/stats - Approval store diagnostics
// ---------------------------------------------------------------------------
exports.approvalRouter.get('/stats/overview', (_req, res) => {
    try {
        const stats = (0, approval_store_js_1.getApprovalStoreStats)();
        res.status(200).json({
            success: true,
            data: stats,
            timestamp: new Date().toISOString(),
        });
    }
    catch (err) {
        logger.error({ err }, 'error fetching approval stats');
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Failed to fetch approval statistics.',
            },
        });
    }
});
