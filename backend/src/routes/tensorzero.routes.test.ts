/**
 * tensorzero.routes.ts — degrade-safe route contract tests.
 *
 * Mirrors the daytona-sandbox.ownership.test.ts pattern: test the structural
 * guarantees and injected-logic of the factory without heavy test harness setup.
 *
 * Key assertions:
 *   - Factory produces a valid Express Router function without throwing.
 *   - The router has exactly the three expected route handlers registered.
 *   - The router mount paths are /api/gateway/health, /api/gateway/inference,
 *     /api/gateway/status — confirming route registration is not silently dropped.
 *   - A spy injected as authenticateRequest appears in the middleware chain for
 *     /api/gateway/inference and /api/gateway/status (auth-gated routes).
 *   - GET /api/gateway/health is NOT auth-gated (no spy in its middleware chain).
 *   - createTensorzeroRouter is idempotent: each call produces an independent instance.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createTensorzeroRouter } from './tensorzero.routes.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopAuth = (_req: Request, _res: Response, next: NextFunction) => next();

type ExpressLayer = {
  name?: string;
  handle?: unknown;
  regexp?: RegExp;
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: unknown; name?: string }>;
  };
};

function routerStack(router: express.Router): ExpressLayer[] {
  return (router as unknown as { stack: ExpressLayer[] }).stack ?? [];
}

function routeEntries(router: express.Router) {
  return routerStack(router)
    .filter((l) => l.route !== undefined)
    .map((l) => ({
      path: l.route!.path,
      methods: Object.keys(l.route!.methods).filter((m) => l.route!.methods[m]),
      middlewareCount: l.route!.stack.length,
    }));
}

// ---------------------------------------------------------------------------
// Factory contract tests
// ---------------------------------------------------------------------------

describe('tensorzero.routes: factory', () => {
  it('creates a router without throwing', () => {
    const router = createTensorzeroRouter({ authenticateRequest: noopAuth });
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('produces a new independent instance on each call', () => {
    const r1 = createTensorzeroRouter({ authenticateRequest: noopAuth });
    const r2 = createTensorzeroRouter({ authenticateRequest: noopAuth });
    expect(r1).not.toBe(r2);
  });
});

// ---------------------------------------------------------------------------
// Route registration assertions (structural, no HTTP)
// ---------------------------------------------------------------------------

describe('tensorzero.routes: route registration', () => {
  it('registers exactly 3 routes: health, inference, status', () => {
    const router = createTensorzeroRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    expect(entries).toHaveLength(3);
  });

  it('registers GET /api/gateway/health', () => {
    const router = createTensorzeroRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const health = entries.find((e) => e.path === '/api/gateway/health');
    expect(health).toBeDefined();
    expect(health!.methods).toContain('get');
  });

  it('registers POST /api/gateway/inference', () => {
    const router = createTensorzeroRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const inference = entries.find((e) => e.path === '/api/gateway/inference');
    expect(inference).toBeDefined();
    expect(inference!.methods).toContain('post');
  });

  it('registers GET /api/gateway/status', () => {
    const router = createTensorzeroRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const status = entries.find((e) => e.path === '/api/gateway/status');
    expect(status).toBeDefined();
    expect(status!.methods).toContain('get');
  });
});

// ---------------------------------------------------------------------------
// Auth middleware injection tests (structural, no HTTP)
//
// The router's layer stack carries the injected authenticateRequest as a named
// function. We verify it appears in the middleware chain for auth-gated routes
// but NOT on the public /health endpoint.
// ---------------------------------------------------------------------------

describe('tensorzero.routes: auth middleware injection', () => {
  it('injects authenticateRequest into /api/gateway/inference middleware chain', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createTensorzeroRouter({ authenticateRequest: spyAuth });
    const stack = routerStack(router);
    const inferenceLayer = stack.find((l) => l.route?.path === '/api/gateway/inference');
    expect(inferenceLayer).toBeDefined();

    // The route stack contains individual handler layers.
    // authenticateRequest must be one of them.
    const middlewareHandles = inferenceLayer!.route!.stack.map((s) => s.handle);
    expect(middlewareHandles).toContain(spyAuth);
  });

  it('injects authenticateRequest into /api/gateway/status middleware chain', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createTensorzeroRouter({ authenticateRequest: spyAuth });
    const stack = routerStack(router);
    const statusLayer = stack.find((l) => l.route?.path === '/api/gateway/status');
    expect(statusLayer).toBeDefined();

    const middlewareHandles = statusLayer!.route!.stack.map((s) => s.handle);
    expect(middlewareHandles).toContain(spyAuth);
  });

  it('does NOT inject authenticateRequest into the public /api/gateway/health route', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createTensorzeroRouter({ authenticateRequest: spyAuth });
    const stack = routerStack(router);
    const healthLayer = stack.find((l) => l.route?.path === '/api/gateway/health');
    expect(healthLayer).toBeDefined();

    const middlewareHandles = healthLayer!.route!.stack.map((s) => s.handle);
    // The public health route must NOT be gated by authenticateRequest.
    expect(middlewareHandles).not.toContain(spyAuth);
  });

  it('inference and status have more middleware layers than health (auth adds a layer)', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createTensorzeroRouter({ authenticateRequest: spyAuth });
    const entries = routeEntries(router);

    const health = entries.find((e) => e.path === '/api/gateway/health')!;
    const inference = entries.find((e) => e.path === '/api/gateway/inference')!;
    const status = entries.find((e) => e.path === '/api/gateway/status')!;

    // Auth-gated routes carry at least one extra middleware layer (the spy).
    expect(inference.middlewareCount).toBeGreaterThan(health.middlewareCount);
    expect(status.middlewareCount).toBeGreaterThan(health.middlewareCount);
  });
});
