/**
 * @module admin-routes.test
 *
 * Tests for the A2A admin management route handlers.
 *
 * Uses mock request/response pattern matching the conventions in
 * orchestration-routes.test.ts and rest-adapter.routes.test.ts.
 *
 * P19-005: A2A Admin Management Routes
 */

import { EventEmitter } from 'events';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { Router } from 'express';
import { adminRouter } from '../admin.routes';
import { getA2ARBACService, resetA2ARBACService } from '../rbac.service';
import { getA2ARateLimiter, resetA2ARateLimiter } from '../rate-limiter.service';
import { getA2ATaskQueue, resetA2ATaskQueue, resetIdCounter } from '../task-queue.service';
import { getA2ATaskScheduler, resetA2ATaskScheduler } from '../task-scheduler.service';
import { resetA2ASloMetrics } from '../slo-metrics';

// ---------------------------------------------------------------------------
// Mock request / response helpers
// ---------------------------------------------------------------------------

type MockReq = EventEmitter & {
  method: string;
  body: any;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

type MockResState = {
  statusCode: number;
  headers: Record<string, string>;
  jsonData: any;
  written: string[];
  ended: boolean;
};

function makeReq(opts: {
  method?: string;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, string>;
  headers?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'GET';
  emitter.body = opts.body ?? {};
  emitter.params = opts.params ?? {};
  emitter.query = opts.query ?? {};
  emitter.headers = opts.headers ?? {};
  return emitter;
}

function makeRes(): { res: any; state: MockResState } {
  const state: MockResState = {
    statusCode: 200,
    headers: {},
    jsonData: null,
    written: [],
    ended: false,
  };

  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    setHeader(key: string, value: string) {
      state.headers[key.toLowerCase()] = value;
    },
    getHeader(key: string) {
      return state.headers[key.toLowerCase()];
    },
    json(data: any) {
      state.jsonData = data;
      state.ended = true;
      return res;
    },
    write(chunk: string) {
      state.written.push(chunk);
      return true;
    },
    end() {
      state.ended = true;
      return res;
    },
    flushHeaders: vi.fn(),
  };

  return { res, state };
}

// ---------------------------------------------------------------------------
// Route stack runner
// ---------------------------------------------------------------------------

/**
 * Walk the Express router stack to find sub-router layers by path prefix,
 * then find the final route handler within that sub-router.
 */
function getSubRouterStack(
  mainRouter: Router,
  subPrefix: string,
  routePath: string,
  method: 'get' | 'post' | 'delete',
): Function[] {
  // Find the sub-router layer
  const subRouterLayer = (mainRouter as any).stack.find(
    (l: any) => l.name === 'router' && l.regexp.test(subPrefix),
  );
  if (!subRouterLayer) {
    throw new Error(`No sub-router matching prefix "${subPrefix}"`);
  }
  const subRouter = subRouterLayer.handle;

  // Get middleware from the sub-router
  const middleware = (subRouter as any).stack
    .filter((l: any) => !l.route)
    .map((l: any) => l.handle);

  // Find the route layer in the sub-router
  const routeLayer = (subRouter as any).stack.find(
    (l: any) => l.route?.path === routePath && l.route?.methods?.[method],
  );
  if (!routeLayer) {
    throw new Error(`No route for ${method.toUpperCase()} ${routePath} in sub-router "${subPrefix}"`);
  }
  const routeHandlers = routeLayer.route.stack.map((l: any) => l.handle);
  return [...middleware, ...routeHandlers];
}

async function runSubStack(
  mainRouter: Router,
  subPrefix: string,
  routePath: string,
  method: 'get' | 'post' | 'delete',
  req: MockReq,
  res: any,
): Promise<void> {
  const handlers = getSubRouterStack(mainRouter, subPrefix, routePath, method);

  for (const handler of handlers) {
    const result = await new Promise<{ nextCalled: boolean }>((resolve, reject) => {
      let nextCalled = false;
      const next = (err?: unknown) => {
        if (err) {
          reject(err);
          return;
        }
        nextCalled = true;
        resolve({ nextCalled: true });
      };

      try {
        const out = handler(req, res, next);
        Promise.resolve(out)
          .then(() => {
            if (!nextCalled) resolve({ nextCalled: false });
          })
          .catch(reject);
      } catch (err) {
        reject(err);
      }
    });

    if (!result.nextCalled) break;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Admin routes', () => {
  beforeEach(() => {
    resetA2ARBACService();
    resetA2ARateLimiter();
    resetA2ATaskQueue();
    resetA2ATaskScheduler();
    resetA2ASloMetrics();
    resetIdCounter();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetA2ARBACService();
    resetA2ARateLimiter();
    resetA2ATaskQueue();
    resetA2ATaskScheduler();
    resetA2ASloMetrics();
  });

  // =========================================================================
  // 1. RBAC Management
  // =========================================================================

  describe('RBAC Management', () => {
    it('GET /admin/rbac/principals returns list of all principals', async () => {
      const rbac = getA2ARBACService();
      rbac.assignRole('agent-1', 'agent');
      rbac.assignRole('admin-1', 'admin');

      const req = makeReq({ query: {} });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/principals', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.principals).toHaveLength(2);
    });

    it('GET /admin/rbac/principals?role=agent filters by role', async () => {
      const rbac = getA2ARBACService();
      rbac.assignRole('agent-1', 'agent');
      rbac.assignRole('admin-1', 'admin');

      const req = makeReq({ query: { role: 'agent' } });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/principals', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.data.principals).toHaveLength(1);
      expect(state.jsonData.data.principals[0].role).toBe('agent');
    });

    it('POST /admin/rbac/principals assigns role', async () => {
      const req = makeReq({
        method: 'POST',
        body: { principalId: 'new-agent', role: 'operator' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/principals', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.principalId).toBe('new-agent');
      expect(state.jsonData.data.role).toBe('operator');

      // Verify it was actually assigned
      const rbac = getA2ARBACService();
      expect(rbac.getRole('new-agent')).toBe('operator');
    });

    it('DELETE /admin/rbac/principals/:principalId removes role', async () => {
      const rbac = getA2ARBACService();
      rbac.assignRole('to-remove', 'viewer');

      const req = makeReq({
        method: 'DELETE',
        params: { principalId: 'to-remove' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/principals/:principalId', 'delete', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.removed).toBe('to-remove');

      // Verify removal
      expect(rbac.getRole('to-remove')).toBeUndefined();
    });

    it('POST /admin/rbac/api-keys registers API key', async () => {
      const req = makeReq({
        method: 'POST',
        body: { apiKey: 'key-abc-123', principalId: 'agent-1' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/api-keys', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.apiKey).toBe('key-abc-123');

      // Verify registration
      const rbac = getA2ARBACService();
      expect(rbac.resolveApiKey('key-abc-123')).toBe('agent-1');
    });

    it('DELETE /admin/rbac/api-keys/:apiKey revokes API key', async () => {
      const rbac = getA2ARBACService();
      rbac.registerApiKey('key-to-revoke', 'agent-1');

      const req = makeReq({
        method: 'DELETE',
        params: { apiKey: 'key-to-revoke' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/api-keys/:apiKey', 'delete', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.revoked).toBe('key-to-revoke');

      // Verify revocation
      expect(rbac.resolveApiKey('key-to-revoke')).toBeUndefined();
    });
  });

  // =========================================================================
  // 2. Rate Limit Management
  // =========================================================================

  describe('Rate Limit Management', () => {
    it('GET /admin/rate-limits/summary returns rate limit summary', async () => {
      const limiter = getA2ARateLimiter();
      limiter.checkLimit('adapter:test-1');
      limiter.checkLimit('adapter:test-2');

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rate-limits', '/summary', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.totalChecks).toBe(2);
      expect(state.jsonData.data.totalAllowed).toBe(2);
      expect(state.jsonData.data.totalDenied).toBe(0);
    });

    it('GET /admin/rate-limits/status/:key returns status for a key', async () => {
      const limiter = getA2ARateLimiter();
      limiter.checkLimit('adapter:test-1');

      const req = makeReq({ params: { key: 'adapter:test-1' } });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rate-limits', '/status/:key', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.allowed).toBe(true);
      expect(typeof state.jsonData.data.remaining).toBe('number');
    });

    it('POST /admin/rate-limits/config sets rate limit config', async () => {
      const req = makeReq({
        method: 'POST',
        body: { key: 'adapter:custom', maxRequests: 50, windowMs: 30000, maxConcurrent: 5 },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rate-limits', '/config', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.key).toBe('adapter:custom');
      expect(state.jsonData.data.maxRequests).toBe(50);
    });

    it('POST /admin/rate-limits/reset resets all rate limits', async () => {
      const limiter = getA2ARateLimiter();
      limiter.checkLimit('adapter:test-1');

      const req = makeReq({ method: 'POST' });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rate-limits', '/reset', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.reset).toBe(true);

      // Verify reset: summary should be zeroed
      const summary = limiter.getSummary();
      expect(summary.totalChecks).toBe(0);
    });
  });

  // =========================================================================
  // 3. Queue Management
  // =========================================================================

  describe('Queue Management', () => {
    it('GET /admin/queue/stats returns queue statistics', async () => {
      const queue = getA2ATaskQueue();
      queue.enqueue({ agentId: 'agent-1', prompt: 'test task' });

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/queue', '/stats', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.totalEnqueued).toBe(1);
      expect(state.jsonData.data.queuedCount).toBe(1);
    });

    it('GET /admin/queue/dead-letter returns dead letter queue', async () => {
      const queue = getA2ATaskQueue();

      // Enqueue and fail a task until it goes to dead letter
      const task = queue.enqueue({ agentId: 'agent-1', prompt: 'fail me', maxRetries: 0 });
      queue.dequeue(); // move to processing
      queue.fail(task.queueId, 'intentional failure');

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/queue', '/dead-letter', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.tasks).toHaveLength(1);
      expect(state.jsonData.data.count).toBe(1);
    });

    it('POST /admin/queue/dead-letter/:queueId/retry retries a dead-lettered task', async () => {
      const queue = getA2ATaskQueue();
      const task = queue.enqueue({ agentId: 'agent-1', prompt: 'retry me', maxRetries: 0 });
      queue.dequeue();
      queue.fail(task.queueId, 'intentional failure');

      const req = makeReq({
        method: 'POST',
        params: { queueId: task.queueId },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/queue', '/dead-letter/:queueId/retry', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.status).toBe('queued');
    });

    it('POST /admin/queue/dead-letter/:queueId/retry returns 404 for unknown task', async () => {
      const req = makeReq({
        method: 'POST',
        params: { queueId: 'nonexistent' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/queue', '/dead-letter/:queueId/retry', 'post', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
    });
  });

  // =========================================================================
  // 4. Scheduler Management
  // =========================================================================

  describe('Scheduler Management', () => {
    it('GET /admin/scheduler/schedules lists all schedules', async () => {
      const scheduler = getA2ATaskScheduler();
      scheduler.createSchedule({
        scheduleId: 'sched-1',
        name: 'Test Schedule',
        type: 'interval',
        intervalMs: 60000,
        agentId: 'agent-1',
        prompt: 'do something',
      });

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/scheduler', '/schedules', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.schedules).toHaveLength(1);
      expect(state.jsonData.data.schedules[0].name).toBe('Test Schedule');
    });

    it('GET /admin/scheduler/schedules/:id/state returns schedule state', async () => {
      const scheduler = getA2ATaskScheduler();
      scheduler.createSchedule({
        scheduleId: 'sched-state',
        name: 'State Test',
        type: 'interval',
        intervalMs: 60000,
        agentId: 'agent-1',
        prompt: 'check state',
      });

      const req = makeReq({ params: { id: 'sched-state' } });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/scheduler', '/schedules/:id/state', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.scheduleId).toBe('sched-state');
      expect(state.jsonData.data.status).toBe('active');
    });

    it('POST /admin/scheduler/schedules/:id/pause pauses a schedule', async () => {
      const scheduler = getA2ATaskScheduler();
      scheduler.createSchedule({
        scheduleId: 'sched-pause',
        name: 'Pause Test',
        type: 'interval',
        intervalMs: 60000,
        agentId: 'agent-1',
        prompt: 'pause me',
      });

      const req = makeReq({
        method: 'POST',
        params: { id: 'sched-pause' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/scheduler', '/schedules/:id/pause', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.paused).toBe('sched-pause');

      // Verify paused
      const schedState = scheduler.getState('sched-pause');
      expect(schedState?.status).toBe('paused');
    });

    it('POST /admin/scheduler/schedules/:id/resume resumes a paused schedule', async () => {
      const scheduler = getA2ATaskScheduler();
      scheduler.createSchedule({
        scheduleId: 'sched-resume',
        name: 'Resume Test',
        type: 'interval',
        intervalMs: 60000,
        agentId: 'agent-1',
        prompt: 'resume me',
      });
      scheduler.pauseSchedule('sched-resume');

      const req = makeReq({
        method: 'POST',
        params: { id: 'sched-resume' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/scheduler', '/schedules/:id/resume', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.resumed).toBe('sched-resume');

      // Verify resumed
      const schedState = scheduler.getState('sched-resume');
      expect(schedState?.status).toBe('active');
    });
  });

  // =========================================================================
  // 5. System Dashboard
  // =========================================================================

  describe('System Dashboard', () => {
    it('GET /admin/system/health returns comprehensive system health', async () => {
      const rbac = getA2ARBACService();
      rbac.assignRole('agent-1', 'agent');
      rbac.assignRole('admin-1', 'admin');

      const queue = getA2ATaskQueue();
      queue.enqueue({ agentId: 'agent-1', prompt: 'test' });

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/system', '/health', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);

      const data = state.jsonData.data;
      expect(data.status).toBe('healthy');
      expect(typeof data.timestamp).toBe('string');
      expect(data.subsystems.rbac.principalCount).toBe(2);
      expect(data.subsystems.rateLimit.totalChecks).toBe(0);
      expect(data.subsystems.rateLimit.totalDenied).toBe(0);
      expect(data.subsystems.queue.queuedCount).toBe(1);
      expect(data.subsystems.queue.processingCount).toBe(0);
      expect(data.subsystems.queue.deadLetterCount).toBe(0);
      expect(data.subsystems.scheduler.activeSchedules).toBe(0);
    });

    it('GET /admin/system/stats returns aggregate system statistics', async () => {
      const rbac = getA2ARBACService();
      rbac.assignRole('agent-1', 'agent');

      const limiter = getA2ARateLimiter();
      limiter.checkLimit('adapter:test');

      const req = makeReq();
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/system', '/stats', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);

      const data = state.jsonData.data;
      expect(typeof data.timestamp).toBe('string');
      expect(data.rbac.principalCount).toBe(1);
      expect(data.rbac.byRole.agent).toBe(1);
      expect(data.rateLimit.totalChecks).toBe(1);
      expect(data.queue.totalEnqueued).toBe(0);
      expect(data.scheduler.totalSchedules).toBe(0);
      expect(data.slo).toBeDefined();
    });
  });

  // =========================================================================
  // 6. Error handling
  // =========================================================================

  describe('Error handling', () => {
    it('POST /admin/rbac/principals rejects invalid role', async () => {
      const req = makeReq({
        method: 'POST',
        body: { principalId: 'test', role: 'superadmin' },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rbac', '/principals', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error).toContain('Invalid role');
    });

    it('POST /admin/rate-limits/config rejects missing key', async () => {
      const req = makeReq({
        method: 'POST',
        body: { maxRequests: 10, windowMs: 1000, maxConcurrent: 1 },
      });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/rate-limits', '/config', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
    });

    it('GET /admin/scheduler/schedules/:id/state returns 404 for unknown schedule', async () => {
      const req = makeReq({ params: { id: 'nonexistent-schedule' } });
      const { res, state } = makeRes();

      await runSubStack(adminRouter, '/scheduler', '/schedules/:id/state', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error).toContain('Schedule not found');
    });
  });
});
