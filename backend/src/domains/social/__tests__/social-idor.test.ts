/**
 * Social cross-tenant IDOR regression suite — proves the `/api/social` mutating
 * edges are OWNER-SCOPED so one tenant can never act on another tenant's chat:
 *
 *   1. POST /bindings — binding HIJACK guard: tenant B cannot overwrite tenant A's
 *      existing (connector, chat) binding (the DB conflict key is GLOBAL, excluding
 *      user_id). The route pre-checks ownership BEFORE the upsert and 404s a
 *      non-owner. The owner may update their own; admin/internal + solo bypass.
 *   2. POST /send — ownership binding guard: a caller may only send into a
 *      conversation they OWN a binding for. An unowned/unbound chat is 403 and the
 *      connector is never touched. Admin/internal bypass; RECODER_SOLO_MODE (the
 *      synthetic solo owner) fails open so the single local desktop user can send.
 *
 * The repository under test is the REAL `createSocialRepository` in its in-memory
 * (degrade-safe) mode — its upsert has the same global-key overwrite the durable
 * path does, so the fix must live in the route (as it does).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildSocialRoutes } from '../routes/social.routes.js';
import { createSocialRepository } from '../adapters/social-repository.adapter.js';
import type { SocialRepository } from '../ports/social-repository.port.js';
import type { ConnectorSecretsPort } from '../ports/connector-secrets.port.js';
import type { ChannelAdapterRegistry } from '../adapters/channel-adapter-registry.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import { SOLO_OWNER_USER_ID } from '../../identity/principal.service.js';
import type { QueryExecutor } from '../../persistence/ports/query-executor.port.js';
import type { SocialConfig, ChannelConfig } from '../config.js';
import { CHANNEL_IDS, type ChannelId } from '../types.js';

// --- fixtures --------------------------------------------------------------

function testConfig(overrides: Partial<Record<ChannelId, ChannelConfig>> = {}): SocialConfig {
  const channels = {} as Record<ChannelId, ChannelConfig>;
  for (const id of CHANNEL_IDS) channels[id] = overrides[id] ?? { enabled: false, secretRef: null };
  return {
    isProduction: false,
    channels,
    requireMention: true,
    allowlist: [],
    ingressSecret: null,
    zrok: { enabled: false, shareName: null },
  };
}

/** A never-durable executor → the repository serves from its in-process store. */
const memExecutor: QueryExecutor = {
  execute: async () => [],
  one: async () => null,
  read: async () => [],
  mutate: async () => 0,
  withTransaction: async (fn) => fn(memExecutor),
  isAvailable: () => false,
};

function principalOf(userId: string, extra: Partial<Principal> = {}): Principal {
  return { userId, scopes: [], kind: 'session', isAnonymous: false, raw: null, ...extra } as Principal;
}

const OWNER_A = principalOf('user-a');
const OWNER_B = principalOf('user-b');
const ADMIN = principalOf('admin-user', { scopes: ['admin'] });
const INTERNAL = principalOf('internal-service', { kind: 'internal', scopes: ['internal', 'admin'] });
const SOLO = principalOf(SOLO_OWNER_USER_ID);

/** The principal the pass-through auth middleware attaches (swapped per request). */
let currentPrincipal: Principal = OWNER_A;
const passAuth: RequestHandler = (req, _res, next) => {
  req.principal = currentPrincipal;
  next();
};
const fakeMiddleware = { authenticate: passAuth, authenticateMutating: passAuth } as unknown as AuthMiddleware;

const sendSpy = vi.fn(async () => ({ delivered: true, messageIds: ['m1'] }));
const fakeChannels = {
  statuses: vi.fn(async () => []),
  get: vi.fn(async () => null),
  send: sendSpy,
} as unknown as ChannelAdapterRegistry;

const fakeSecrets: ConnectorSecretsPort = { resolve: async () => 'secret' };

// --- HTTP harness ----------------------------------------------------------

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

function startServer(repository: SocialRepository): Promise<{ base: string; close: () => Promise<void> }> {
  const router = buildSocialRoutes({
    config: testConfig({ line: { enabled: true, secretRef: 'vault:line' } }),
    repository,
    secrets: fakeSecrets,
    channels: fakeChannels,
    middleware: fakeMiddleware,
    health: async () => ({ status: 'degraded' }),
    onVerifiedWebhook: vi.fn(async () => undefined),
  });
  const app = express();
  app.use('/api/social', express.json());
  app.use('/api/social', router);
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
      });
    });
  });
}

const jsonHeaders = { 'content-type': 'application/json' };
const bind = (base: string, body: unknown) =>
  request(base, '/api/social/bindings', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });
const send = (base: string, body: unknown) =>
  request(base, '/api/social/send', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(body) });

// --- suite -----------------------------------------------------------------

describe('social cross-tenant IDOR guards', () => {
  let repo: SocialRepository;
  let srv: { base: string; close: () => Promise<void> };

  beforeEach(async () => {
    // Fresh repository (fresh in-memory store) per test — no cross-test bleed.
    repo = createSocialRepository({ executor: memExecutor });
    srv = await startServer(repo);
    currentPrincipal = OWNER_A;
    sendSpy.mockClear();
  });

  // Each test closes its own server (beforeEach opens a new one).
  const withClose = (fn: () => Promise<void>) => async () => {
    try {
      await fn();
    } finally {
      await srv.close();
    }
  };

  // === Fix 1: POST /bindings hijack guard ===================================

  it(
    'tenant B CANNOT overwrite tenant A\'s existing binding (404, A untouched)',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      const a = await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true });
      expect(a.status).toBe(201);

      currentPrincipal = OWNER_B;
      const b = await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: false, spaceId: 'space-b' });
      expect(b.status).toBe(404);

      // A's binding is unchanged: still owned by A, still allow:true, no space-b.
      const existing = await repo.getBinding('line', 'C1');
      expect(existing?.userId).toBe('user-a');
      expect(existing?.allow).toBe(true);
      expect(existing?.spaceId).toBeUndefined();
    }),
  );

  it(
    'owner CAN update their own binding',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      expect((await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true })).status).toBe(201);
      const upd = await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: false });
      expect(upd.status).toBe(201);
      expect((await repo.getBinding('line', 'C1'))?.allow).toBe(false);
    }),
  );

  it(
    'admin CAN overwrite any binding (bypass)',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true });
      currentPrincipal = ADMIN;
      const res = await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: false });
      expect(res.status).toBe(201);
    }),
  );

  it(
    'solo owner CAN overwrite any binding (RECODER_SOLO_MODE fail-open)',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true });
      currentPrincipal = SOLO;
      const res = await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: false });
      expect(res.status).toBe(201);
    }),
  );

  // === Fix 2: POST /send ownership guard ====================================

  it(
    'tenant B CANNOT send into tenant A\'s bound channel (403, connector untouched)',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true });

      currentPrincipal = OWNER_B;
      const res = await send(srv.base, { channel: 'line', chatRef: 'C1', text: 'hijack' });
      expect(res.status).toBe(403);
      expect(sendSpy).not.toHaveBeenCalled();
    }),
  );

  it(
    'sending into an UNBOUND chat is rejected (403, connector untouched)',
    withClose(async () => {
      currentPrincipal = OWNER_B;
      const res = await send(srv.base, { channel: 'line', chatRef: 'nope', text: 'hi' });
      expect(res.status).toBe(403);
      expect(sendSpy).not.toHaveBeenCalled();
    }),
  );

  it(
    'owner CAN send into their own bound channel',
    withClose(async () => {
      currentPrincipal = OWNER_A;
      await bind(srv.base, { connectorId: 'line', chatRef: 'C1', allow: true });
      const res = await send(srv.base, { channel: 'line', chatRef: 'C1', text: 'hello' });
      expect(res.status).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    }),
  );

  it(
    'admin CAN send into any chat without a binding (bypass)',
    withClose(async () => {
      currentPrincipal = ADMIN;
      const res = await send(srv.base, { channel: 'line', chatRef: 'anything', text: 'ops' });
      expect(res.status).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    }),
  );

  it(
    'internal service CAN send into any chat without a binding (bypass)',
    withClose(async () => {
      currentPrincipal = INTERNAL;
      const res = await send(srv.base, { channel: 'line', chatRef: 'anything', text: 'ops' });
      expect(res.status).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    }),
  );

  it(
    'solo owner CAN send into an unbound chat (RECODER_SOLO_MODE fail-open)',
    withClose(async () => {
      currentPrincipal = SOLO;
      const res = await send(srv.base, { channel: 'line', chatRef: 'unbound', text: 'local' });
      expect(res.status).toBe(200);
      expect(sendSpy).toHaveBeenCalledTimes(1);
    }),
  );
});
