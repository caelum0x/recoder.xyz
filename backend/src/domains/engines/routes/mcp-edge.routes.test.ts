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
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
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
        headers: {
          ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
          ...(init.headers ?? {}),
        },
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
        // SECURITY: the edge binds the authenticated principal's userId into args.
        args: { msg: 'hi', userId: 'tester' },
        actor: expect.objectContaining({ agentId: 'tester' }),
      }),
    );
  });

  it('takes the body actor toolRules but FORCES the acting identity to the principal', async () => {
    await request(base, '/tools/demo/demo.echo/call', {
      method: 'POST',
      body: {
        actor: {
          // SECURITY: a caller-supplied agentId must NOT become the acting
          // identity — it is forced to the authenticated principal (`tester`).
          agentId: 'agent_smith',
          permissions: { toolRules: [{ toolName: 'demo.echo', effect: 'allow' }] },
        },
      },
    });
    const input = callSpy.mock.lastCall?.[0] as {
      actor: { agentId: string; permissions: { toolRules: unknown[] } };
      caller?: { userId: string };
    };
    // The spoofed agentId is dropped; the gate sees the real principal identity.
    expect(input.actor.agentId).toBe('tester');
    // …but the body actor's deny-biased tool rules still flow to the gate.
    expect(input.actor.permissions.toolRules).toEqual([
      { toolName: 'demo.echo', effect: 'allow' },
    ]);
    // …and the edge-bound tenant caller is the authenticated principal.
    expect(input.caller?.userId).toBe('tester');
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

  it('rejects a partial or invalid Loom pane credential before calling the host', async () => {
    const built = buildMockedDeps({
      validatePaneCapability: async (paneId, token) => paneId === 'pane_1' && token === 'valid',
    });
    const scoped = await startServer(buildMcpEdgeRouter(built.deps));
    try {
      const partial = await request(scoped.base, '/tools/demo/demo.echo/call', {
        method: 'POST',
        body: {},
        headers: { 'x-recoder-pane-id': 'pane_1' },
      });
      expect(partial.status).toBe(403);

      const invalid = await request(scoped.base, '/tools/demo/demo.echo/call', {
        method: 'POST',
        body: {},
        headers: {
          'x-recoder-pane-id': 'pane_1',
          'x-recoder-pane-token': 'invalid',
        },
      });
      expect(invalid.status).toBe(403);
      expect(built.callSpy).not.toHaveBeenCalled();

      const valid = await request(scoped.base, '/tools/demo/demo.echo/call', {
        method: 'POST',
        body: {},
        headers: {
          'x-recoder-pane-id': 'pane_1',
          'x-recoder-pane-token': 'valid',
        },
      });
      expect(valid.status).toBe(200);
      expect(built.callSpy).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve) => scoped.server.close(() => resolve()));
    }
  });

  it('POST /call (body-addressed) runs the same gated route', async () => {
    const res = await request(base, '/call', {
      method: 'POST',
      body: { server: 'demo', tool: 'demo.echo', args: { n: 2 } },
    });
    expect(res.status).toBe(200);
    expect(res.json()).toMatchObject({ success: true, data: { status: 'completed' } });
    expect(callSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ toolName: 'demo.echo', args: { n: 2, userId: 'tester' } }),
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

// --- tenant identity binding (cross-tenant defense at the edge) ---

describe('governed MCP edge — tenant identity binding (security)', () => {
  function authWith(principal: Partial<Principal>): AuthMiddleware {
    const mw: RequestHandler = (req, _res, next) => {
      req.principal = principal as Principal;
      next();
    };
    return {
      authenticate: mw,
      authenticateMutating: mw,
      requireAdmin: mw,
      requireInternal: mw,
    } as unknown as AuthMiddleware;
  }

  async function withServer(
    mw: AuthMiddleware,
    fn: (base: string, callSpy: ReturnType<typeof vi.fn>) => Promise<void>,
  ): Promise<void> {
    const built = buildMockedDeps({ mw });
    const { base, server } = await startServer(buildMcpEdgeRouter(built.deps));
    try {
      await fn(base, built.callSpy);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  }

  it('binds the authenticated principal userId into args when the caller omits it', async () => {
    await withServer(
      authWith({ userId: 'tester', scopes: [], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/tools/demo/demo.echo/call', {
          method: 'POST',
          body: { args: { query: 'x' } },
        });
        expect(res.status).toBe(200);
        expect(callSpy).toHaveBeenCalledWith(
          expect.objectContaining({ args: { query: 'x', userId: 'tester' } }),
        );
      },
    );
  });

  it('allows a call whose args.userId already matches the authenticated principal', async () => {
    await withServer(
      authWith({ userId: 'tester', scopes: [], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/tools/demo/demo.echo/call', {
          method: 'POST',
          body: { args: { userId: 'tester', query: 'x' } },
        });
        expect(res.status).toBe(200);
        expect(callSpy).toHaveBeenCalledWith(
          expect.objectContaining({ args: { userId: 'tester', query: 'x' } }),
        );
      },
    );
  });

  it('REJECTS (403) a cross-tenant args.userId and never touches the host', async () => {
    await withServer(
      authWith({ userId: 'attacker', scopes: [], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/tools/demo/demo.echo/call', {
          method: 'POST',
          body: { args: { userId: 'victim', query: 'api key' } },
        });
        expect(res.status).toBe(403);
        expect(res.json()).toMatchObject({
          success: false,
          error: { code: 'AUTHZ_PROJECT_ACCESS_DENIED' },
        });
        expect(callSpy).not.toHaveBeenCalled();
      },
    );
  });

  it('also rejects a cross-tenant claim on the body-addressed /call variant', async () => {
    await withServer(
      authWith({ userId: 'attacker', scopes: [], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/call', {
          method: 'POST',
          body: { server: 'demo', tool: 'demo.echo', args: { userId: 'victim' } },
        });
        expect(res.status).toBe(403);
        expect(callSpy).not.toHaveBeenCalled();
      },
    );
  });

  it('lets an admin-scoped principal act on behalf of another userId', async () => {
    await withServer(
      authWith({ userId: 'admin_user', scopes: ['admin'], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/tools/demo/demo.echo/call', {
          method: 'POST',
          body: { args: { userId: 'some_tenant', query: 'x' } },
        });
        expect(res.status).toBe(200);
        expect(callSpy).toHaveBeenCalledWith(
          expect.objectContaining({ args: { userId: 'some_tenant', query: 'x' } }),
        );
      },
    );
  });

  it('IGNORES a spoofed actor.agentId: acting identity + bound caller are the principal', async () => {
    // The exact cross-tenant vector: attacker authenticates as themselves but
    // tries to bind the call to a victim via body.actor.agentId. The edge must
    // force both the gate actor and the tenant caller to `attacker`.
    await withServer(
      authWith({ userId: 'attacker', orgId: 'org_att', scopes: ['read'], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/tools/demo/demo.echo/call', {
          method: 'POST',
          body: { actor: { agentId: 'victim-user-id' }, args: { query: 'x' } },
        });
        expect(res.status).toBe(200);
        const input = callSpy.mock.lastCall?.[0] as {
          actor: { agentId: string };
          caller?: { userId: string; orgId?: string; scopes?: readonly string[] };
        };
        // agentId no longer wins — the gate is governed under the real principal.
        expect(input.actor.agentId).toBe('attacker');
        // …and the edge-bound tenant caller carries the principal's real
        // userId/orgId/scopes (never the spoofed victim id).
        expect(input.caller).toEqual({
          userId: 'attacker',
          orgId: 'org_att',
          scopes: ['read'],
        });
      },
    );
  });

  it('also ignores a spoofed actor.agentId on the body-addressed /call variant', async () => {
    await withServer(
      authWith({ userId: 'attacker', scopes: [], isAnonymous: false }),
      async (base, callSpy) => {
        const res = await request(base, '/call', {
          method: 'POST',
          body: {
            server: 'demo',
            tool: 'demo.echo',
            actor: { agentId: 'victim-user-id' },
            args: {},
          },
        });
        expect(res.status).toBe(200);
        const input = callSpy.mock.lastCall?.[0] as {
          actor: { agentId: string };
          caller?: { userId: string };
        };
        expect(input.actor.agentId).toBe('attacker');
        expect(input.caller?.userId).toBe('attacker');
      },
    );
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

// --- REAL host end-to-end: the in-proc handler governs under the principal ---

describe('governed MCP edge — in-proc caller binding through the real host (security)', () => {
  it('a spoofed actor.agentId does NOT reach the domain handler; the bound principal does', async () => {
    // Drive the WHOLE seam: real edge → real InteropHostBundle → real
    // host-registrar delegating handler. The tool captures its `caller` (the
    // subject a cloud/memory write would govern under). The request supplies a
    // spoofed `actor.agentId` and an attacker principal; the handler MUST see the
    // principal, never the spoof — the exact cross-tenant hole finding #2 covers.
    const captured: Array<{ userId: string; orgId?: string; scopes?: readonly string[] }> = [];
    const bundle = new InteropHostBundle();
    const [registration] = registerDomainToolsOnHost(
      bundle,
      [
        {
          serverId: 'cap-domain',
          tools: [
            {
              name: 'cap.who',
              description: 'capture the host-authorized caller',
              handler: async (
                _args: unknown,
                caller?: { userId: string; orgId?: string; scopes?: readonly string[] },
              ) => {
                if (caller) captured.push(caller);
                return { seenUserId: caller?.userId ?? null };
              },
            },
          ],
        },
      ],
      fakeLog,
    );
    expect(registration?.skipped).toBe(false);

    const attackerMw: RequestHandler = (req, _res, next) => {
      req.principal = {
        userId: 'attacker',
        orgId: 'org_att',
        scopes: ['read'],
        isAnonymous: false,
      } as Principal;
      next();
    };
    const mw = {
      authenticate: attackerMw,
      authenticateMutating: attackerMw,
      requireAdmin: attackerMw,
      requireInternal: attackerMw,
    } as unknown as AuthMiddleware;
    const restartEngine = vi.fn(async (): Promise<RestartOutcome> => ({ outcome: 'skipped' }));
    const { base, server } = await startServer(
      buildMcpEdgeRouter({ host: bundle, mw, log: fakeLog, restartEngine }),
    );
    try {
      const res = await request(base, '/tools/cap-domain/cap.who/call', {
        method: 'POST',
        body: { actor: { agentId: 'victim-user-id' }, args: {} },
      });
      expect(res.status).toBe(200);
      const body = res.json() as { data: { status: string; result: { content: { seenUserId: string } } } };
      expect(body.data.status).toBe('completed');
      // The handler governed under the authenticated principal, not the spoof.
      expect(body.data.result.content.seenUserId).toBe('attacker');
      expect(captured).toEqual([{ userId: 'attacker', orgId: 'org_att', scopes: ['read'] }]);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
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
