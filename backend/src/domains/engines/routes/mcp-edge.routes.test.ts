/**
 * The governed MCP HTTP edge — route-level tests over `buildMcpEdgeRouter` +
 * `buildInternalEnginesRouter`. Proves the stdio bridge's wire contract:
 *
 *  - POST /tools/:server/:tool/call happy path (mocked host → `completed`
 *    envelope with `result` + `auditEventId`, never the raw audit event)
 *  - unknown server → 404 NOT_FOUND (transport-level problem stays HTTP)
 *  - gate-deny → 200 envelope whose `data.status = 'denied'` carries the
 *    truthful reason (the bridge branches on `data.status`)
 *  - malformed body → 400 VALIDATION_ERROR before the host is touched
 *  - POST /call body-addressed variant
 *  - POST /engines/:id/restart (known id delegated / unknown id 404)
 *  - REAL-GATE integration: a domain-tools-bridge registration on a real
 *    `InteropHostBundle` resolves + executes through `authorize → risk →
 *    execute → audit`, and an actor deny-rule is enforced by the real gate
 *  - GET /internal health (truthful per-engine readings)
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Logger } from '../../../shared/logger.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type {
  McpHostPort,
  HostCallOutcome,
  McpServerRegistration,
} from '../ports/mcp-host.port.js';
import type { EngineHealth } from '../types.js';
import { InteropHostBundle } from '../mcp/mcp-host.js';
import { registerDomainToolsOnHost } from '../adapters/domain-tools-bridge.adapter.js';
import {
  buildMcpEdgeRouter,
  buildInternalEnginesRouter,
  buildEdgeActor,
  type McpEdgeRoutesDeps,
  type RestartOutcome,
} from './mcp-edge.routes.js';

// --- tiny dependency-free HTTP client (global fetch is mocked by tests/setup) ---

function request(
  base: string,
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const payload = init.body === undefined ? undefined : JSON.stringify(init.body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: payload === undefined ? {} : { 'content-type': 'application/json' },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, json: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

// --- shared fakes ---

const fakeLog = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
} as unknown as Logger;

const testPrincipal = { userId: 'tester', isAnonymous: false } as unknown as Principal;
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = testPrincipal;
  next();
};
const fakeMw = {
  authenticate: passAuth,
  authenticateMutating: passAuth,
  requireAdmin: passAuth,
  requireInternal: passAuth,
} as unknown as AuthMiddleware;

const demoServer: McpServerRegistration = {
  serverId: 'demo',
  kind: 'custom',
  displayName: 'demo',
  transport: 'custom',
  enabled: true,
  toolNames: ['demo.echo'],
  metadata: { external: false },
};

function completedOutcome(): HostCallOutcome {
  return {
    status: 'completed',
    decision: { allowed: true, reason: 'ok' },
    risk: 'low',
    result: { content: { echoed: true } },
    audit: { eventId: 'evt_ok_1' },
  } as unknown as HostCallOutcome;
}

function deniedOutcome(reason: string): HostCallOutcome {
  return {
    status: 'denied',
    decision: { allowed: false, reason },
    risk: 'low',
    reason,
    audit: { eventId: 'evt_deny_1' },
  } as unknown as HostCallOutcome;
}

function startServer(router: express.Router): Promise<{ base: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.use(router);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({ base: `http://127.0.0.1:${port}`, server });
    });
  });
}

function buildMockedDeps(overrides: Partial<McpEdgeRoutesDeps> = {}): {
  deps: McpEdgeRoutesDeps;
  callSpy: ReturnType<typeof vi.fn>;
  restartSpy: ReturnType<typeof vi.fn>;
} {
  const callSpy = vi.fn(async () => completedOutcome());
  const restartSpy = vi.fn(
    async (): Promise<RestartOutcome> => ({ outcome: 'restarted' }),
  );
  const host = {
    listServers: vi.fn(() => [demoServer]),
    getServer: vi.fn((id: string) => (id === 'demo' ? demoServer : null)),
    registerServer: vi.fn(),
    registerInProcTool: vi.fn(),
    registerExternalServer: vi.fn(),
    authorize: vi.fn(),
    call: callSpy,
  } as unknown as McpHostPort;
  const deps: McpEdgeRoutesDeps = {
    host,
    mw: fakeMw,
    log: fakeLog,
    restartEngine: restartSpy,
    ...overrides,
  };
  return { deps, callSpy, restartSpy };
}

// --- the mocked-host wire contract ---

describe('governed MCP edge (mocked host)', () => {
  let base: string;
  let server: http.Server;
  let callSpy: ReturnType<typeof vi.fn>;
  let restartSpy: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    const built = buildMockedDeps();
    callSpy = built.callSpy;
    restartSpy = built.restartSpy;
    ({ base, server } = await startServer(buildMcpEdgeRouter(built.deps)));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('GET /servers lists the gated registry catalog', async () => {
    const res = await request(base, '/servers');
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { count: 1, servers: [{ serverId: 'demo' }] },
    });
  });

  it('POST /tools/:server/:tool/call routes the gated call and returns the completed envelope', async () => {
    const res = await request(base, '/tools/demo/demo.echo/call', {
      method: 'POST',
      body: { args: { msg: 'hi' } },
    });
    expect(res.status).toBe(200);
    const body = res.json() as { data: Record<string, unknown> };
    expect(body).toMatchObject({
      success: true,
      data: {
        status: 'completed',
        risk: 'low',
        result: { content: { echoed: true } },
        auditEventId: 'evt_ok_1',
      },
    });
    // SECURITY: the raw audit event (embeds call args) must never cross the wire.
    expect(body.data).not.toHaveProperty('audit');
    expect(callSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        server: demoServer,
        toolName: 'demo.echo',
        args: { msg: 'hi' },
        actor: expect.objectContaining({ agentId: 'tester' }),
      }),
    );
  });

  it('attributes the body actor (agentId + toolRules) when supplied', async () => {
    await request(base, '/tools/demo/demo.echo/call', {
      method: 'POST',
      body: {
        actor: {
          agentId: 'agent_smith',
          permissions: { toolRules: [{ toolName: 'demo.echo', effect: 'allow' }] },
        },
      },
    });
    expect(callSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ actor: expect.objectContaining({ agentId: 'agent_smith' }) }),
    );
  });

  it('returns 404 NOT_FOUND for an unknown server (transport-level, host never called)', async () => {
    const before = callSpy.mock.calls.length;
    const res = await request(base, '/tools/nope/demo.echo/call', {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
    expect(callSpy.mock.calls.length).toBe(before);
  });

  it('surfaces a gate-deny as a 200 envelope with the truthful status + reason', async () => {
    callSpy.mockResolvedValueOnce(deniedOutcome('Tool denied: demo.echo'));
    const res = await request(base, '/tools/demo/demo.echo/call', {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { status: 'denied', reason: 'Tool denied: demo.echo', auditEventId: 'evt_deny_1' },
    });
  });

  it('rejects a malformed body with 400 VALIDATION_ERROR before touching the host', async () => {
    const before = callSpy.mock.calls.length;
    const res = await request(base, '/tools/demo/demo.echo/call', {
      method: 'POST',
      body: { args: 5 }, // args must be an object
    });
    expect(res.status).toBe(400);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
    expect(callSpy.mock.calls.length).toBe(before);
  });

  it('POST /call (body-addressed) runs the same gated route', async () => {
    const res = await request(base, '/call', {
      method: 'POST',
      body: { server: 'demo', tool: 'demo.echo', args: { n: 2 } },
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { status: 'completed' } });
    expect(callSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolName: 'demo.echo', args: { n: 2 } }),
    );
  });

  it('POST /call without a server field is a 400', async () => {
    const res = await request(base, '/call', {
      method: 'POST',
      body: { tool: 'demo.echo' },
    });
    expect(res.status).toBe(400);
  });

  it('POST /engines/:id/restart delegates a known engine to restartEngine', async () => {
    const res = await request(base, '/engines/colbert/restart', {
      method: 'POST',
      body: { reason: 'stuck' },
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { engineId: 'colbert', outcome: 'restarted' },
    });
    expect(restartSpy).toHaveBeenCalledWith('colbert', 'tester', 'stuck');
  });

  it('POST /engines/:id/restart 404s an unknown engine id', async () => {
    const res = await request(base, '/engines/not-an-engine/restart', {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});

// --- REAL gate: domain-tools bridge registration → authorize → execute → audit ---

describe('governed MCP edge (real InteropHostBundle + domain-tools bridge)', () => {
  let base: string;
  let server: http.Server;

  beforeAll(async () => {
    const bundle = new InteropHostBundle();
    const [registration] = registerDomainToolsOnHost(
      bundle,
      [
        {
          serverId: 'demo-domain',
          tools: [
            {
              name: 'demo.echo',
              description: 'echo the args back',
              handler: async (args: unknown) => ({ echoed: args }),
            },
          ],
        },
      ],
      fakeLog,
    );
    expect(registration?.skipped).toBe(false);
    const restartEngine = vi.fn(async (): Promise<RestartOutcome> => ({ outcome: 'skipped' }));
    ({ base, server } = await startServer(
      buildMcpEdgeRouter({ host: bundle, mw: fakeMw, log: fakeLog, restartEngine }),
    ));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('resolves the bridged server from the gated registry and completes the call', async () => {
    const res = await request(base, '/tools/demo-domain/demo.echo/call', {
      method: 'POST',
      body: { args: { msg: 'hi' } },
    });
    expect(res.status).toBe(200);
    const body = res.json() as {
      data: { status: string; result: { content: { echoed: { msg: string } } }; auditEventId: string };
    };
    expect(body.data.status).toBe('completed');
    expect(body.data.result.content.echoed.msg).toBe('hi');
    expect(body.data.auditEventId).toBeTruthy();
  });

  it('enforces an actor deny-rule through the REAL gate (truthful denied status)', async () => {
    const res = await request(base, '/tools/demo-domain/demo.echo/call', {
      method: 'POST',
      body: {
        actor: {
          agentId: 'blocked_agent',
          permissions: {
            toolRules: [{ toolName: 'demo.echo', effect: 'deny', reason: 'blocked by policy' }],
          },
        },
        args: {},
      },
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: { status: 'denied', reason: 'blocked by policy' },
    });
  });

  it('denies a tool that is not in the server allowlist (registry gate, not a 500)', async () => {
    const res = await request(base, '/tools/demo-domain/not.registered/call', {
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(200);
    const body = res.json() as { data: { status: string; reason: string } };
    expect(body.data.status).toBe('denied');
    expect(body.data.reason).toContain('not registered');
  });
});

// --- the deny-biased wire actor ---

describe('buildEdgeActor', () => {
  it('builds a full deny-biased profile carrying only the supplied tool rules', () => {
    const actor = buildEdgeActor('agent_x', [{ toolName: 't', effect: 'deny' }]);
    expect(actor.agentId).toBe('agent_x');
    expect(actor.permissions.toolRules).toEqual([{ toolName: 't', effect: 'deny' }]);
    expect(actor.permissions.allowShell).toBe(false);
    expect(actor.permissions.allowSecretsAccess).toBe(false);
    expect(actor.permissions.defaultFileEffect).toBe('deny');
  });
});

// --- the INTERNAL_SERVICE_KEY-gated worker surface ---

describe('internal engines router', () => {
  let base: string;
  let server: http.Server;
  const readings: readonly EngineHealth[] = [
    { engineId: 'beads', transport: 'cli', status: 'up', checkedAt: new Date().toISOString() },
    {
      engineId: 'colbert',
      transport: 'daemon',
      status: 'down',
      reason: 'binary absent',
      checkedAt: new Date().toISOString(),
    },
  ] as unknown as readonly EngineHealth[];

  beforeAll(async () => {
    ({ base, server } = await startServer(
      buildInternalEnginesRouter({ mw: fakeMw, listHealth: async () => readings }),
    ));
  });
  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  it('GET /health returns the truthful per-engine readings + rollup', async () => {
    const res = await request(base, '/health');
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({
      success: true,
      data: {
        count: 2,
        up: 1,
        engines: [
          { engineId: 'beads', status: 'up' },
          { engineId: 'colbert', status: 'down', reason: 'binary absent' },
        ],
      },
    });
  });
});
