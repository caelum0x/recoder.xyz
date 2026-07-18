/**
 * `/internal/billing/meter` — the worker usage-ingest edge. Proves the
 * INTERNAL_SERVICE_KEY gate (fail-closed 503 when unconfigured, 401 without a
 * key), the happy path (records durably + returns `recorded:true`), idempotent
 * duplicate (`recorded:false`, not a failure), boundary validation (400), and the
 * degrade-safe path (metering repo down ⇒ truthful `recorded:false`, never a fake).
 *
 * Uses the REAL identity auth middleware (same harness as the identity/agent-os
 * internal-routes suites) so fail-closed behavior is genuinely exercised, over a
 * real `MeteringService` on an in-memory ledger repo.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildInternalBillingRouter } from '../routes/internal-billing.routes.js';
import { createMeteringService } from '../services/metering.service.js';
import type { MeteringRepository, UsageEventInput } from '../ports/metering-repo.port.js';
import type { UsageKind, UsageRecord } from '../types.js';
import { PrincipalService } from '../../identity/principal.service.js';
import { createAuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { AuthSessionVerifier } from '../../identity/adapters/better-auth.adapter.js';
import type { ApiKeyValidator } from '../../identity/ports/api-key.port.js';
import type { IdentityConfig } from '../../identity/config.js';

const INTERNAL_KEY = 'internal-service-key-abcdefghijklmnop';
const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

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

const stubAdapter: AuthSessionVerifier = { verifyToken: vi.fn(async () => null), extractToken: () => null };
const apiKeyValidator: ApiKeyValidator = { validate: vi.fn(async () => null) };

/** A minimal in-memory ledger repo: dedupes on idempotencyKey, tracks records. */
function memRepo(opts: { available?: boolean } = {}): MeteringRepository & { events: UsageRecord[] } {
  const events: UsageRecord[] = [];
  const keys = new Set<string>();
  return {
    events,
    isAvailable: () => opts.available ?? true,
    async recordUsage(e: UsageEventInput) {
      // Mirror the real repo's degrade-safe no-op: no pool ⇒ nothing recorded.
      if (opts.available === false) return { inserted: false };
      if (keys.has(e.idempotencyKey)) return { inserted: false };
      keys.add(e.idempotencyKey);
      events.push({
        id: e.id,
        subjectId: e.subjectId,
        kind: e.kind,
        quantity: e.quantity,
        runId: e.runId ?? null,
        engine: e.engine ?? null,
        idempotencyKey: e.idempotencyKey,
        occurredAt: e.occurredAt ?? '2026-07-15T12:00:00.000Z',
        flushedAt: null,
      });
      return { inserted: true };
    },
    async usageSince() {
      return 0;
    },
    async incrementCounter() {
      return 0;
    },
    async unflushedUsage() {
      return [];
    },
    async markFlushed() {
      return 0;
    },
    async getActiveSubscription() {
      return null;
    },
    async upsertSubscription() {},
    async listInvoices() {
      return [];
    },
    async upsertInvoice() {},
    async getCounter() {
      return null;
    },
    async upsertCounter() {},
    async recordWebhookEvent() {
      return { inserted: true };
    },
    async markWebhookProcessed() {},
    async wasWebhookProcessed() {
      return false;
    },
  };
}

/** Minimal HTTP client over `node:http` — the vitest setup mocks `global.fetch`. */
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

interface Harness {
  base: string;
  close: () => Promise<void>;
  repo: MeteringRepository & { events: UsageRecord[] };
}

function buildHarness(opts: { repoAvailable?: boolean; configOverride?: Partial<IdentityConfig> } = {}): Promise<Harness> {
  const cfg = { ...identityConfig, ...(opts.configOverride ?? {}) };
  const principal = new PrincipalService({ config: cfg, logger: silentLogger, authSession: stubAdapter, apiKeyValidator });
  const middleware = createAuthMiddleware({ verifier: principal, principal, config: cfg, logger: silentLogger });
  const repo = memRepo({ available: opts.repoAvailable ?? true });
  const metering = createMeteringService({ repo, logger: silentLogger });

  const app = express();
  app.use(express.json());
  app.use('/internal/billing', buildInternalBillingRouter({ metering, middleware }));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        repo,
      });
    });
  });
}

const withKey = { 'content-type': 'application/json', 'x-internal-service-key': INTERNAL_KEY };
const meterBody = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ subjectId: 'u1', kind: 'token' as UsageKind, quantity: 1500, ...over });

describe('POST /internal/billing/meter — auth gate', () => {
  it('rejects with 401 when no internal key is presented', async () => {
    const h = await buildHarness();
    const res = await request(h.base, '/internal/billing/meter', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: meterBody(),
    });
    expect(res.status).toBe(401);
    expect(h.repo.events).toHaveLength(0);
    await h.close();
  });

  it('rejects with 503 when the internal gate is UNCONFIGURED (fail-closed)', async () => {
    const h = await buildHarness({ configOverride: { internalServiceKey: null, internalServiceKeyPresent: false } });
    const res = await request(h.base, '/internal/billing/meter', {
      method: 'POST',
      headers: withKey,
      body: meterBody(),
    });
    expect(res.status).toBe(503);
    await h.close();
  });
});

describe('POST /internal/billing/meter — usage ingest', () => {
  it('records durably and returns recorded:true on the happy path', async () => {
    const h = await buildHarness();
    const res = await request(h.base, '/internal/billing/meter', {
      method: 'POST',
      headers: withKey,
      body: meterBody({ runId: 'run-1', engine: 'tensorzero', idempotencyKey: 'token:inf-1' }),
    });
    expect(res.status).toBe(200);
    expect((res.json() as { data: { recorded: boolean } }).data.recorded).toBe(true);
    expect(h.repo.events).toHaveLength(1);
    expect(h.repo.events[0]).toMatchObject({ subjectId: 'u1', kind: 'token', quantity: 1500, runId: 'run-1', engine: 'tensorzero' });
    await h.close();
  });

  it('is idempotent: a repeated idempotencyKey returns recorded:false (a no-op, not a failure)', async () => {
    const h = await buildHarness();
    const body = meterBody({ idempotencyKey: 'agent_run:ws-1', kind: 'agent_run', quantity: 1 });
    const first = await request(h.base, '/internal/billing/meter', { method: 'POST', headers: withKey, body });
    const second = await request(h.base, '/internal/billing/meter', { method: 'POST', headers: withKey, body });
    expect((first.json() as { data: { recorded: boolean } }).data.recorded).toBe(true);
    expect(second.status).toBe(200);
    expect((second.json() as { data: { recorded: boolean } }).data.recorded).toBe(false);
    expect(h.repo.events).toHaveLength(1);
    await h.close();
  });

  it('rejects a malformed body with 400 (boundary validation)', async () => {
    const h = await buildHarness();
    const res = await request(h.base, '/internal/billing/meter', {
      method: 'POST',
      headers: withKey,
      body: JSON.stringify({ subjectId: '', kind: 'not_a_kind' }),
    });
    expect(res.status).toBe(400);
    expect(h.repo.events).toHaveLength(0);
    await h.close();
  });

  it('degrade-safe: with the ledger repo DOWN it returns a truthful recorded:false (never a fake 200 success record)', async () => {
    const h = await buildHarness({ repoAvailable: false });
    const res = await request(h.base, '/internal/billing/meter', { method: 'POST', headers: withKey, body: meterBody() });
    // The endpoint still answers 200 (the request was well-formed + authorized),
    // but the durable write is a truthful no-op — the ledger recorded nothing.
    expect(res.status).toBe(200);
    expect((res.json() as { data: { recorded: boolean } }).data.recorded).toBe(false);
    expect(h.repo.events).toHaveLength(0);
    await h.close();
  });
});
