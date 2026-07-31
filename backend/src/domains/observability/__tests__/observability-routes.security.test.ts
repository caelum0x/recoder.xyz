/**
 * Cross-tenant IDOR guards for the observability control edges
 * (`/api/agent-os/observability/*`). Proves:
 *
 *  AUDIT (`GET /audit`) — the governance XDR ledger is tenant-owned data:
 *   (a) tenant B cannot read tenant A's rows via `?actorId=A` (403, spy untouched);
 *   (b) tenant B omitting `actorId` is FORCED to its own id (never all tenants);
 *   (c) tenant B may read its OWN rows (`?actorId=B` → 200);
 *   (d) an operator (admin scope / internal key) may name an arbitrary actor
 *       or omit it for the global ops view;
 *   (e) an anonymous caller (non-strict, non-solo) is refused (401) — the
 *       omit-all IDOR is closed;
 *   (f) SOLO/desktop mode fails OPEN — the single local owner is never locked out.
 *
 *  LOGS (`GET /logs`) — the process-global ring buffer is operator-only:
 *   (g) a plain authenticated tenant is denied (401), matching the `/metrics`
 *       gate; only an internal-service caller is served (200).
 *
 * Uses the REAL identity auth middleware over a stub session verifier + api-key
 * validator (same harness shape as `agent-os-tenant-isolation.routes.test.ts`),
 * with thin stubs for the observability services the edges close over.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildControlRoutes } from '../routes/observability.routes.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';
import type { AuditXdrProjection } from '../adapters/audit-xdr.adapter.js';
import type { LogRingBuffer } from '../adapters/pino-logger.adapter.js';
import type { ObservabilityConfig } from '../config.js';
import type { XdrQuery, XdrResult } from '../types.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';
const TOKEN_A = 'session-token-user-a-000000000000';
const TOKEN_B = 'session-token-user-b-000000000000';
const ADMIN_API_KEY = 'sk_admin_000000000000';

const SOLO_OWNER_USER_ID = 'recoder-solo-owner';

function baseConfig(soloMode: boolean): IdentityConfig {
  return {
    betterAuthSecretPresent: true,
    authDatabaseUrl: 'postgres://x',
    cookieDomain: '.recoder.xyz',
    strictAuth: false,
    internalServiceKey: INTERNAL_KEY,
    internalServiceKeyPresent: true,
    soloMode,
    isProduction: false,
    deviceCodeTtlSeconds: 900,
    devicePollIntervalSeconds: 5,
    apiKeyDefaultTtlDays: null,
    apiKeyPrefixLength: 12,
  };
}

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async (raw: string) => {
    const map: Record<string, string> = { [TOKEN_A]: 'user-A', [TOKEN_B]: 'user-B' };
    const userId = map[raw];
    if (!userId) return null;
    return {
      sessionId: `sess-${userId}`,
      userId,
      email: `${userId}@recoder.xyz`,
      emailVerified: true,
      expiresAt: new Date(Date.now() + 60_000),
    };
  }),
};

const apiKeyValidator: ApiKeyValidator = {
  validate: vi.fn(async (raw: string) =>
    raw === ADMIN_API_KEY ? { userId: 'admin-user', scopes: ['read', 'write', 'admin'] } : null,
  ),
};

const okResult: XdrResult = {
  verified: true,
  records: [],
  entries: 0,
  verifiedAt: new Date(0).toISOString(),
};

interface Harness {
  base: string;
  close: () => Promise<void>;
  auditSpy: ReturnType<typeof vi.fn>;
  logRecent: ReturnType<typeof vi.fn>;
}

function buildHarness(opts: { soloMode?: boolean } = {}): Promise<Harness> {
  const soloMode = opts.soloMode ?? false;
  const config = baseConfig(soloMode);
  const principal = new PrincipalService({
    config,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({ verifier: principal, principal, config, logger: silentLogger });

  const auditSpy = vi.fn(async (_q: XdrQuery): Promise<XdrResult> => okResult);
  const logRecent = vi.fn((_limit: number) => [{ level: 'info', msg: 'hello' }]);
  const auditXdr = { verifyAndProject: auditSpy } as unknown as AuditXdrProjection;
  const logRing = { recent: logRecent } as unknown as LogRingBuffer;

  const stub = {} as never;
  const app = express();
  app.use(express.json());
  app.use(
    '/api/agent-os/observability',
    buildControlRoutes({
      aggregator: stub,
      alerting: stub,
      workSignals: stub,
      auditXdr,
      slo: stub,
      logRing,
      engines: () => [],
      mw: middleware,
      logger: silentLogger,
      config: { defaultSpaceId: 'default' } as ObservabilityConfig,
    }),
  );

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        auditSpy,
        logRecent,
      });
    });
  });
}

function request(
  base: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET', headers },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

const asUser = (token: string) => ({ authorization: `Bearer ${token}` });
const asAdminKey = { 'x-api-key': ADMIN_API_KEY };
const asInternal = { 'x-internal-service-key': INTERNAL_KEY };

const OBS = '/api/agent-os/observability';

describe('observability /audit — cross-tenant IDOR (a) foreign actorId rejected', () => {
  it('tenant B cannot read tenant A rows via ?actorId=user-A (403, audit not queried)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit?actorId=user-A`, asUser(TOKEN_B));
    expect(res.status).toBe(403);
    expect(h.auditSpy).not.toHaveBeenCalled();
    await h.close();
  });
});

describe('observability /audit — (b) omitting actorId is pinned to the caller', () => {
  it('tenant B with no actorId is FORCED to its own id (never all tenants)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit`, asUser(TOKEN_B));
    expect(res.status).toBe(200);
    expect(h.auditSpy).toHaveBeenCalledTimes(1);
    expect(h.auditSpy.mock.calls[0][0]).toMatchObject({ actorId: 'user-B' });
    await h.close();
  });
});

describe('observability /audit — (c) own rows allowed', () => {
  it('tenant B may read its OWN rows (?actorId=user-B → 200)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit?actorId=user-B`, asUser(TOKEN_B));
    expect(res.status).toBe(200);
    expect(h.auditSpy.mock.calls[0][0]).toMatchObject({ actorId: 'user-B' });
    await h.close();
  });
});

describe('observability /audit — (d) operator bypass', () => {
  it('an admin-scoped key may name an arbitrary actorId', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit?actorId=user-A`, asAdminKey);
    expect(res.status).toBe(200);
    expect(h.auditSpy.mock.calls[0][0]).toMatchObject({ actorId: 'user-A' });
    await h.close();
  });

  it('an admin-scoped key may omit actorId for the global ops view', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit`, asAdminKey);
    expect(res.status).toBe(200);
    expect(h.auditSpy.mock.calls[0][0].actorId).toBeUndefined();
    await h.close();
  });

  it('an internal-service caller may name an arbitrary actorId', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit?actorId=user-A`, asInternal);
    expect(res.status).toBe(200);
    expect(h.auditSpy.mock.calls[0][0]).toMatchObject({ actorId: 'user-A' });
    await h.close();
  });
});

describe('observability /audit — (e) anonymous refused (omit-all IDOR closed)', () => {
  it('an anonymous caller (non-strict, non-solo) is refused 401, audit not queried', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/audit`);
    expect(res.status).toBe(401);
    expect(h.auditSpy).not.toHaveBeenCalled();
    await h.close();
  });
});

describe('observability /audit — (f) solo/desktop fails open', () => {
  it('the single local (anonymous) caller reads its own audit in solo mode (200)', async () => {
    const h = await buildHarness({ soloMode: true });
    const res = await request(h.base, `${OBS}/audit`);
    expect(res.status).toBe(200);
    expect(h.auditSpy.mock.calls[0][0]).toMatchObject({ actorId: SOLO_OWNER_USER_ID });
    await h.close();
  });
});

describe('observability /logs — (g) operator-only, matches /metrics gate', () => {
  it('a plain authenticated tenant is denied (401)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/logs`, asUser(TOKEN_B));
    expect(res.status).toBe(401);
    expect(h.logRecent).not.toHaveBeenCalled();
    await h.close();
  });

  it('an admin-scoped key (no internal key) is still denied (401)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/logs`, asAdminKey);
    expect(res.status).toBe(401);
    await h.close();
  });

  it('an internal-service caller is served (200)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, `${OBS}/logs`, asInternal);
    expect(res.status).toBe(200);
    expect(h.logRecent).toHaveBeenCalledTimes(1);
    await h.close();
  });
});
