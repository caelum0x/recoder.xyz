/**
 * Proves billing MUTATIONS route through the governance gate for policy + audit,
 * and degrade safely when the gate is not wired:
 *   - checkout `allow`  → the provider checkout runs (201) and `decide` was
 *     called with the `billing.checkout` action.
 *   - checkout `deny`   → 403 and the provider is NEVER touched (fail-safe).
 *   - checkout, no gate → proceeds ungated (201) — degrade-safe until bootstrap
 *     wires the gate.
 *   - cancel `needs_approval` → 403 and the provider cancel is NEVER called.
 *
 * The router is exercised over a real express server with a stub auth middleware
 * that injects a fixed non-anonymous principal (the gate wiring, not identity, is
 * under test here).
 */
import { describe, it, expect, vi } from 'vitest';
import express, { type RequestHandler } from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { buildBillingRouter } from '../routes/billing.routes.js';
import type { BillingRouterDeps } from '../routes/billing.routes.js';
import type { BillingWriteGate } from '../ports/governance-gate.port.js';
import type { EntitlementGate } from '../ports/entitlement.port.js';
import type { InvoiceService } from '../invoice.service.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { PlanCatalog } from '../services/plan-catalog.service.js';
import type { ProviderRegistry } from '../provider-registry.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { GateVerdict, GovernanceEffect } from '../../governance/types.js';
import type { BillingProviderPort } from '../ports/billing-provider.port.js';
import type { BillingProviderName, BillingSubscription, CheckoutResult } from '../types.js';

const silent = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

const principal: Principal = {
  userId: 'u1',
  email: 'u1@example.com',
  scopes: ['write'],
  kind: 'session',
  isAnonymous: false,
  raw: null,
};

/** A stub middleware that injects a fixed principal — identity is not under test. */
function stubMiddleware(): AuthMiddleware {
  const inject: RequestHandler = (req, _res, next) => {
    (req as { principal?: Principal }).principal = principal;
    next();
  };
  return new Proxy({} as AuthMiddleware, {
    get: () => inject,
  });
}

function verdict(effect: GovernanceEffect): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect,
    tier: 'low',
    reason: effect === 'allow' ? 'ok' : 'blocked by policy',
    degraded: false,
    engine: 'napi',
    createdAt: '2026-07-17T00:00:00.000Z',
  };
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  decide: ReturnType<typeof vi.fn>;
  createCheckout: ReturnType<typeof vi.fn>;
  cancel: ReturnType<typeof vi.fn>;
}

function buildHarness(opts: {
  gate?: BillingWriteGate | undefined;
  activeSub?: BillingSubscription | null;
  /** The active selling provider (default: the canonical Dodo). */
  activeProvider?: BillingProviderName;
}): Promise<Harness> {
  // Default to the canonical selling provider (Dodo) — the only one enabled to
  // originate a checkout under the Dodo-only policy (flipped from Creem 2026-10-15).
  const active: BillingProviderName = opts.activeProvider ?? 'dodo';
  const decide = vi.fn(async () => verdict('allow'));
  const createCheckout = vi.fn(
    async (): Promise<CheckoutResult> => ({ checkoutId: 'co_1', url: 'https://pay.example/co_1', provider: active }),
  );
  const cancel = vi.fn(async () => ({
    provider: 'polar' as const,
    providerSubId: 'sub_1',
    providerCustomerId: 'cus_1',
    status: 'canceled' as const,
    cancelAtPeriodEnd: true,
  }));

  const gate = opts.gate === null ? undefined : opts.gate ?? ({ decide } as BillingWriteGate);

  const adapter = { name: active, createCheckout, cancel } as unknown as BillingProviderPort;
  const registry: ProviderRegistry = {
    activeName: active,
    active: () => adapter,
    get: () => adapter,
    all: () => [adapter],
    health: async () => ({ name: 'billing.provider', status: 'up', degraded: false }),
  };

  const catalog = { productForPlan: () => 'prod_pro' } as unknown as PlanCatalog;
  const repo = {
    async getActiveSubscription() {
      return opts.activeSub ?? null;
    },
  } as unknown as MeteringRepository;
  const invoices = { async list() { return []; } } as unknown as InvoiceService;
  const entitlement = { async view() { return { plan: 'free' }; } } as unknown as EntitlementGate;

  const deps: BillingRouterDeps = {
    gate: entitlement,
    registry,
    catalog,
    repo,
    invoices,
    mw: stubMiddleware(),
    logger: silent,
    getGate: () => gate,
  };

  const app = express();
  app.use(express.json());
  app.use('/api/billing', buildBillingRouter(deps));

  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        decide,
        createCheckout,
        cancel,
      });
    });
  });
}

function request(
  base: string,
  path: string,
  init: { method?: string; body?: string } = {},
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(base + path);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: init.method ?? 'GET',
        headers: { 'content-type': 'application/json' },
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
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}

const checkoutBody = JSON.stringify({ plan: 'pro', successUrl: 'https://app.example/ok' });

describe('billing checkout — governance gate', () => {
  it('allows the checkout when the gate returns allow (decide called with billing.checkout)', async () => {
    const gate = { decide: vi.fn(async () => verdict('allow')) };
    const h = await buildHarness({ gate });
    const res = await request(h.base, '/api/billing/checkout', { method: 'POST', body: checkoutBody });
    expect(res.status).toBe(201);
    expect(gate.decide).toHaveBeenCalledWith('billing.checkout', expect.objectContaining({ userId: 'u1' }), expect.any(Object));
    expect(h.createCheckout).toHaveBeenCalledTimes(1);
    await h.close();
  });

  it('blocks the checkout with 403 on a deny — the provider is never touched (fail-safe)', async () => {
    const gate = { decide: vi.fn(async () => verdict('deny')) };
    const h = await buildHarness({ gate });
    const res = await request(h.base, '/api/billing/checkout', { method: 'POST', body: checkoutBody });
    expect(res.status).toBe(403);
    expect(h.createCheckout).not.toHaveBeenCalled();
    await h.close();
  });

  it('degrade-safe: proceeds ungated when no gate is wired', async () => {
    const h = await buildHarness({ gate: null });
    const res = await request(h.base, '/api/billing/checkout', { method: 'POST', body: checkoutBody });
    expect(res.status).toBe(201);
    expect(h.createCheckout).toHaveBeenCalledTimes(1);
    await h.close();
  });
});

describe('billing checkout — Dodo-only selling policy (recoder-nn4o, flipped from Creem 2026-10-15)', () => {
  it('allows a checkout when the active provider is the canonical Dodo', async () => {
    const h = await buildHarness({ activeProvider: 'dodo' });
    const res = await request(h.base, '/api/billing/checkout', { method: 'POST', body: checkoutBody });
    expect(res.status).toBe(201);
    expect(h.createCheckout).toHaveBeenCalledTimes(1);
    await h.close();
  });

  for (const inactive of ['paddle', 'creem', 'polar'] as BillingProviderName[]) {
    it(`refuses a checkout when the active provider is '${inactive}' — never fabricates a URL, provider untouched`, async () => {
      const h = await buildHarness({ activeProvider: inactive });
      const res = await request(h.base, '/api/billing/checkout', { method: 'POST', body: checkoutBody });
      // Truthful degrade: a non-Dodo selling provider is unavailable (503), and
      // the provider adapter is NEVER touched (no fabricated checkout).
      expect(res.status).toBe(503);
      expect(h.createCheckout).not.toHaveBeenCalled();
      await h.close();
    });
  }
});

describe('billing cancel — governance gate', () => {
  const activeSub: BillingSubscription = {
    id: 's1',
    subjectId: 'u1',
    subjectKind: 'user',
    plan: 'pro',
    provider: 'polar',
    providerSubId: 'sub_1',
    status: 'active',
    cancelAtPeriodEnd: false,
    updatedAt: '2026-07-01T00:00:00.000Z',
  };

  it('blocks a cancel with 403 on needs_approval — the provider cancel is never called', async () => {
    const gate = { decide: vi.fn(async () => verdict('needs_approval')) };
    const h = await buildHarness({ gate, activeSub });
    const res = await request(h.base, '/api/billing/cancel', { method: 'POST', body: JSON.stringify({}) });
    expect(res.status).toBe(403);
    expect(gate.decide).toHaveBeenCalledWith('billing.cancel', expect.objectContaining({ userId: 'u1' }), expect.any(Object));
    expect(h.cancel).not.toHaveBeenCalled();
    await h.close();
  });

  it('allows a cancel when the gate returns allow (provider cancel runs)', async () => {
    const gate = { decide: vi.fn(async () => verdict('allow')) };
    const h = await buildHarness({ gate, activeSub });
    const res = await request(h.base, '/api/billing/cancel', { method: 'POST', body: JSON.stringify({ atPeriodEnd: true }) });
    expect(res.status).toBe(200);
    expect(h.cancel).toHaveBeenCalledTimes(1);
    await h.close();
  });
});
