/**
 * @module rest-adapter.routes.test
 *
 * Tests for the REST protocol adapter route handlers.
 *
 * Uses the same mock request/response pattern as a2a-routes.integration.test.ts,
 * driving the Express router handlers directly without a real HTTP server.
 *
 * P17-009: REST Adapter Routes
 */

import { EventEmitter } from 'events';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

vi.mock('../../logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../task-lifecycle.service', () => ({
  generateId: vi.fn((prefix: string) => `${prefix}-test-id`),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import type { Router } from 'express';
import { restAdapterRouter } from '../adapters/rest-adapter.routes';
import {
  resetRestAdapters,
  registerRestAdapter,
  getRestAdapter,
  RestAdapter,
  type RestAdapterConfig,
} from '../adapters/rest-adapter';
import type { RecoderAgentIdentity } from '@recoder/shared/a2a';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const localIdentity: RecoderAgentIdentity = {
  id: 'recoder-backend',
  name: 'Recoder Backend',
  platform: 'recoder',
};

const targetAgent: RecoderAgentIdentity = {
  id: 'replit-agent',
  name: 'Replit Agent',
  platform: 'custom',
};

function createConfig(overrides?: Partial<RestAdapterConfig>): RestAdapterConfig {
  return {
    adapterId: 'test-rest',
    baseUrl: 'http://localhost:9999',
    auth: { type: 'none' },
    timeoutMs: 5_000,
    maxRetries: 1,
    retryDelayMs: 100,
    maxRetryDelayMs: 500,
    localIdentity,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock request / response helpers (matching a2a-routes.integration.test.ts)
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
// Route stack runner (matching a2a-routes.integration.test.ts)
// ---------------------------------------------------------------------------

function getRouteStack(router: Router, path: string, method: 'get' | 'post' | 'delete') {
  const middleware = (router as any).stack
    .filter((l: any) => !l.route)
    .map((l: any) => l.handle);
  const routeLayer = (router as any).stack.find(
    (l: any) => l.route?.path === path && l.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  const routeHandlers = routeLayer.route.stack.map((l: any) => l.handle);
  return [...middleware, ...routeHandlers];
}

async function runStack(
  router: Router,
  path: string,
  method: 'get' | 'post' | 'delete',
  req: MockReq,
  res: any,
): Promise<void> {
  const handlers = getRouteStack(router, path, method);

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

describe('REST adapter routes', () => {
  beforeEach(() => {
    resetRestAdapters();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetRestAdapters();
  });

  // -----------------------------------------------------------------------
  // POST / -- Register adapter
  // -----------------------------------------------------------------------

  describe('POST / -- Register adapter', () => {
    it('registers a new adapter and returns 201 with state', async () => {
      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'my-adapter',
          baseUrl: 'http://remote-agent.example.com',
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.adapterId).toBe('my-adapter');
      expect(state.jsonData.data.baseUrl).toBe('http://remote-agent.example.com');
      expect(state.jsonData.data.status).toBe('idle');
      expect(state.jsonData.data.totalRequests).toBe(0);
    });

    it('registers adapter with optional config fields', async () => {
      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'configured-adapter',
          baseUrl: 'http://example.com',
          auth: { type: 'bearer', token: 'my-token' },
          timeoutMs: 10_000,
          maxRetries: 5,
          retryDelayMs: 500,
          maxRetryDelayMs: 30_000,
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(201);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.adapterId).toBe('configured-adapter');

      // Verify adapter was registered in the registry
      const adapter = getRestAdapter('configured-adapter');
      expect(adapter).toBeDefined();
    });

    it('returns 400 if adapterId is missing', async () => {
      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({ baseUrl: 'http://example.com' }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/adapterId/i);
    });

    it('returns 400 if adapterId is empty string', async () => {
      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({ adapterId: '  ', baseUrl: 'http://example.com' }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/adapterId/i);
    });

    it('returns 400 if baseUrl is missing', async () => {
      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({ adapterId: 'my-adapter' }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/baseUrl/i);
    });

    it('returns 409 if adapterId is already registered', async () => {
      // Pre-register an adapter
      const existing = new RestAdapter(createConfig({ adapterId: 'dup-adapter' }));
      registerRestAdapter(existing);

      const req = makeReq({
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'dup-adapter',
          baseUrl: 'http://other.com',
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'post', req, res);

      expect(state.statusCode).toBe(409);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/already registered/i);
    });
  });

  // -----------------------------------------------------------------------
  // GET / -- List adapters
  // -----------------------------------------------------------------------

  describe('GET / -- List adapters', () => {
    it('returns empty list when no adapters registered', async () => {
      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.adapters).toEqual([]);
      expect(state.jsonData.data.count).toBe(0);
    });

    it('returns all registered adapters', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'adapter-a' })));
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'adapter-b' })));
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'adapter-c' })));

      const req = makeReq({ method: 'GET' });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.count).toBe(3);
      expect(state.jsonData.data.adapters).toHaveLength(3);

      const ids = state.jsonData.data.adapters.map((a: any) => a.adapterId);
      expect(ids).toContain('adapter-a');
      expect(ids).toContain('adapter-b');
      expect(ids).toContain('adapter-c');
    });
  });

  // -----------------------------------------------------------------------
  // GET /:adapterId -- Get adapter details
  // -----------------------------------------------------------------------

  describe('GET /:adapterId -- Get adapter details', () => {
    it('returns adapter state for registered adapter', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'my-adapter' })));

      const req = makeReq({
        method: 'GET',
        params: { adapterId: 'my-adapter' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'get', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.adapterId).toBe('my-adapter');
      expect(state.jsonData.data.status).toBe('idle');
      expect(state.jsonData.data.baseUrl).toBe('http://localhost:9999');
    });

    it('returns 404 for unregistered adapter', async () => {
      const req = makeReq({
        method: 'GET',
        params: { adapterId: 'nonexistent' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'get', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });
  });

  // -----------------------------------------------------------------------
  // DELETE /:adapterId -- Unregister adapter
  // -----------------------------------------------------------------------

  describe('DELETE /:adapterId -- Unregister adapter', () => {
    it('unregisters an existing adapter', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'to-remove' })));
      expect(getRestAdapter('to-remove')).toBeDefined();

      const req = makeReq({
        method: 'DELETE',
        params: { adapterId: 'to-remove' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'delete', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.adapterId).toBe('to-remove');
      expect(state.jsonData.data.unregistered).toBe(true);

      // Verify it was actually removed
      expect(getRestAdapter('to-remove')).toBeUndefined();
    });

    it('returns 404 when unregistering nonexistent adapter', async () => {
      const req = makeReq({
        method: 'DELETE',
        params: { adapterId: 'ghost' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'delete', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });
  });

  // -----------------------------------------------------------------------
  // POST /:adapterId/health-check -- Health check
  // -----------------------------------------------------------------------

  describe('POST /:adapterId/health-check -- Health check', () => {
    it('returns health check result for reachable adapter', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'healthy-adapter' })));

      const mockResponse = {
        ok: true,
        status: 200,
        headers: new Headers(),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'healthy-adapter' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/health-check', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.reachable).toBe(true);
      expect(state.jsonData.data.statusCode).toBe(200);
      expect(state.jsonData.data.latencyMs).toBeGreaterThanOrEqual(0);
      expect(state.jsonData.data.checkedAt).toBeTruthy();
    });

    it('returns health check result for unreachable adapter', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'dead-adapter' })));

      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'dead-adapter' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/health-check', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.reachable).toBe(false);
      expect(state.jsonData.data.error).toBe('ECONNREFUSED');
    });

    it('returns 404 for health check on nonexistent adapter', async () => {
      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'missing' },
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/health-check', 'post', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });
  });

  // -----------------------------------------------------------------------
  // POST /:adapterId/execute -- Execute task
  // -----------------------------------------------------------------------

  describe('POST /:adapterId/execute -- Execute task', () => {
    it('executes a task via the adapter and returns result', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'exec-adapter' })));

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ result: 'Task completed successfully' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'exec-adapter' },
        body: JSON.stringify({
          taskId: 'task-001',
          prompt: 'Fix the authentication bug',
          targetAgent: { id: 'replit-agent', name: 'Replit Agent', platform: 'custom' },
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);
      expect(state.jsonData.data.success).toBe(true);
      expect(state.jsonData.data.statusCode).toBe(200);
      expect(state.jsonData.data.resultText).toBe('Task completed successfully');
    });

    it('executes task with optional intent and metadata', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'exec-adapter-2' })));

      const mockResponse = {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ result: 'Done' }),
      };
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as Response);

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'exec-adapter-2' },
        body: JSON.stringify({
          prompt: 'Plan the refactor',
          targetAgent: { id: 'agent-x', name: 'Agent X', platform: 'custom' },
          intent: 'plan',
          metadata: { priority: 'high' },
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', req, res);

      expect(state.statusCode).toBe(200);
      expect(state.jsonData.success).toBe(true);

      // Verify the envelope sent to fetch includes the intent and metadata
      const [, opts] = vi.mocked(globalThis.fetch).mock.calls[0];
      const body = JSON.parse(opts?.body as string);
      expect(body.intent).toBe('plan');
      expect(body.metadata?.priority).toBe('high');
    });

    it('returns 404 for execute on nonexistent adapter', async () => {
      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'nope' },
        body: JSON.stringify({
          prompt: 'test',
          targetAgent: { id: 'a', name: 'A', platform: 'x' },
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', req, res);

      expect(state.statusCode).toBe(404);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/not found/i);
    });

    it('returns 400 if prompt is missing', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'exec-no-prompt' })));

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'exec-no-prompt' },
        body: JSON.stringify({
          targetAgent: { id: 'a', name: 'A', platform: 'x' },
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/prompt/i);
    });

    it('returns 400 if targetAgent is missing', async () => {
      registerRestAdapter(new RestAdapter(createConfig({ adapterId: 'exec-no-target' })));

      const req = makeReq({
        method: 'POST',
        params: { adapterId: 'exec-no-target' },
        body: JSON.stringify({
          prompt: 'Do something',
        }),
      });
      const { res, state } = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', req, res);

      expect(state.statusCode).toBe(400);
      expect(state.jsonData.success).toBe(false);
      expect(state.jsonData.error.message).toMatch(/targetAgent/i);
    });
  });

  // -----------------------------------------------------------------------
  // Full lifecycle integration
  // -----------------------------------------------------------------------

  describe('Full lifecycle: register -> get -> health -> execute -> delete', () => {
    it('completes entire adapter lifecycle', async () => {
      // 1. Register
      const registerReq = makeReq({
        method: 'POST',
        body: JSON.stringify({
          adapterId: 'lifecycle-adapter',
          baseUrl: 'http://lifecycle.example.com',
        }),
      });
      const registerRes = makeRes();
      await runStack(restAdapterRouter, '/', 'post', registerReq, registerRes.res);
      expect(registerRes.state.statusCode).toBe(201);

      // 2. Get details
      const getReq = makeReq({
        method: 'GET',
        params: { adapterId: 'lifecycle-adapter' },
      });
      const getRes = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'get', getReq, getRes.res);
      expect(getRes.state.statusCode).toBe(200);
      expect(getRes.state.jsonData.data.adapterId).toBe('lifecycle-adapter');

      // 3. Health check
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
      } as Response);

      const healthReq = makeReq({
        method: 'POST',
        params: { adapterId: 'lifecycle-adapter' },
      });
      const healthRes = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/health-check', 'post', healthReq, healthRes.res);
      expect(healthRes.state.statusCode).toBe(200);
      expect(healthRes.state.jsonData.data.reachable).toBe(true);

      // 4. Execute task
      vi.mocked(globalThis.fetch).mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ result: 'Lifecycle task done' }),
      } as Response);

      const execReq = makeReq({
        method: 'POST',
        params: { adapterId: 'lifecycle-adapter' },
        body: JSON.stringify({
          prompt: 'Full lifecycle test',
          targetAgent: { id: 'target', name: 'Target', platform: 'custom' },
        }),
      });
      const execRes = makeRes();
      await runStack(restAdapterRouter, '/:adapterId/execute', 'post', execReq, execRes.res);
      expect(execRes.state.statusCode).toBe(200);
      expect(execRes.state.jsonData.data.success).toBe(true);

      // 5. Verify it shows in list
      const listReq = makeReq({ method: 'GET' });
      const listRes = makeRes();
      await runStack(restAdapterRouter, '/', 'get', listReq, listRes.res);
      expect(listRes.state.jsonData.data.count).toBe(1);

      // 6. Delete
      const deleteReq = makeReq({
        method: 'DELETE',
        params: { adapterId: 'lifecycle-adapter' },
      });
      const deleteRes = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'delete', deleteReq, deleteRes.res);
      expect(deleteRes.state.statusCode).toBe(200);
      expect(deleteRes.state.jsonData.data.unregistered).toBe(true);

      // 7. Verify gone
      const getAfterReq = makeReq({
        method: 'GET',
        params: { adapterId: 'lifecycle-adapter' },
      });
      const getAfterRes = makeRes();
      await runStack(restAdapterRouter, '/:adapterId', 'get', getAfterReq, getAfterRes.res);
      expect(getAfterRes.state.statusCode).toBe(404);
    });
  });
});
