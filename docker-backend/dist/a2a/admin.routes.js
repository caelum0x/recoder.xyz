"use strict";
/**
 * @module admin.routes
 *
 * Admin-only HTTP routes for A2A system management.
 *
 * Provides endpoints for:
 * - RBAC principal and API key management
 * - Rate limit monitoring and configuration
 * - Task queue inspection and dead letter management
 * - Scheduler lifecycle control
 * - System-wide health and statistics dashboard
 *
 * All routes are prefixed with /admin and should be mounted behind
 * an admin authentication/authorization middleware.
 *
 * P19-005: A2A Admin Management Routes
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const rbac_service_1 = require("./rbac.service");
const rate_limiter_service_1 = require("./rate-limiter.service");
const task_queue_service_1 = require("./task-queue.service");
const task_scheduler_service_1 = require("./task-scheduler.service");
const slo_metrics_1 = require("./slo-metrics");
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function sendSuccess(res, data, status = 200) {
    res.status(status).json({ success: true, data });
}
function sendError(res, status, message) {
    res.status(status).json({ success: false, error: message });
}
const VALID_ROLES = ['admin', 'operator', 'agent', 'viewer'];
function isValidRole(role) {
    return VALID_ROLES.includes(role);
}
// ---------------------------------------------------------------------------
// Sub-routers
// ---------------------------------------------------------------------------
// ---- RBAC ----------------------------------------------------------------
const rbacRouter = (0, express_1.Router)();
/** GET /admin/rbac/principals — List all principals (optional query: role) */
rbacRouter.get('/principals', (_req, res) => {
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    const roleFilter = _req.query.role;
    if (roleFilter && !isValidRole(roleFilter)) {
        return sendError(res, 400, `Invalid role filter: ${roleFilter}`);
    }
    const principals = rbac.listPrincipals(roleFilter);
    sendSuccess(res, { principals });
});
/** POST /admin/rbac/principals — Assign role (body: { principalId, role }) */
rbacRouter.post('/principals', (req, res) => {
    const { principalId, role } = req.body ?? {};
    if (!principalId || typeof principalId !== 'string') {
        return sendError(res, 400, 'Missing or invalid principalId');
    }
    if (!role || !isValidRole(role)) {
        return sendError(res, 400, `Invalid role: ${role}`);
    }
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    rbac.assignRole(principalId, role);
    sendSuccess(res, { principalId, role }, 201);
});
/** DELETE /admin/rbac/principals/:principalId — Remove role */
rbacRouter.delete('/principals/:principalId', (req, res) => {
    const { principalId } = req.params;
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    rbac.removeRole(principalId);
    sendSuccess(res, { removed: principalId });
});
/** POST /admin/rbac/api-keys — Register API key (body: { apiKey, principalId }) */
rbacRouter.post('/api-keys', (req, res) => {
    const { apiKey, principalId } = req.body ?? {};
    if (!apiKey || typeof apiKey !== 'string') {
        return sendError(res, 400, 'Missing or invalid apiKey');
    }
    if (!principalId || typeof principalId !== 'string') {
        return sendError(res, 400, 'Missing or invalid principalId');
    }
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    rbac.registerApiKey(apiKey, principalId);
    sendSuccess(res, { apiKey, principalId }, 201);
});
/** DELETE /admin/rbac/api-keys/:apiKey — Revoke API key */
rbacRouter.delete('/api-keys/:apiKey', (req, res) => {
    const { apiKey } = req.params;
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    rbac.revokeApiKey(apiKey);
    sendSuccess(res, { revoked: apiKey });
});
// ---- Rate Limits ---------------------------------------------------------
const rateLimitRouter = (0, express_1.Router)();
/** GET /admin/rate-limits/summary — Get rate limit summary (all keys) */
rateLimitRouter.get('/summary', (_req, res) => {
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    const summary = limiter.getSummary();
    sendSuccess(res, summary);
});
/** GET /admin/rate-limits/status/:key — Get rate limit status for a key */
rateLimitRouter.get('/status/:key', (req, res) => {
    const { key } = req.params;
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    const status = limiter.getStatus(key);
    sendSuccess(res, status);
});
/** POST /admin/rate-limits/config — Set rate limit config */
rateLimitRouter.post('/config', (req, res) => {
    const { key, maxRequests, windowMs, maxConcurrent } = req.body ?? {};
    if (!key || typeof key !== 'string') {
        return sendError(res, 400, 'Missing or invalid key');
    }
    if (typeof maxRequests !== 'number' || maxRequests < 1) {
        return sendError(res, 400, 'maxRequests must be a positive number');
    }
    if (typeof windowMs !== 'number' || windowMs < 1) {
        return sendError(res, 400, 'windowMs must be a positive number');
    }
    if (typeof maxConcurrent !== 'number' || maxConcurrent < 0) {
        return sendError(res, 400, 'maxConcurrent must be a non-negative number');
    }
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    limiter.setConfig(key, { maxRequests, windowMs, maxConcurrent });
    sendSuccess(res, { key, maxRequests, windowMs, maxConcurrent });
});
/** POST /admin/rate-limits/reset — Reset all rate limits */
rateLimitRouter.post('/reset', (_req, res) => {
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    limiter.reset();
    sendSuccess(res, { reset: true });
});
// ---- Queue ---------------------------------------------------------------
const queueRouter = (0, express_1.Router)();
/** GET /admin/queue/stats — Get queue statistics */
queueRouter.get('/stats', (_req, res) => {
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const stats = queue.getStats();
    sendSuccess(res, stats);
});
/** GET /admin/queue/dead-letter — Get dead letter queue */
queueRouter.get('/dead-letter', (_req, res) => {
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const tasks = queue.getDeadLetterQueue();
    sendSuccess(res, { tasks, count: tasks.length });
});
/** POST /admin/queue/dead-letter/:queueId/retry — Retry a dead-lettered task */
queueRouter.post('/dead-letter/:queueId/retry', (req, res) => {
    const { queueId } = req.params;
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const task = queue.retryDeadLetter(queueId);
    if (!task) {
        return sendError(res, 404, `Dead letter task not found: ${queueId}`);
    }
    sendSuccess(res, task);
});
/** DELETE /admin/queue/dead-letter/:queueId — Remove from dead letter queue */
queueRouter.delete('/dead-letter/:queueId', (req, res) => {
    const { queueId } = req.params;
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const removed = queue.removeDeadLetter(queueId);
    if (!removed) {
        return sendError(res, 404, `Dead letter task not found: ${queueId}`);
    }
    sendSuccess(res, { removed: queueId });
});
// ---- Scheduler -----------------------------------------------------------
const schedulerRouter = (0, express_1.Router)();
/** GET /admin/scheduler/schedules — List all schedules */
schedulerRouter.get('/schedules', (_req, res) => {
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const schedules = scheduler.listSchedules();
    sendSuccess(res, { schedules });
});
/** GET /admin/scheduler/schedules/:id/state — Get schedule state */
schedulerRouter.get('/schedules/:id/state', (req, res) => {
    const { id } = req.params;
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const state = scheduler.getState(id);
    if (!state) {
        return sendError(res, 404, `Schedule not found: ${id}`);
    }
    sendSuccess(res, state);
});
/** POST /admin/scheduler/schedules/:id/pause — Pause a schedule */
schedulerRouter.post('/schedules/:id/pause', (req, res) => {
    const { id } = req.params;
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const paused = scheduler.pauseSchedule(id);
    if (!paused) {
        return sendError(res, 400, `Cannot pause schedule: ${id} (not found or not active)`);
    }
    sendSuccess(res, { paused: id });
});
/** POST /admin/scheduler/schedules/:id/resume — Resume a schedule */
schedulerRouter.post('/schedules/:id/resume', (req, res) => {
    const { id } = req.params;
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const resumed = scheduler.resumeSchedule(id);
    if (!resumed) {
        return sendError(res, 400, `Cannot resume schedule: ${id} (not found or not paused)`);
    }
    sendSuccess(res, { resumed: id });
});
// ---- System Dashboard ----------------------------------------------------
const systemRouter = (0, express_1.Router)();
/** GET /admin/system/health — Comprehensive system health */
systemRouter.get('/health', (_req, res) => {
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const principals = rbac.listPrincipals();
    const rateSummary = limiter.getSummary();
    const queueStats = queue.getStats();
    const schedules = scheduler.listSchedules();
    const activeSchedules = schedules.filter((s) => s.enabled).length;
    sendSuccess(res, {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        subsystems: {
            rbac: { principalCount: principals.length },
            rateLimit: {
                totalChecks: rateSummary.totalChecks,
                totalDenied: rateSummary.totalDenied,
            },
            queue: {
                queuedCount: queueStats.queuedCount,
                processingCount: queueStats.processingCount,
                deadLetterCount: queueStats.deadLetterCount,
            },
            scheduler: { activeSchedules },
        },
    });
});
/** GET /admin/system/stats — Aggregate system statistics */
systemRouter.get('/stats', (_req, res) => {
    const rbac = (0, rbac_service_1.getA2ARBACService)();
    const limiter = (0, rate_limiter_service_1.getA2ARateLimiter)();
    const queue = (0, task_queue_service_1.getA2ATaskQueue)();
    const scheduler = (0, task_scheduler_service_1.getA2ATaskScheduler)();
    const slo = (0, slo_metrics_1.getA2ASloMetrics)();
    const principals = rbac.listPrincipals();
    const rateSummary = limiter.getSummary();
    const queueStats = queue.getStats();
    const schedules = scheduler.listSchedules();
    const sloSummary = slo.getSummary();
    sendSuccess(res, {
        timestamp: new Date().toISOString(),
        rbac: {
            principalCount: principals.length,
            byRole: {
                admin: principals.filter((p) => p.role === 'admin').length,
                operator: principals.filter((p) => p.role === 'operator').length,
                agent: principals.filter((p) => p.role === 'agent').length,
                viewer: principals.filter((p) => p.role === 'viewer').length,
            },
        },
        rateLimit: rateSummary,
        queue: queueStats,
        scheduler: {
            totalSchedules: schedules.length,
            activeSchedules: schedules.filter((s) => s.enabled).length,
            schedules: schedules.map((s) => ({
                scheduleId: s.scheduleId,
                name: s.name,
                type: s.type,
                enabled: s.enabled,
            })),
        },
        slo: sloSummary,
    });
});
// ---------------------------------------------------------------------------
// Main admin router
// ---------------------------------------------------------------------------
exports.adminRouter = (0, express_1.Router)();
exports.adminRouter.use('/rbac', rbacRouter);
exports.adminRouter.use('/rate-limits', rateLimitRouter);
exports.adminRouter.use('/queue', queueRouter);
exports.adminRouter.use('/scheduler', schedulerRouter);
exports.adminRouter.use('/system', systemRouter);
