/**
 * Tests for the recodergit MCP exposure phase:
 *  - RecoderGitService server supervision (ensureServer/serverHealth/stopServer)
 *    with an INJECTED fake spawn so NO real process is ever started.
 *  - Flag-gated, governed registration of the recodergit MCP server into the
 *    existing Recoder MCP host router (permission + audit path, not a bypass).
 */
import { EventEmitter } from 'node:events';
import type { Router } from 'express';
import { describe, expect, it, vi } from 'vitest';
import type { AgentProfile } from '@recoder/agent-os';
import {
  RecoderGitService,
  type ServerProcessHandle,
  type ServerSpawner,
} from './recodergit-service';
import { createAgentMcpRouter } from './routes/mcp-control.routes';

// ----------------------------------------------------------------------------
// Server supervision (RecoderGitService.ensureServer / serverHealth / stop)
// ----------------------------------------------------------------------------

function fakeHandle(pid: number | null): ServerProcessHandle & {
  exit: (code: number | null) => void;
  error: (e: Error) => void;
  killed: () => boolean;
} {
  let exitCb: ((code: number | null) => void) | null = null;
  let errorCb: ((e: Error) => void) | null = null;
  let wasKilled = false;
  return {
    pid,
    kill: () => {
      wasKilled = true;
    },
    onExit: (cb) => {
      exitCb = cb;
    },
    onError: (cb) => {
      errorCb = cb;
    },
    exit: (code) => exitCb?.(code),
    error: (e) => errorCb?.(e),
    killed: () => wasKilled,
  };
}

describe('RecoderGitService — MCP server supervision', () => {
  it('flag OFF -> ensureServer is a no-op: status disabled, NO spawn', async () => {
    const spawnServer = vi.fn<Parameters<ServerSpawner>, ReturnType<ServerSpawner>>(() => {
      throw new Error('spawn must not run when disabled');
    });
    const service = new RecoderGitService({
      isEnabled: () => false,
      spawnServer,
      resolveBin: () => '/bin/recodergit',
    });

    const health = await service.ensureServer();
    expect(health.status).toBe('disabled');
    expect(health.baseUrl).toBeNull();
    expect(health.pid).toBeNull();
    expect(spawnServer).not.toHaveBeenCalled();
    expect(service.serverHealth().status).toBe('disabled');
  });

  it('flag ON + injected spawn -> ready with base URL + pid; idempotent (no double-spawn)', async () => {
    const handle = fakeHandle(4242);
    const spawnServer = vi.fn<Parameters<ServerSpawner>, ReturnType<ServerSpawner>>(() => handle);
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => '/bin/recodergit',
      spawnServer,
      serverPort: () => 7337,
    });

    const health = await service.ensureServer();
    expect(health.status).toBe('ready');
    expect(health.port).toBe(7337);
    expect(health.pid).toBe(4242);
    expect(health.baseUrl).toBe('http://127.0.0.1:7337/mcp');
    expect(spawnServer).toHaveBeenCalledOnce();
    expect(spawnServer).toHaveBeenCalledWith('/bin/recodergit', [
      'mcp',
      '--http',
      '--port',
      '7337',
      '--host',
      '127.0.0.1',
    ]);

    // Idempotent: a live, ready child is reused — not re-spawned.
    const again = await service.ensureServer();
    expect(again.status).toBe('ready');
    expect(spawnServer).toHaveBeenCalledOnce();
  });

  it('bin not found -> unavailable, NO spawn, never throws', async () => {
    const spawnServer = vi.fn<Parameters<ServerSpawner>, ReturnType<ServerSpawner>>(() => {
      throw new Error('spawn must not run without a bin');
    });
    const error = vi.fn();
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => null,
      spawnServer,
      logger: { error },
    });

    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
    expect(health.baseUrl).toBeNull();
    expect(spawnServer).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('spawn throws -> unavailable, never throws into caller', async () => {
    const error = vi.fn();
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => '/bin/recodergit',
      spawnServer: () => {
        throw new Error('ENOENT');
      },
      logger: { error },
    });

    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
    expect(error).toHaveBeenCalled();
  });

  it('spawn returns no pid -> unavailable', async () => {
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => '/bin/recodergit',
      spawnServer: () => fakeHandle(null),
      logger: { error: vi.fn() },
    });
    const health = await service.ensureServer();
    expect(health.status).toBe('unavailable');
  });

  it('child exit -> health degrades to unavailable (truthful, no stale ready)', async () => {
    const handle = fakeHandle(99);
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => '/bin/recodergit',
      spawnServer: () => handle,
      logger: { error: vi.fn() },
    });
    expect((await service.ensureServer()).status).toBe('ready');
    handle.exit(1);
    expect(service.serverHealth().status).toBe('unavailable');
    expect(service.serverHealth().baseUrl).toBeNull();
  });

  it('stopServer kills the child and resets health', async () => {
    const handle = fakeHandle(77);
    const service = new RecoderGitService({
      isEnabled: () => true,
      resolveBin: () => '/bin/recodergit',
      spawnServer: () => handle,
    });
    await service.ensureServer();
    service.stopServer();
    expect(handle.killed()).toBe(true);
    expect(service.serverHealth().status).toBe('unavailable');
  });
});

// ----------------------------------------------------------------------------
// Governed, flag-gated registration into the MCP host router
// ----------------------------------------------------------------------------

type MockReq = EventEmitter & {
  method: string;
  body: Record<string, unknown>;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Record<string, string>;
};

function makeReq(opts: { method?: string; body?: Record<string, unknown>; params?: Record<string, string> } = {}): MockReq {
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

async function runStack(router: Router, path: string, method: 'post' | 'get', req: MockReq, res: any): Promise<void> {
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

// A basic read-capable actor with no deny rules -> low-risk read tools allowed.
const readerActor: AgentProfile = {
  agentId: 'agent-reader',
  displayName: 'Reader',
  vendorSurface: 'codex',
  connectorId: 'codex:local',
  runtimeKind: 'local',
  capabilities: [],
  tools: [{ toolName: 'code_graph.query', modes: ['execute'] }],
  supportedTaskIntents: ['feature_delivery'],
  permissions: {
    defaultFileEffect: 'deny',
    pathRules: [],
    toolRules: [],
    allowNetwork: true,
    allowShell: false,
    allowGitWrite: false,
    allowPrCreation: false,
    allowSecretsAccess: false,
    maxParallelSubagents: 1,
    writeLockRequired: true,
  },
  approvalPolicy: { mode: 'policy', requiredRules: [], allowAutoApprovalForLowRisk: true },
  memoryScope: 'repo',
  cwdPolicy: { mode: 'repo_root', allowedRoots: ['/workspace/repo'] },
  health: { status: 'healthy', checkedAt: '2026-06-26T00:00:00.000Z' },
  lastSeenAt: '2026-06-26T00:00:00.000Z',
};

const disabledCodeGraph = { isEnabled: () => false, ensureServer: vi.fn(async () => ({ status: 'disabled' })) };

describe('MCP host registration — recodergit (flag-gated, governed)', () => {
  it('flag OFF -> recodergit NOT in /servers or /tools, NO ensureServer/spawn', async () => {
    const ensureServer = vi.fn(async () => ({ status: 'disabled' }));
    const router = createAgentMcpRouter({ codeGraph: { isEnabled: () => false, ensureServer } });

    const serversReq = makeReq();
    const serversRes = makeRes();
    await runStack(router, '/servers', 'get', serversReq, serversRes.res);
    const serverIds = serversRes.state.jsonData.data.map((s: any) => s.serverId);
    expect(serverIds).not.toContain('recoder.code_graph');
    expect(serverIds).toContain('recoder.github'); // existing host unaffected

    const toolsReq = makeReq();
    const toolsRes = makeRes();
    await runStack(router, '/tools', 'get', toolsReq, toolsRes.res);
    const toolNames = toolsRes.state.jsonData.data.map((t: any) => t.toolName);
    expect(toolNames.some((n: string) => n.startsWith('code_graph.'))).toBe(false);

    expect(ensureServer).not.toHaveBeenCalled();
  });

  it('flag OFF -> /check for recodergit tool is 404 (not silently exposed)', async () => {
    const router = createAgentMcpRouter({ codeGraph: disabledCodeGraph });
    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.code_graph', toolName: 'code_graph.query' },
      body: { actor: readerActor, args: { q: 'x' } },
    });
    const { res, state } = makeRes();
    await runStack(router, '/tools/:serverId/:toolName/check', 'post', req, res);
    expect(state.statusCode).toBe(404);
  });

  it('flag ON -> recodergit registered (read-only tools) + best-effort ensureServer', async () => {
    const ensureServer = vi.fn(async () => ({ status: 'ready' }));
    const router = createAgentMcpRouter({ codeGraph: { isEnabled: () => true, ensureServer } });

    const { res, state } = makeRes();
    await runStack(router, '/servers', 'get', makeReq(), res);
    const server = state.jsonData.data.find((s: any) => s.serverId === 'recoder.code_graph');
    expect(server).toBeTruthy();
    expect(server.kind).toBe('recoder_code_graph');
    expect(server.metadata?.readOnly).toBe(true);
    expect(server.toolNames).toContain('code_graph.query');
    // Supervision was triggered best-effort by registration.
    expect(ensureServer).toHaveBeenCalled();
  });

  it('flag ON -> tool call goes through the GOVERNED permission + audit path (not a bypass)', async () => {
    const recordAuditEvent = vi.fn();
    const recordPolicyDecision = vi.fn();
    const router = createAgentMcpRouter({
      codeGraph: { isEnabled: () => true, ensureServer: vi.fn(async () => ({ status: 'ready' })) },
      recordAuditEvent,
      recordPolicyDecision,
    });

    const req = makeReq({
      method: 'POST',
      params: { serverId: 'recoder.code_graph', toolName: 'code_graph.query' },
      body: { actor: readerActor, args: { q: 'find' } },
    });
    const { res, state } = makeRes();
    await runStack(router, '/tools/:serverId/:toolName/check', 'post', req, res);

    // Registered + read-only + low risk -> allowed (200), proving it is callable
    // AND that it flowed through checkMcpToolPermission (policyDecision present)
    // and the audit sink — i.e. governed, not a raw passthrough.
    expect(state.statusCode).toBe(200);
    expect(state.jsonData.data.allowed).toBe(true);
    expect(state.jsonData.data.policyDecision).toBeTruthy();
    expect(recordPolicyDecision).toHaveBeenCalled();
    expect(recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ serverId: 'recoder.code_graph', toolName: 'code_graph.query' }),
      }),
    );
  });

  it('ensureServer throwing must NOT break the host (best-effort) — servers still listed', async () => {
    const router = createAgentMcpRouter({
      codeGraph: {
        isEnabled: () => true,
        ensureServer: () => {
          throw new Error('engine down');
        },
      },
    });
    const { res, state } = makeRes();
    await runStack(router, '/servers', 'get', makeReq(), res);
    const serverIds = state.jsonData.data.map((s: any) => s.serverId);
    // Host stays healthy: existing servers present and recodergit still listed.
    expect(serverIds).toContain('recoder.github');
    expect(serverIds).toContain('recoder.code_graph');
  });
});
