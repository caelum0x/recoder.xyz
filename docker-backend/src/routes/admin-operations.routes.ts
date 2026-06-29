/**
 * Admin Operations API Routes
 *
 * Sprint 9/10 admin surfaces: abuse prevention, admin alerts, combined security
 * stats, backup & recovery, and performance profiling endpoints.
 *
 * Extracted verbatim from server.ts (behavior-preserving move). The route handler
 * bodies, paths, middleware order, auth, and error helpers are unchanged. The
 * `authenticateRequest` and `requireAdmin` middleware closures and the
 * `wsKeepalive` keepalive manager that previously lived in server.ts are injected
 * via the factory. Background service startup (scheduler/monitoring), the
 * performance middleware registration, and the `logger.info(...)` registration
 * markers remain in server.ts since they are not route handlers.
 */

import express, { Router } from 'express';
import { backupService } from '../backup/backup-service.js';
import { performanceProfiler } from '../monitoring/performance-profiler.js';
import { getAllWsRateLimitStats } from '../security/ws-rate-limiter.js';
import {
  abusePrevention,
  getAlerts,
  acknowledgeAlert,
  getAlertCounts,
} from '../security/index.js';
import {
  ErrorCode,
  createError,
  asyncHandler,
  sendError,
  sendSuccess,
} from '../errors/index.js';

interface AuthenticatedRequest extends express.Request {
  userId?: string;
  sessionId?: string;
}

type Middleware = (
  req: AuthenticatedRequest,
  res: express.Response,
  next: express.NextFunction,
) => void;

export interface AdminOperationsRouterDeps {
  authenticateRequest: Middleware;
  requireAdmin: Middleware;
  wsKeepalive: { getStats: () => unknown };
}

export function createAdminOperationsRouter(deps: AdminOperationsRouterDeps): Router {
  const { authenticateRequest, requireAdmin, wsKeepalive } = deps;
  const router = Router();

  // ── S9-1: Abuse Prevention Endpoints ──

  // GET /api/admin/abuse/stats - Get abuse prevention statistics
  router.get('/api/admin/abuse/stats', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const stats = abusePrevention.getStats();
    sendSuccess(res, stats);
  }));

  // GET /api/admin/abuse/events - Get recent abuse events
  router.get('/api/admin/abuse/events', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const events = abusePrevention.getRecentEvents(limit);
    sendSuccess(res, { events, total: events.length });
  }));

  // GET /api/admin/abuse/blocklist - Get blocklist entries
  router.get('/api/admin/abuse/blocklist', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const blocklist = abusePrevention.getBlocklist();
    sendSuccess(res, { blocklist, total: blocklist.length });
  }));

  // POST /api/admin/abuse/blocklist - Add to blocklist
  router.post('/api/admin/abuse/blocklist', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { type, value, reason, expiresAt } = req.body;

    if (!type || !value || !reason) {
      return sendError(res, createError(ErrorCode.VALIDATION_ERROR, 'type, value, and reason are required'));
    }

    const entry = abusePrevention.addToBlocklist({
      type,
      value,
      reason,
      expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
      createdBy: req.userId,
    });

    sendSuccess(res, { entry });
  }));

  // DELETE /api/admin/abuse/blocklist/:id - Remove from blocklist
  router.delete('/api/admin/abuse/blocklist/:id', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;
    const deleted = abusePrevention.removeFromBlocklist(id);

    if (!deleted) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'Blocklist entry not found'));
    }

    sendSuccess(res, { deleted: true });
  }));

  // ── S10-3: Admin Alert Endpoints ──

  // GET /api/admin/alerts - Get recent admin alerts
  router.get('/api/admin/alerts', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const severity = req.query.severity as string | undefined;
    const category = req.query.category as string | undefined;
    const unacknowledgedOnly = req.query.unacknowledged === 'true';

    const alerts = getAlerts({
      limit,
      severity: severity as any,
      category: category as any,
      unacknowledgedOnly,
    });
    const counts = getAlertCounts();

    sendSuccess(res, { alerts, counts, total: alerts.length });
  }));

  // POST /api/admin/alerts/:id/acknowledge - Acknowledge an alert
  router.post('/api/admin/alerts/:id/acknowledge', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;
    const userId = req.userId || 'unknown';

    const success = acknowledgeAlert(id, userId);
    if (!success) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'Alert not found'));
    }

    sendSuccess(res, { acknowledged: true });
  }));

  // GET /api/admin/security/stats - Combined security statistics
  router.get('/api/admin/security/stats', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const abuseStats = abusePrevention.getStats();
    const alertCounts = getAlertCounts();
    const wsRateLimitStats = getAllWsRateLimitStats();
    const wsStats = wsKeepalive.getStats();

    sendSuccess(res, {
      abuse: abuseStats,
      alerts: alertCounts,
      websocket: {
        connections: wsStats,
        rateLimits: wsRateLimitStats,
      },
    });
  }));

  // ── S9-3: Backup & Recovery Endpoints ──

  // GET /api/admin/backups - List backups
  router.get('/api/admin/backups', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const jobs = backupService.getJobs(limit);
    sendSuccess(res, { jobs, total: jobs.length });
  }));

  // GET /api/admin/backups/stats - Get backup statistics
  router.get('/api/admin/backups/stats', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const stats = backupService.getStats();
    sendSuccess(res, stats);
  }));

  // POST /api/admin/backups - Create a backup
  router.post('/api/admin/backups', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { type = 'full', scope = 'all' } = req.body;
    const job = await backupService.createBackup(type, scope);
    sendSuccess(res, { job });
  }));

  // POST /api/admin/backups/:id/restore - Restore from a backup
  router.post('/api/admin/backups/:id/restore', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;
    const { scope, targetDir, dryRun = true } = req.body;

    const result = await backupService.restore({
      backupId: id,
      scope,
      targetDir,
      dryRun,
    });

    if (!result.success) {
      return sendError(res, createError(ErrorCode.INTERNAL_ERROR, result.errors.join(', ')));
    }

    sendSuccess(res, result);
  }));

  // DELETE /api/admin/backups/:id - Delete a backup
  router.delete('/api/admin/backups/:id', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;
    const deleted = backupService.deleteBackup(id);

    if (!deleted) {
      return sendError(res, createError(ErrorCode.NOT_FOUND, 'Backup not found'));
    }

    sendSuccess(res, { deleted: true });
  }));

  // ── S9-4: Performance Profiling Endpoints ──

  // GET /api/admin/performance/metrics - Get performance metrics
  router.get('/api/admin/performance/metrics', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const metrics = performanceProfiler.getMetrics();
    sendSuccess(res, metrics);
  }));

  // GET /api/admin/performance/slow-requests - Get slow requests
  router.get('/api/admin/performance/slow-requests', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 50;
    const slowRequests = performanceProfiler.getSlowRequests(limit);
    sendSuccess(res, { slowRequests, total: slowRequests.length });
  }));

  // GET /api/admin/performance/alerts - Get performance alerts
  router.get('/api/admin/performance/alerts', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const alerts = performanceProfiler.getAlerts(limit);
    sendSuccess(res, { alerts, total: alerts.length });
  }));

  // GET /api/admin/performance/traces - Get recent traces
  router.get('/api/admin/performance/traces', authenticateRequest, requireAdmin, asyncHandler(async (req: AuthenticatedRequest, res: express.Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const traces = performanceProfiler.getTraces(limit);
    sendSuccess(res, { traces, total: traces.length });
  }));

  // GET /api/admin/performance/heap - Get V8 heap statistics
  router.get('/api/admin/performance/heap', authenticateRequest, requireAdmin, asyncHandler(async (_req: AuthenticatedRequest, res: express.Response) => {
    const heapStats = performanceProfiler.getHeapStats();
    sendSuccess(res, heapStats);
  }));

  return router;
}
