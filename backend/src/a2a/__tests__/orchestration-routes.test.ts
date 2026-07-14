/**
 * @module orchestration-routes.test
 *
 * Tests for the A2A orchestration route handlers (pipeline, scatter-gather,
 * supervisor). Uses mock request/response pattern matching the conventions
 * in rest-adapter.routes.test.ts and git-adapter.routes.test.ts.
 *
 * P18-009: Orchestration Routes
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

vi.mock('../task-lifecycle.service', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { Router } from 'express';
import { orchestrationRouter } from '../orchestration/orchestration.routes';
import { getPipelineOrchestrator, resetPipelineOrchestrator } from '../orchestration/pipeline';
import { getScatterGatherOrchestrator, resetScatterGatherOrchestrator } from '../orchestration/scatter-gather';
import { getSupervisorOrchestrator, resetSupervisorOrchestrator } from '../orchestration/supervisor';

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
// Route stack runner (matches rest-adapter.routes.test.ts pattern)
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

describe('Orchestration routes', () => {
  beforeEach(() => {
    resetPipelineOrchestrator();
    resetScatterGatherOrchestrator();
    resetSupervisorOrchestrator();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetPipelineOrchestrator();
    resetScatterGatherOrchestrator();
    resetSupervisorOrchestrator();
  });

  // =========================================================================
  // 1. Router structure
  // =========================================================================

  describe('Router structure', () => {
    it('orchestrationRouter has pipeline, scatter-gather, and supervisor sub-routes', () => {
      const stack = (orchestrationRouter as any).stack;
      const subPrefixes = stack
        .filter((l: any) => l.name === 'router')
        .map((l: any) => {
          // Extract path prefix from the regexp
          const match = l.regexp.toString();
          return match;
        });

      // There should be 3 sub-routers
      expect(subPrefixes).toHaveLength(3);

      // Verify each sub-router matches its expected prefix
      const pipelinesLayer = stack.find((l: any) => l.name === 'router' && l.regexp.test('/pipelines'));
      const sgLayer = stack.find((l: any) => l.name === 'router' && l.regexp.test('/scatter-gather'));
      const supLayer = stack.find((l: any) => l.name === 'router' && l.regexp.test('/supervisors'));

      expect(pipelinesLayer).toBeDefined();
      expect(sgLayer).toBeDefined();
      expect(supLayer).toBeDefined();
    });
  });

  // =========================================================================
  // Pipeline routes
  // =========================================================================

  describe('Pipeline routes', () => {
    const pipelineBody = {
      pipelineId: 'pipe-1',
      name: 'Test Pipeline',
      steps: [
        { stepId: 's1', agentId: 'agent-a', promptTemplate: 'Process: {{input}}' },
        { stepId: 's2', agentId: 'agent-b', promptTemplate: 'Refine: {{input}}' },
      ],
      errorStrategy: 'fail-fast',
    };

    // 2. POST /pipelines registers successfully
    it('POST / registers a new pipeline and returns 201', async () => {
      const req = makeReq({ method: 'POST', body: pipelineBody });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.pipelineId).toBe('pipe-1');
      expect(state.jsonData.data.name).toBe('Test Pipeline');
      expect(state.jsonData.data.steps).toHaveLength(2);
    });

    // 3. GET /pipelines returns list
    it('GET / returns list of pipelines', async () => {
      // Pre-register a pipeline
      getPipelineOrchestrator().registerPipeline({
        pipelineId: 'pipe-list',
        name: 'Listable Pipeline',
        steps: [],
        errorStrategy: 'fail-fast',
      });

      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.count).toBe(1);
      expect(state.jsonData.data.pipelines).toHaveLength(1);
      expect(state.jsonData.data.pipelines[0].pipelineId).toBe('pipe-list');
    });

    // 4. GET /pipelines/:id returns specific pipeline
    it('GET /:pipelineId returns a specific pipeline', async () => {
      getPipelineOrchestrator().registerPipeline({
        pipelineId: 'pipe-get',
        name: 'Get Me',
        steps: [{ stepId: 'step1', agentId: 'a1', promptTemplate: '{{input}}' }],
        errorStrategy: 'continue',
      });

      const req = makeReq({ method: 'GET', params: { pipelineId: 'pipe-get' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/:pipelineId', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.pipelineId).toBe('pipe-get');
      expect(state.jsonData.data.errorStrategy).toBe('continue');
    });

    // 5. DELETE /pipelines/:id removes pipeline
    it('DELETE /:pipelineId removes a pipeline', async () => {
      getPipelineOrchestrator().registerPipeline({
        pipelineId: 'pipe-del',
        name: 'Delete Me',
        steps: [],
        errorStrategy: 'fail-fast',
      });

      const req = makeReq({ method: 'DELETE', params: { pipelineId: 'pipe-del' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/:pipelineId', 'delete', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.removed).toBe(true);

      // Verify it was actually removed
      expect(getPipelineOrchestrator().getPipeline('pipe-del')).toBeUndefined();
    });

    // 6. POST /pipelines/:id/execute returns execution
    it('POST /:pipelineId/execute executes and returns result', async () => {
      getPipelineOrchestrator().registerPipeline({
        pipelineId: 'pipe-exec',
        name: 'Executable Pipeline',
        steps: [
          { stepId: 's1', agentId: 'agent-a', promptTemplate: 'Do: {{input}}' },
        ],
        errorStrategy: 'fail-fast',
      });

      const req = makeReq({
        method: 'POST',
        params: { pipelineId: 'pipe-exec' },
        body: { input: 'hello world' },
      });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/:pipelineId/execute', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.pipelineId).toBe('pipe-exec');
      expect(state.jsonData.data.status).toBe('completed');
      expect(state.jsonData.data.stepResults).toHaveLength(1);
      expect(state.jsonData.data.finalOutput).toContain('[stub] Agent agent-a');
    });
  });

  // =========================================================================
  // Scatter-Gather routes
  // =========================================================================

  describe('Scatter-Gather routes', () => {
    const sgBody = {
      patternId: 'sg-1',
      name: 'Test Scatter-Gather',
      targets: [
        { agentId: 'agent-x' },
        { agentId: 'agent-y' },
      ],
      gatherStrategy: 'wait-all',
    };

    // 7. POST /scatter-gather registers successfully
    it('POST / registers a new scatter-gather pattern and returns 201', async () => {
      const req = makeReq({ method: 'POST', body: sgBody });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/scatter-gather', '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.patternId).toBe('sg-1');
      expect(state.jsonData.data.targets).toHaveLength(2);
    });

    // 8. GET /scatter-gather returns list
    it('GET / returns list of patterns', async () => {
      getScatterGatherOrchestrator().registerPattern({
        patternId: 'sg-list',
        name: 'Listable',
        targets: [{ agentId: 'a1' }],
        gatherStrategy: 'wait-all',
      });

      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/scatter-gather', '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.count).toBe(1);
      expect(state.jsonData.data.patterns[0].patternId).toBe('sg-list');
    });

    // 9. POST /scatter-gather/:id/execute returns execution
    it('POST /:patternId/execute executes and returns result', async () => {
      getScatterGatherOrchestrator().registerPattern({
        patternId: 'sg-exec',
        name: 'Executable SG',
        targets: [{ agentId: 'agent-x' }, { agentId: 'agent-y' }],
        gatherStrategy: 'wait-all',
      });

      const req = makeReq({
        method: 'POST',
        params: { patternId: 'sg-exec' },
        body: { prompt: 'analyze this' },
      });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/scatter-gather', '/:patternId/execute', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.patternId).toBe('sg-exec');
      expect(state.jsonData.data.status).toBe('completed');
      expect(state.jsonData.data.successCount).toBe(2);
      expect(state.jsonData.data.results).toHaveLength(2);
      expect(state.jsonData.data.aggregatedOutput).toContain('[stub] Agent agent-x');
    });
  });

  // =========================================================================
  // Supervisor routes
  // =========================================================================

  describe('Supervisor routes', () => {
    const supBody = {
      supervisorId: 'sup-1',
      name: 'Test Supervisor',
      children: [
        { childId: 'c1', agentId: 'agent-a', restartPolicy: 'always' },
        { childId: 'c2', agentId: 'agent-b', restartPolicy: 'on-failure' },
      ],
      strategy: 'one-for-one',
    };

    // 10. POST /supervisors registers successfully
    it('POST / registers a new supervisor and returns 201', async () => {
      const req = makeReq({ method: 'POST', body: supBody });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.supervisorId).toBe('sup-1');
      expect(state.jsonData.data.children).toHaveLength(2);
    });

    // 11. GET /supervisors returns list
    it('GET / returns list of supervisors', async () => {
      getSupervisorOrchestrator().registerSupervisor({
        supervisorId: 'sup-list',
        name: 'Listable Supervisor',
        children: [{ childId: 'c1', agentId: 'a1', restartPolicy: 'never' }],
        strategy: 'one-for-one',
      });

      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.count).toBe(1);
      expect(state.jsonData.data.supervisors[0].supervisorId).toBe('sup-list');
    });

    // 12. POST /supervisors/:id/start starts supervisor
    it('POST /:supervisorId/start starts a supervisor', async () => {
      getSupervisorOrchestrator().registerSupervisor({
        supervisorId: 'sup-start',
        name: 'Startable Supervisor',
        children: [{ childId: 'c1', agentId: 'a1', restartPolicy: 'always' }],
        strategy: 'one-for-one',
      });

      const req = makeReq({ method: 'POST', params: { supervisorId: 'sup-start' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/:supervisorId/start', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.supervisorId).toBe('sup-start');
      expect(state.jsonData.data.status).toBe('running');
      expect(state.jsonData.data.children[0].status).toBe('running');
    });

    // 13. POST /supervisors/:id/stop stops supervisor
    it('POST /:supervisorId/stop stops a supervisor', async () => {
      const orch = getSupervisorOrchestrator();
      orch.registerSupervisor({
        supervisorId: 'sup-stop',
        name: 'Stoppable Supervisor',
        children: [{ childId: 'c1', agentId: 'a1', restartPolicy: 'never' }],
        strategy: 'one-for-one',
      });
      // Must start before we can stop
      await orch.start('sup-stop', async () => {});

      const req = makeReq({ method: 'POST', params: { supervisorId: 'sup-stop' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/:supervisorId/stop', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.status).toBe('stopped');
    });

    // 14. GET /supervisors/:id/state returns state
    it('GET /:supervisorId/state returns supervisor state', async () => {
      const orch = getSupervisorOrchestrator();
      orch.registerSupervisor({
        supervisorId: 'sup-state',
        name: 'Stateful Supervisor',
        children: [
          { childId: 'c1', agentId: 'a1', restartPolicy: 'always' },
          { childId: 'c2', agentId: 'a2', restartPolicy: 'never' },
        ],
        strategy: 'one-for-one',
      });

      const req = makeReq({ method: 'GET', params: { supervisorId: 'sup-state' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/:supervisorId/state', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.supervisorId).toBe('sup-state');
      expect(state.jsonData.data.status).toBe('idle');
      expect(state.jsonData.data.children).toHaveLength(2);
      expect(state.jsonData.data.totalRestarts).toBe(0);
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================

  describe('Error handling', () => {
    // 15. Unknown pipeline returns 404
    it('GET /pipelines/:pipelineId returns 404 for unknown pipeline', async () => {
      const req = makeReq({ method: 'GET', params: { pipelineId: 'nonexistent' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/pipelines', '/:pipelineId', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });

    // 16. Unknown supervisor returns 404
    it('GET /supervisors/:supervisorId returns 404 for unknown supervisor', async () => {
      const req = makeReq({ method: 'GET', params: { supervisorId: 'ghost' } });
      const { res, state } = makeRes();
      await runSubStack(orchestrationRouter, '/supervisors', '/:supervisorId', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });
  });
});
