/**
 * multica.routes.ts — degrade-safe route contract tests.
 *
 * Mirrors tensorzero.routes.test.ts: test the structural guarantees and
 * injected-logic of the factory without heavy test harness setup.
 *
 * Key assertions:
 *   - Factory produces a valid Express Router function without throwing.
 *   - The router has exactly the two expected route handlers registered.
 *   - The router mount paths are /api/multica/status and /api/multica/squads.
 *   - A spy injected as authenticateRequest appears in the middleware chain for
 *     both routes (all Multica routes are auth-gated).
 *   - createMulticaRouter is idempotent: each call produces an independent instance.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createMulticaRouter } from './multica.routes.js';

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

describe('multica.routes: factory', () => {
  it('creates a router without throwing', () => {
    const router = createMulticaRouter({ authenticateRequest: noopAuth });
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('produces a new independent instance on each call', () => {
    const r1 = createMulticaRouter({ authenticateRequest: noopAuth });
    const r2 = createMulticaRouter({ authenticateRequest: noopAuth });
    expect(r1).not.toBe(r2);
  });
});

// ---------------------------------------------------------------------------
// Route registration assertions (structural, no HTTP)
// ---------------------------------------------------------------------------

describe('multica.routes: route registration', () => {
  it('registers exactly 2 routes: status and squads', () => {
    const router = createMulticaRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    expect(entries).toHaveLength(2);
  });

  it('registers GET /api/multica/status', () => {
    const router = createMulticaRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const status = entries.find((e) => e.path === '/api/multica/status');
    expect(status).toBeDefined();
    expect(status!.methods).toContain('get');
  });

  it('registers GET /api/multica/squads', () => {
    const router = createMulticaRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const squads = entries.find((e) => e.path === '/api/multica/squads');
    expect(squads).toBeDefined();
    expect(squads!.methods).toContain('get');
  });
});

// ---------------------------------------------------------------------------
// Auth middleware injection tests (structural, no HTTP)
//
// All Multica routes are auth-gated (both status and squads require auth).
// ---------------------------------------------------------------------------

describe('multica.routes: auth middleware injection', () => {
  it('injects authenticateRequest into /api/multica/status middleware chain', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createMulticaRouter({ authenticateRequest: spyAuth });
    const stack = routerStack(router);
    const statusLayer = stack.find((l) => l.route?.path === '/api/multica/status');
    expect(statusLayer).toBeDefined();

    const middlewareHandles = statusLayer!.route!.stack.map((s) => s.handle);
    expect(middlewareHandles).toContain(spyAuth);
  });

  it('injects authenticateRequest into /api/multica/squads middleware chain', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createMulticaRouter({ authenticateRequest: spyAuth });
    const stack = routerStack(router);
    const squadsLayer = stack.find((l) => l.route?.path === '/api/multica/squads');
    expect(squadsLayer).toBeDefined();

    const middlewareHandles = squadsLayer!.route!.stack.map((s) => s.handle);
    expect(middlewareHandles).toContain(spyAuth);
  });

  it('both routes have at least two middleware layers (auth + handler)', () => {
    const spyAuth = vi.fn(noopAuth);
    const router = createMulticaRouter({ authenticateRequest: spyAuth });
    const entries = routeEntries(router);

    const status = entries.find((e) => e.path === '/api/multica/status')!;
    const squads = entries.find((e) => e.path === '/api/multica/squads')!;

    // Each route must have at least 2 layers: authenticateRequest + asyncHandler.
    expect(status.middlewareCount).toBeGreaterThanOrEqual(2);
    expect(squads.middlewareCount).toBeGreaterThanOrEqual(2);
  });
});
