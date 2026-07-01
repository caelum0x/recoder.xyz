import { EventEmitter } from 'node:events';
import type { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { agentOsContainer } from '../service-container';
import { createInternalAgentOsRouter } from './internal.routes';

// These tests drive the internal RunEvent ingress route the Python PAL process
// uses (POST /internal/agent-os/events). They walk the router stack the same way
// the other agent-os route tests do (no supertest dependency in this package),
// so the requireInternalServiceKey gate and validateBody(runEventSchema) +
// controller.appendEvent wiring are exercised exactly as mounted.
//
// In a plain test process (no DATABASE_URL / AGENT_OS_* env) the shared
// agentOsContainer defaults to an InMemoryAgentOsRepository, so the "with key"
// case appends into real, deterministic in-memory state.

type MockReq = EventEmitter & {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
  header(name: string): string | undefined;
};

function makeReq(opts: {
  method?: string;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'POST';
  emitter.body = opts.body ?? {};
  emitter.params = {};
  emitter.query = {};
  const headers = opts.headers ?? {};
  emitter.headers = headers;
  emitter.header = (name: string) => headers[name.toLowerCase()];
  return emitter;
}

function makeRes(): { res: any; state: { statusCode: number; jsonData: any } } {
  const state = { statusCode: 200, jsonData: null as any };
  const res: any = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(data: any) {
      state.jsonData = data;
      return res;
    },
  };
  return { res, state };
}

function getRouteStack(router: Router, path: string, method: 'post' | 'get') {
  const middleware = router.stack.filter((layer: any) => !layer.route).map((layer: any) => layer.handle);
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return [...middleware, ...routeLayer.route.stack.map((layer: any) => layer.handle)];
}

async function runStack(
  router: Router,
  path: string,
  method: 'post' | 'get',
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
        Promise.resolve(handler(req, res, next))
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

describe('Internal Agent OS RunEvent ingress (POST /internal/agent-os/events)', () => {
  const INTERNAL_KEY = 'internal-key-for-pal-tests';
  let previousKey: string | undefined;

  beforeEach(() => {
    previousKey = process.env.INTERNAL_SERVICE_KEY;
    process.env.INTERNAL_SERVICE_KEY = INTERNAL_KEY;
  });

  afterEach(() => {
    if (previousKey === undefined) {
      delete process.env.INTERNAL_SERVICE_KEY;
    } else {
      process.env.INTERNAL_SERVICE_KEY = previousKey;
    }
  });

  it('rejects an append without the internal service key', async () => {
    const router = createInternalAgentOsRouter();
    const req = makeReq({
      body: {
        eventId: 'event-no-key',
        type: 'handoff',
        taskId: 'task-no-key',
        runId: 'run-no-key',
        createdAt: '2026-06-30T10:00:00.000Z',
        data: { childRunId: 'child-no-key', cli_name: 'claude', role: 'implementer' },
      },
    });
    const { res, state } = makeRes();

    await runStack(router, '/events', 'post', req, res);

    expect(state.statusCode).toBe(403);
    expect(state.jsonData?.success).toBe(false);
  });

  it('appends a handoff RunEvent when the internal service key is present', async () => {
    const router = createInternalAgentOsRouter();
    const eventId = `event-handoff-${Date.now()}`;
    const runId = `run-handoff-${Date.now()}`;
    const req = makeReq({
      headers: { 'x-internal-service-key': INTERNAL_KEY },
      body: {
        eventId,
        type: 'handoff',
        taskId: 'task-pal-ingress',
        runId,
        agentId: 'claude',
        createdAt: '2026-06-30T10:01:00.000Z',
        data: { childRunId: 'child-pal-ingress', cli_name: 'claude', role: 'implementer' },
      },
    });
    const { res, state } = makeRes();

    await runStack(router, '/events', 'post', req, res);

    expect(state.statusCode).toBe(201);
    expect(state.jsonData?.success).toBe(true);

    const events = await agentOsContainer.repository.listEvents();
    const appended = events.find((event) => event.eventId === eventId);
    expect(appended).toMatchObject({
      eventId,
      type: 'handoff',
      taskId: 'task-pal-ingress',
      runId,
    });
  });
});
