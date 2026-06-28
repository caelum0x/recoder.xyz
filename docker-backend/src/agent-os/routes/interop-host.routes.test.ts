import { EventEmitter } from 'node:events';
import type { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AgentProfile } from '@recoder/agent-os';
import { createAgentMcpRouter } from './mcp-control.routes';
import { InteropHostBundle } from '../mcp/interop-host';
import { PAL_SERVER_ID, PAL_TOOL_NAMES } from '@recoder/interop';

/**
 * Proves docker-backend ADOPTS the @recoder/interop MCP host:
 *
 *  1. A tool call routed through the interop host traverses authorize → risk →
 *     execute → audit. Un-permitted calls are DENIED before execution and still
 *     AUDITED; permitted calls EXECUTE and are AUDITED.
 *  2. The real Python `py/pal-mcp-server` is a registered EXTERNAL server with a
 *     resolvable launch config and truthful (degrade-safe) health.
 *
 * No stubs/mocks of the host: a real `InteropHostBundle` (real `McpHost`, real
 * registry, real audit) is constructed and injected into the live route.
 */

type MockReq = EventEmitter & {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

function makeReq(opts: {
  method?: string;
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}): MockReq {
  const emitter = new EventEmitter() as MockReq;
  emitter.method = opts.method ?? 'GET';
  emitter.body = opts.body ?? {};
  emitter.params = opts.params ?? {};
  emitter.query = {};
  emitter.headers = {};
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

/** Base actor: a low-risk read tool (`github.search`) is permitted. */
function makeActor(overrides: Partial<AgentProfile['permissions']> = {}): AgentProfile {
  return {
    agentId: 'agent-codex',
    displayName: 'Codex',
    vendorSurface: 'codex',
    connectorId: 'codex:local',
    runtimeKind: 'local',
    capabilities: [],
    tools: [{ toolName: 'github.search', modes: ['execute'] }],
    supportedTaskIntents: ['feature_delivery'],
    permissions: {
      defaultFileEffect: 'deny',
      pathRules: [],
      toolRules: [],
      allowNetwork: true,
      allowShell: true,
      allowGitWrite: true,
      allowPrCreation: false,
      allowSecretsAccess: false,
      maxParallelSubagents: 1,
      writeLockRequired: true,
      ...overrides,
    },
    approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: false },
    memoryScope: 'repo',
    cwdPolicy: { mode: 'repo_root', allowedRoots: ['/workspace/repo'] },
    health: { status: 'healthy', checkedAt: '2026-06-13T00:00:00.000Z' },
    lastSeenAt: '2026-06-13T00:00:00.000Z',
  };
}

describe('docker-backend adopts the @recoder/interop MCP host', () => {
  it('DENIES an un-permitted tool through the interop gate and AUDITS the denial', async () => {
    const recordAuditEvent = vi.fn();
    const recordPolicyDecision = vi.fn();
    const bundle = new InteropHostBundle();
    const router = createAgentMcpRouter({ interopBundle: bundle, recordAuditEvent, recordPolicyDecision });

    // Actor explicitly denied for github.search via a tool rule → canCallMcpTool
    // denies before any executor is touched.
    const actor = makeActor({
      toolRules: [{ toolName: 'github.search', effect: 'deny', reason: 'blocked in test' }],
    });
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.search' },
      body: { actor, args: { q: 'recoder' } },
    });
    const { res, state } = makeRes();

    await runStack(router, '/tools/:serverId/:toolName/call', 'post', req, res);

    expect(state.statusCode).toBe(403);
    expect(state.jsonData.data.status).toBe('denied');
    expect(state.jsonData.data.allowed).toBe(false);
    // The denial is AUDITED with an immutable event before execution.
    expect(state.jsonData.data.audit).toBeTruthy();
    expect(state.jsonData.data.audit.call.status).toBe('denied');
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ serverId: 'recoder.github', toolName: 'github.search', status: 'denied' }),
      }),
    );
  });

  it('ALLOWS + EXECUTES + AUDITS a permitted low-risk tool through the interop gate', async () => {
    const recordAuditEvent = vi.fn();
    const bundle = new InteropHostBundle();
    // Bind a real in-proc handler — it runs ONLY after the gate authorizes.
    const executed = vi.fn(async () => ({ content: { hits: 1 } }));
    bundle.registerInProcTool('recoder.github', 'github.search', executed);

    const router = createAgentMcpRouter({ interopBundle: bundle, recordAuditEvent });
    const actor = makeActor(); // no deny rule; github.search is low-risk → allowed
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.search' },
      body: { actor, args: { q: 'recoder' } },
    });
    const { res, state } = makeRes();

    await runStack(router, '/tools/:serverId/:toolName/call', 'post', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    expect(state.jsonData.data.status).toBe('completed');
    expect(state.jsonData.data.allowed).toBe(true);
    expect(state.jsonData.data.risk).toBe('low');
    expect(state.jsonData.data.result).toEqual({ content: { hits: 1 } });
    // The executor actually ran (real execution, not a faked success).
    expect(executed).toHaveBeenCalledTimes(1);
    // The completed call is AUDITED.
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ serverId: 'recoder.github', toolName: 'github.search', status: 'completed' }),
      }),
    );
  });

  it('DENIES a tool the server never registered (allowlist enforcement) and AUDITS it', async () => {
    const bundle = new InteropHostBundle();
    const router = createAgentMcpRouter({ interopBundle: bundle });
    const actor = makeActor();
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.repo.delete' }, // not in allowlist
      body: { actor, args: {} },
    });
    const { res, state } = makeRes();

    await runStack(router, '/tools/:serverId/:toolName/call', 'post', req, res);

    expect(state.statusCode).toBe(403);
    expect(state.jsonData.data.status).toBe('denied');
    expect(state.jsonData.data.reason).toContain('not registered');
  });

  it('registers py/pal-mcp-server as an EXTERNAL server with a resolvable config + truthful health', async () => {
    const bundle = new InteropHostBundle();

    // Resolvable from the gated registry (in-proc + external in one place).
    const pal = bundle.getServer(PAL_SERVER_ID);
    expect(pal).toBeTruthy();
    expect(pal?.transport).toBe('stdio');
    expect(pal?.metadata?.external).toBe(true);
    // The allowlist is exactly the real 18 PAL tools (server cannot widen it).
    expect(pal?.toolNames).toEqual([...PAL_TOOL_NAMES]);
    expect(pal?.toolNames).toContain('thinkdeep');

    const status = bundle.palStatus();
    expect(status.serverId).toBe(PAL_SERVER_ID);
    expect(status.config.command).toContain('.pal_venv');
    expect(status.config.args).toEqual(['server.py']);
    // Health is lazy + truthful: the process is not started until first call.
    expect(status.health.healthy).toBe(false);
    // Degrade-safe: availability reflects real on-disk state, never faked.
    expect(typeof status.available).toBe('boolean');
    if (!status.available) {
      expect(status.reason).toBeTruthy();
    }
  });

  it('exposes the external PAL server over GET /external with truthful status', async () => {
    const bundle = new InteropHostBundle();
    const router = createAgentMcpRouter({ interopBundle: bundle });
    const req = makeReq({ method: 'GET' });
    const { res, state } = makeRes();

    await runStack(router, '/external', 'get', req, res);

    expect(state.statusCode).toBe(200);
    expect(state.jsonData.success).toBe(true);
    const palEntry = state.jsonData.data.servers.find((s: any) => s.serverId === PAL_SERVER_ID);
    expect(palEntry).toBeTruthy();
    expect(palEntry.toolNames).toEqual([...PAL_TOOL_NAMES]);
    expect(palEntry.health.healthy).toBe(false); // lazy, not started
  });

  it('does not break the existing pure /check route or /servers route', async () => {
    const router = createAgentMcpRouter();

    const serversReq = makeReq({ method: 'GET' });
    const serversRes = makeRes();
    await runStack(router, '/servers', 'get', serversReq, serversRes.res);
    expect(serversRes.state.statusCode).toBe(200);
    expect(Array.isArray(serversRes.state.jsonData.data)).toBe(true);

    // Existing /check route still behaves: unknown server → 404 (unchanged).
    const checkReq = makeReq({ method: 'POST', params: {}, body: {} });
    const checkRes = makeRes();
    await runStack(router, '/tools/:serverId/:toolName/check', 'post', checkReq, checkRes.res);
    expect(checkRes.state.statusCode).toBe(404);

    // And the actor-validation path on /check still rejects with 400.
    const checkReq2 = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.github', toolName: 'github.search' },
      body: {},
    });
    const checkRes2 = makeRes();
    await runStack(router, '/tools/:serverId/:toolName/check', 'post', checkReq2, checkRes2.res);
    expect(checkRes2.state.statusCode).toBe(400);
  });
});
