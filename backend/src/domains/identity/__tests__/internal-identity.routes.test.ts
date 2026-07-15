import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Minimal HTTP client over the built-in `http` module. The vitest setup mocks
 * `global.fetch`, so real requests must bypass it (the a2a e2e suite uses
 * `node-fetch` for the same reason); `http.request` is dependency-free.
 */
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
import { buildInternalIdentityRouter } from '../routes/internal-identity.routes.js';
import { PrincipalService } from '../principal.service.js';
import { createAuthMiddleware } from '../middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../ports/api-key.port.js';
import type { IdentityRepository } from '../ports/identity-repo.port.js';
import type { Identity } from '../types.js';
import type { IdentityConfig } from '../config.js';
import type { IdentityModule } from '../index.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';

const config: IdentityConfig = {
  betterAuthSecretPresent: true,
  authDatabaseUrl: 'postgres://x',
  cookieDomain: '.recoder.xyz',
  strictAuth: false,
  internalServiceKey: INTERNAL_KEY,
  internalServiceKeyPresent: true,
  isProduction: false,
  deviceCodeTtlSeconds: 900,
  devicePollIntervalSeconds: 5,
  apiKeyDefaultTtlDays: null,
  apiKeyPrefixLength: 12,
};

const noopLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() } as never;

const stubAdapter: AuthSessionVerifier = {
  verifyToken: vi.fn(async () => null),
  extractToken: () => null,
};

const apiKeyValidator: ApiKeyValidator = {
  validate: vi.fn(async (raw) =>
    raw === 'sk_live_valid' ? { keyId: 'k1', userId: 'owner-1', orgId: 'org-1', scopes: ['read', 'write'] } : null,
  ),
};

const identity: Identity = {
  userId: 'user-alice',
  email: 'alice@recoder.xyz',
  name: 'Alice',
  emailVerified: true,
  legacyCliUserId: 'cli-42',
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

const repo: IdentityRepository & { isAvailable(): boolean } = {
  resolveIdentity: vi.fn(async (id: string) => (id === 'user-alice' || id === 'cli-42' ? identity : null)),
  findUserById: vi.fn(async (id: string) => (id === 'user-alice' ? identity : null)),
  resolveCliUser: vi.fn(async (id: string) => (id === 'cli-42' ? identity : null)),
  linkLegacyUser: vi.fn(async (auth: string) => (auth === 'user-alice' ? identity : null)),
  isAvailable: () => true,
};

function buildModule(overrides?: { configOverride?: Partial<IdentityConfig>; repo?: unknown }): IdentityModule {
  const cfg = { ...config, ...(overrides?.configOverride ?? {}) };
  const principalSvc = new PrincipalService({ config: cfg, logger: noopLogger, authSession: stubAdapter, apiKeyValidator });
  const middleware = createAuthMiddleware({ verifier: principalSvc, principal: principalSvc, config: cfg, logger: noopLogger });
  return {
    middleware: () => middleware,
    verifier: () => principalSvc,
    identityRepository: () => (overrides && 'repo' in overrides ? (overrides.repo as IdentityRepository | undefined) : repo),
  } as unknown as IdentityModule;
}

function startServer(module: IdentityModule): Promise<{ base: string; close: () => Promise<void> }> {
  const app = express();
  app.use(express.json());
  app.use('/internal/identity', buildInternalIdentityRouter(module));
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

describe('internal-identity routes — INTERNAL_SERVICE_KEY gate', () => {
  let srv: { base: string; close: () => Promise<void> };
  beforeAll(async () => {
    srv = await startServer(buildModule());
  });
  afterAll(async () => {
    await srv.close();
  });

  const MOUNT = '/internal/identity';
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    request(srv.base, MOUNT + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  it('rejects a request with no internal key (401)', async () => {
    const res = await post('/resolve', {});
    expect(res.status).toBe(401);
  });

  it('rejects a request with a wrong internal key (401)', async () => {
    const res = await post('/resolve', {}, { 'x-internal-service-key': 'nope' });
    expect(res.status).toBe(401);
  });

  it('resolve: valid key + sk_ apiKey → apikey principal', async () => {
    const res = await post('/resolve', { apiKey: 'sk_live_valid' }, { 'x-internal-service-key': INTERNAL_KEY });
    expect(res.status).toBe(200);
    const json = res.json() as { data: { authenticated: boolean; principal: { kind: string; userId: string } } };
    expect(json.data.authenticated).toBe(true);
    expect(json.data.principal.kind).toBe('apikey');
    expect(json.data.principal.userId).toBe('owner-1');
  });

  it('resolve: valid key + unresolvable credential → authenticated:false', async () => {
    const res = await post('/resolve', { apiKey: 'sk_live_unknown' }, { 'x-internal-service-key': INTERNAL_KEY });
    expect(res.status).toBe(200);
    const json = res.json() as { data: { authenticated: boolean; principal: unknown } };
    expect(json.data.authenticated).toBe(false);
    expect(json.data.principal).toBeNull();
  });

  it('validate-key: valid sk_ key → valid true with owner + scopes', async () => {
    const res = await post('/validate-key', { apiKey: 'sk_live_valid' }, { 'x-internal-service-key': INTERNAL_KEY });
    const json = res.json() as { data: { valid: boolean; userId: string; scopes: string[] } };
    expect(json.data.valid).toBe(true);
    expect(json.data.userId).toBe('owner-1');
    expect(json.data.scopes).toContain('write');
  });

  it('validate-key: non-sk_ input → 400', async () => {
    const res = await post('/validate-key', { apiKey: 'not-a-key' }, { 'x-internal-service-key': INTERNAL_KEY });
    expect(res.status).toBe(400);
  });

  it('user/:id: resolves the unified identity (web id)', async () => {
    const res = await request(srv.base, '/internal/identity/user/user-alice', { headers: { 'x-internal-service-key': INTERNAL_KEY } });
    const json = res.json() as { data: { identity: Identity } };
    expect(res.status).toBe(200);
    expect(json.data.identity.userId).toBe('user-alice');
    expect(json.data.identity.legacyCliUserId).toBe('cli-42');
  });

  it('link: binds a legacy id to a canonical user', async () => {
    const res = await post(
      '/link',
      { authUserId: 'user-alice', legacyUsersId: 'cli-42' },
      { 'x-internal-service-key': INTERNAL_KEY },
    );
    const json = res.json() as { data: { linked: boolean; identity: Identity } };
    expect(json.data.linked).toBe(true);
    expect(json.data.identity.userId).toBe('user-alice');
  });

  it('fails closed with 503 when the internal gate is not configured', async () => {
    const srv2 = await startServer(buildModule({ configOverride: { internalServiceKeyPresent: false, internalServiceKey: null } }));
    const res = await request(srv2.base, '/internal/identity/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-service-key': INTERNAL_KEY },
      body: '{}',
    });
    expect(res.status).toBe(503);
    await srv2.close();
  });

  it('reports 503 when identity unification is unavailable', async () => {
    const srv3 = await startServer(buildModule({ repo: undefined }));
    const res = await request(srv3.base, '/internal/identity/user/user-alice', { headers: { 'x-internal-service-key': INTERNAL_KEY } });
    expect(res.status).toBe(503);
    await srv3.close();
  });
});
