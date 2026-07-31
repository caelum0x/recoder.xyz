/**
 * `/api/a2a` mount-order regression — proves the REAL A2A wire is reachable
 * through the EXACT bootstrap mount order. Bootstrap mounts `interop.routes()`
 * at `/api/a2a` BEFORE `interopWire.wireRoutes()` at the same base (the route
 * table sorts the known `interop` domain key ahead of the unknown
 * `interop-wire-a2a` provider), so any path the interop router claims SHADOWS
 * the wire. This suite composes both REAL modules, mounts them in that order,
 * and asserts the shadow is gone:
 *
 *   - POST /rpc `message/send` reaches the REGISTERED handler (creates a task
 *     projection readable back via `tasks/get`) — not interop's zero-method
 *     skeleton (`-32601`) nor its unwired ext-authz 503,
 *   - GET /agent-card serves the SAME card as /.well-known/agent.json (the two
 *     RFC 8615 discovery locations agree),
 *   - GET /health advertises the four wired JSON-RPC methods,
 *   - interop's own admission health stays reachable (non-colliding path),
 *   - the exposed wire stays GOVERNED: production posture denies bare JSON-RPC
 *     (fail-closed) and admits a correctly-signed envelope wrapping the call.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createPrivateKey, sign } from 'node:crypto';
import { canonicalJson } from '@recoder/a2a-sdk';
import type { RequestHandler } from 'express';
import type { AppConfig } from '../../../shared/app-config.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { createInteropModule } from '../../interop/index.js';
import { createInteropWireComposer, type InteropWireComposite } from '../interop-wire-module.js';
import type { InteropWireConfigOverrides } from '../config.js';

const SECRET = 'mount-order-secret-xyz';
const USER = 'user-1';

// --- Deterministic ed25519 peer key (RFC 8032 §7.1 test vector 1) -------------
const ED25519_SEED_HEX = '9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60';
const ED25519_PUBLIC_HEX = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';
const PEER_KEY_ID = 'peer:mount-order';

/** Build an ed25519-signed A2A envelope whose domain payload wraps `rpc`. */
function ed25519EnvelopeWrapping(rpc: unknown): Record<string, unknown> {
  const domain = {
    id: 'a2a_mount_order_ed25519',
    from: PEER_KEY_ID,
    kind: 'jsonrpc',
    payload: rpc,
    createdAt: new Date().toISOString(),
  };
  const key = createPrivateKey({
    key: Buffer.from(ED25519_PKCS8_PREFIX + ED25519_SEED_HEX, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  const signature = sign(null, Buffer.from(canonicalJson(domain), 'utf8'), key).toString('hex');
  return {
    envelope_version: '1.0.0',
    id: domain.id,
    payload_type: 'recoder.a2a.message',
    payload: domain,
    signature: {
      algorithm: 'ed25519',
      key_id: PEER_KEY_ID,
      signature,
      signed_at: new Date().toISOString(),
    },
  };
}

const silentLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => silentLogger,
} as never;

/** A complete foundational AppConfig for tests (no process.env anywhere). */
function appConfig(): AppConfig {
  return {
    runtime: { env: 'test', isProduction: false, serviceName: 'recoder-backend', instanceId: 'i1' },
    server: { port: 3001, host: '127.0.0.1', trustProxy: false, shutdownDrainMs: 8_000, bodyLimit: '2mb' },
    database: {
      url: null,
      ssl: false,
      maxPoolSize: 10,
      minPoolSize: 1,
      statementTimeoutMs: 0,
      allowSeed: false,
      migrationsDir: null,
    },
    auth: { betterAuthSecretPresent: false, authDatabaseUrl: null, cookieDomain: null, strict: false },
    internal: { serviceKeyPresent: true, serviceKey: 'k'.repeat(40) },
    cors: { origins: ['.recoder.xyz'], allowCredentials: true },
    logging: { level: 'info', pretty: false },
    conductor: {
      tmuxBin: null,
      worktreeRoot: '/tmp/recoder-worktrees',
      tmuxControlMode: false,
      caps: {
        maxConcurrentWorkspaces: 10,
        maxConcurrentPerUser: 5,
        maxTmuxSessions: 50,
        minFreeDiskGb: 5,
        maxWorktreeDiskGb: 50,
      },
    },
    agentOs: { natsUrl: null, brainEnabled: false, codeGraphEnabled: false, squadsEnabled: true },
    engines: {},
    inference: {},
    billing: {},
    cloud: {},
    memory: {},
    social: {},
    interopWire: {},
  };
}

const passthrough: RequestHandler = (_req, _res, next) => next();
const fakeAuth: AuthMiddleware = {
  authenticate: passthrough,
  authenticateMutating: passthrough,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
};

/** Dependency-free HTTP client (the vitest setup mocks `global.fetch`). */
function request(
  base: string,
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: init.method ?? 'GET', headers: init.headers ?? {} },
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
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

interface Srv {
  readonly base: string;
  readonly wire: InteropWireComposite;
  close(): Promise<void>;
}

/**
 * Compose the REAL interop module + interop-wire composer and mount them in the
 * EXACT bootstrap/route-table order at `/api/a2a` (interop FIRST, wire second),
 * plus the origin-root `/.well-known` discovery router.
 */
function startServer(wireOverrides: InteropWireConfigOverrides): Promise<Srv> {
  const config = appConfig();
  const interop = createInteropModule({
    config,
    logger: silentLogger,
    localCard: { id: config.runtime.instanceId, name: config.runtime.serviceName, capabilities: [], version: '1' },
  });
  const wire = createInteropWireComposer({
    config,
    logger: silentLogger,
    middleware: fakeAuth,
    ownerId: USER,
    overrides: wireOverrides,
  });

  const app = express();
  app.use(express.json());
  // Bootstrap order (route-table: known `interop` key sorts before the unknown
  // `interop-wire-a2a` provider): interop mounts FIRST at the shared base.
  app.use('/api/a2a', interop.routes());
  app.use('/api/a2a', wire.wireRoutes());
  app.use('/.well-known', wire.wellKnownRoutes());

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        wire,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const WIRE_CARD = { id: 'wire-instance', name: 'recoder-wire-test', capabilities: ['a2a'] };

describe('/api/a2a mount order — the REAL wire is not shadowed (dev-insecure posture)', () => {
  let srv: Srv;
  beforeAll(async () => {
    srv = await startServer({
      requireSignedIngress: false,
      allowInsecureIngress: true,
      hmacSecret: SECRET,
      localCard: WIRE_CARD,
    });
  });
  afterAll(async () => {
    await srv.close();
  });

  const postRpc = (body: unknown) =>
    request(srv.base, '/api/a2a/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('POST /rpc message/send reaches the REGISTERED handler and creates a task projection', async () => {
    const res = await postRpc({
      jsonrpc: '2.0',
      id: 1,
      method: 'message/send',
      params: { userId: USER, message: { text: 'hello wire' }, targets: ['ghost-target'] },
    });
    // Not interop's unwired ext-authz 503 and not its zero-method skeleton.
    expect(res.status).toBe(200);
    const json = res.json() as {
      success: boolean;
      data: { error?: { code: number }; result?: { taskId: string; legs: Array<{ code: string }>; ok: boolean } };
    };
    expect(json.data.error).toBeUndefined();
    expect(json.data.result?.taskId).toBeTruthy();
    // The unknown target is a truthful failed leg — the handler ran for real.
    expect(json.data.result?.legs[0]?.code).toBe('target_not_found');

    // The task projection exists: read it back through the SAME wire.
    const taskId = json.data.result!.taskId;
    const got = await postRpc({ jsonrpc: '2.0', id: 2, method: 'tasks/get', params: { id: taskId, userId: USER } });
    expect(got.status).toBe(200);
    const gotJson = got.json() as { data: { result?: { task: { id: string } } } };
    expect(gotJson.data.result?.task.id).toBe(taskId);
  });

  it('GET /agent-card serves the wire card (not the interop placeholder) and matches /.well-known/agent.json', async () => {
    const apiRes = await request(srv.base, '/api/a2a/agent-card');
    expect(apiRes.status).toBe(200);
    const apiJson = apiRes.json() as { data: { card: { id: string; capabilities: string[] } } };
    // The interop skeleton served a placeholder card (`id: 'i1'`, capabilities []).
    expect(apiJson.data.card.id).toBe(WIRE_CARD.id);
    expect(apiJson.data.card.capabilities).toEqual(WIRE_CARD.capabilities);

    // RFC 8615: the two discovery locations must agree.
    const wellKnown = await request(srv.base, '/.well-known/agent.json');
    expect(wellKnown.status).toBe(200);
    expect(apiJson.data.card).toEqual(wellKnown.json());
  });

  it('GET /health is the wire health and advertises the four wired JSON-RPC methods', async () => {
    const res = await request(srv.base, '/api/a2a/health');
    expect(res.status).toBe(200);
    const json = res.json() as { data: { health: { name: string }; methods: string[] } };
    expect(json.data.health.name).toBe('interop-wire');
    expect(json.data.methods).toEqual(
      expect.arrayContaining(['message/send', 'tasks/get', 'tasks/cancel', 'tasks/resubscribe']),
    );
  });

  it("interop's own admission health stays reachable at the non-colliding path", async () => {
    const res = await request(srv.base, '/api/a2a/admission/health');
    expect(res.status).toBe(200);
    const json = res.json() as { data: { name: string; status: string } };
    expect(json.data.name).toBe('interop');
    expect(json.data.status).toBeTruthy();
  });
});

describe('/api/a2a mount order — the exposed wire stays governed (production posture)', () => {
  let srv: Srv;
  beforeAll(async () => {
    srv = await startServer({
      requireSignedIngress: true,
      allowInsecureIngress: false,
      hmacSecret: SECRET,
      // Register the external peer's ed25519 key so its per-sender signature verifies.
      ed25519Mode: 'enforce',
      ed25519PeerKeys: { [PEER_KEY_ID]: ED25519_PUBLIC_HEX },
      localCard: WIRE_CARD,
    });
  });
  afterAll(async () => {
    await srv.close();
  });

  const postRpc = (body: unknown) =>
    request(srv.base, '/api/a2a/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

  it('bare JSON-RPC is DENIED fail-closed (never dispatched)', async () => {
    const res = await postRpc({
      jsonrpc: '2.0',
      id: 3,
      method: 'message/send',
      params: { userId: USER, message: { text: 'unsigned' }, targets: ['ghost-target'] },
    });
    expect(res.status).toBe(403);
    const json = res.json() as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('an EXTERNAL shared-HMAC envelope is REFUSED (audit #27: no shared-secret forgery on the wire)', async () => {
    // The wire edge is external/hostile-by-default: a valid shared-HMAC signature
    // must NOT admit a cross-tenant sender. Only per-sender ed25519 is accepted.
    const rpc = {
      jsonrpc: '2.0',
      id: 4,
      method: 'message/send',
      params: { userId: USER, message: { text: 'hmac hello' }, targets: ['ghost-target'] },
    };
    const envelopeService = srv.wire.core().envelope();
    const sealed = envelopeService.sealEnvelope(
      envelopeService.buildEnvelope({ from: 'peer', kind: 'jsonrpc', payload: rpc }),
    );
    const res = await postRpc(sealed);
    expect(res.status).not.toBe(200);
    const json = res.json() as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('a per-sender ed25519 envelope wrapping the call is admitted and dispatched', async () => {
    const rpc = {
      jsonrpc: '2.0',
      id: 5,
      method: 'message/send',
      params: { userId: USER, message: { text: 'ed25519 hello' }, targets: ['ghost-target'] },
    };
    const res = await postRpc(ed25519EnvelopeWrapping(rpc));
    expect(res.status).toBe(200);
    const json = res.json() as { data: { error?: unknown; result?: { taskId: string } } };
    expect(json.data.error).toBeUndefined();
    expect(json.data.result?.taskId).toBeTruthy();
  });
});
