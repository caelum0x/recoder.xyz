/**
 * `/internal/persistence/*` edge auth tests. These routes disclose the full DB
 * schema and can trigger control-plane migrations, so they MUST be fail-closed
 * behind `requireInternal` (constant-time `INTERNAL_SERVICE_KEY` gate) — exactly
 * like every sibling internal router. The edge domain's global guard convention
 * is overridden to public (bootstrap), so this router must self-gate.
 *
 * Uses the REAL identity auth middleware over a stub verifier so the gate is
 * exercised end-to-end:
 *  - no/invalid `x-internal-service-key` → 401 (fail-closed); NO schema/migration
 *    method is ever reached (no disclosure oracle, no side effect);
 *  - a valid key → the handler runs.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerPersistenceRoutes } from './persistence.routes.js';
import type { PersistenceModule } from '../index.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';

const identityConfig: IdentityConfig = {
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

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const stubAdapter: AuthSessionVerifier = {
  extractToken: ({ bearerToken }) => bearerToken ?? null,
  verifyToken: vi.fn(async () => null),
};
const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

interface Harness {
  base: string;
  close: () => Promise<void>;
  inspectTables: ReturnType<typeof vi.fn>;
  migrate: ReturnType<typeof vi.fn>;
}

function buildHarness(): Promise<Harness> {
  const inspectTables = vi.fn(async () => [{ schema: 'public', name: 'secret_table' }]);
  const migrate = vi.fn(async () => ({ ok: true, applied: [] }));
  const module = {
    name: 'persistence',
    executor: () => ({ isAvailable: () => true }),
    schema: () => ({
      inspectTables,
      inspectColumns: vi.fn(async () => []),
      inspectIndexes: vi.fn(async () => []),
    }),
    migrations: () => ({ status: vi.fn(async () => ({ applied: [], pending: [] })) }),
    migrate,
    health: vi.fn(async () => ({ status: 'ok' })),
  } as unknown as PersistenceModule;

  const principal = new PrincipalService({
    config: identityConfig,
    logger: silentLogger,
    authSession: stubAdapter,
    apiKeyValidator,
  });
  const middleware = createAuthMiddleware({ verifier: principal, principal, config: identityConfig, logger: silentLogger });

  const app = express();
  app.use(express.json());
  app.use('/internal/persistence', registerPersistenceRoutes(module, middleware.requireInternal));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        inspectTables,
        migrate,
      });
    });
  });
}

function request(
  base: string,
  path: string,
  init: { method?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/internal/persistence${path}`);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('/internal/persistence/* auth gate', () => {
  it('rejects introspection without the internal key and never touches the schema (no disclosure)', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/introspect');
      expect(res.status).toBe(401);
      expect(h.inspectTables).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('rejects migrate without the internal key and never triggers a migration', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/migrate', { method: 'POST' });
      expect(res.status).toBe(401);
      expect(h.migrate).not.toHaveBeenCalled();
    } finally {
      await h.close();
    }
  });

  it('allows introspection with a valid internal key', async () => {
    const h = await buildHarness();
    try {
      const res = await request(h.base, '/introspect', {
        headers: { 'x-internal-service-key': INTERNAL_KEY },
      });
      expect(res.status).toBe(200);
      expect(h.inspectTables).toHaveBeenCalledOnce();
    } finally {
      await h.close();
    }
  });
});
