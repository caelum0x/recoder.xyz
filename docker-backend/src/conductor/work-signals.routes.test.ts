/**
 * Tests for the work-signals ingest on the REAL conductor Express router (the
 * product surface). Drives POST/GET /work-signals through the same router-stack
 * harness the context-ingest route test uses — not a stub of the router.
 *
 * Proves:
 *  - a valid signal is RECORDED to canonical agent-os state (a `handoff` RunEvent
 *    appended to the real shared repository) and returned with a handoff outcome;
 *  - the recorded signal is listable via GET /work-signals (filter by task);
 *  - a malformed body (missing required fields) is rejected 400 and records nothing;
 *  - the ingest is degrade-safe: it never throws even if the repository append
 *    fails — the signal is returned with `recorded:false` (record-only fallback).
 *
 * The coordination handoff runs against the real in-memory engine, so `handoff`
 * is `emitted`/`duplicate`; there is nothing to stub for the product path.
 */
import type { Router } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createConductorRouter } from './conductor.routes';
import { _resetWorkSignalsForTest } from './work-signals';
import { agentOsContainer } from '../agent-os/service-container';

interface MockReq {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, unknown>;
  headers: Record<string, string>;
}

function makeReq(body: Record<string, unknown>, query: Record<string, unknown> = {}): MockReq {
  return { method: 'POST', body, params: {}, query, headers: {} };
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
  const routeLayer = router.stack.find(
    (layer: any) => layer.route?.path === path && layer.route?.methods?.[method],
  );
  if (!routeLayer) throw new Error(`No route for ${method.toUpperCase()} ${path}`);
  return (routeLayer as any).route.stack.map((layer: any) => layer.handle);
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
        if (err) return reject(err);
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

describe('work-signals ingest (POST/GET /api/conductor/work-signals)', () => {
  beforeEach(() => {
    _resetWorkSignalsForTest();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    _resetWorkSignalsForTest();
  });

  it('records a valid signal to canonical agent-os state + emits a pickup handoff', async () => {
    const appendSpy = vi.spyOn(agentOsContainer.repository, 'appendEvent');

    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(
      router,
      '/work-signals',
      'post',
      makeReq({
        workspaceId: 'ws_sig_1',
        spaceId: 'space_sig',
        taskId: 'task_sig_1',
        runId: 'run_sig_1',
        kind: 'blocked',
        detail: 'waiting on a credential the agent cannot obtain',
        reportedBy: 'py/ops-recorder',
      }),
      res,
    );

    expect(state.statusCode).toBe(201);
    expect(state.jsonData?.success).toBe(true);
    const signal = state.jsonData?.data;
    expect(signal?.kind).toBe('blocked');
    expect(signal?.taskId).toBe('task_sig_1');
    expect(typeof signal?.signalId).toBe('string');
    expect(signal?.recorded).toBe(true);
    // Handoff runs against the real in-memory coordination engine on the product
    // path: first sight of this signal emits exactly one pickup handoff.
    expect(signal?.handoff?.status).toBe('emitted');

    // It was genuinely appended to the canonical event log as a `handoff` event.
    expect(appendSpy).toHaveBeenCalledTimes(1);
    const event = appendSpy.mock.calls[0][0] as any;
    expect(event.type).toBe('handoff');
    expect(event.taskId).toBe('task_sig_1');
    expect(event.message).toContain('work-signal:blocked');
    expect(event.data?.workSignal).toBe(true);
    expect(event.data?.reportedBy).toBe('py/ops-recorder');
  });

  it('lists ingested signals (newest first) and filters by taskId', async () => {
    const router = createConductorRouter();

    for (const taskId of ['task_a', 'task_b']) {
      const { res } = makeRes();
      await runStack(
        router,
        '/work-signals',
        'post',
        makeReq({ workspaceId: `ws_${taskId}`, spaceId: 'space_list', taskId, kind: 'stuck-work' }),
        res,
      );
    }

    const { res, state } = makeRes();
    await runStack(router, '/work-signals', 'get', makeReq({}, { taskId: 'task_b' }), res);

    expect(state.statusCode).toBe(200);
    const list = state.jsonData?.data as Array<{ taskId: string }>;
    expect(list).toHaveLength(1);
    expect(list[0].taskId).toBe('task_b');
  });

  it('coerces an unknown kind to stuck-work (never rejects on kind)', async () => {
    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(
      router,
      '/work-signals',
      'post',
      makeReq({ workspaceId: 'ws_k', spaceId: 'space_k', taskId: 'task_k', kind: 'totally-made-up' }),
      res,
    );
    expect(state.statusCode).toBe(201);
    expect(state.jsonData?.data?.kind).toBe('stuck-work');
  });

  it('rejects a malformed body (missing taskId) with 400 and records nothing', async () => {
    const appendSpy = vi.spyOn(agentOsContainer.repository, 'appendEvent');
    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(
      router,
      '/work-signals',
      'post',
      makeReq({ workspaceId: 'ws_bad', spaceId: 'space_bad' }),
      res,
    );
    expect(state.statusCode).toBe(400);
    expect(state.jsonData?.success).toBe(false);
    expect(state.jsonData?.error).toContain('taskId');
    expect(appendSpy).not.toHaveBeenCalled();
  });

  it('is degrade-safe: a repository append failure yields recorded:false (record-only, never throws)', async () => {
    vi.spyOn(agentOsContainer.repository, 'appendEvent').mockImplementation(() => {
      throw new Error('repository unavailable (injected)');
    });

    const router = createConductorRouter();
    const { res, state } = makeRes();
    await runStack(
      router,
      '/work-signals',
      'post',
      makeReq({ workspaceId: 'ws_deg', spaceId: 'space_deg', taskId: 'task_deg', kind: 'needs-handoff' }),
      res,
    );

    // Still a successful ingest — the signal is returned, just not persisted.
    expect(state.statusCode).toBe(201);
    expect(state.jsonData?.success).toBe(true);
    expect(state.jsonData?.data?.recorded).toBe(false);
    // The in-memory ring still has it (the GET would surface it).
    const { res: listRes, state: listState } = makeRes();
    await runStack(router, '/work-signals', 'get', makeReq({}, { taskId: 'task_deg' }), listRes);
    expect((listState.jsonData?.data as unknown[]).length).toBe(1);
  });
});
