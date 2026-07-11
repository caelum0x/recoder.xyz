/**
 * retrieval.routes.ts — degrade-safe route contract tests.
 *
 * Mirrors multica.routes.test.ts: test the structural guarantees and
 * injected-logic of the factory without heavy test harness setup.
 *
 * Key assertions:
 *   - Factory produces a valid Express Router function without throwing.
 *   - The router has exactly the two expected route handlers registered.
 *   - The router mount paths are /api/retrieval/health and /api/retrieval/search.
 *   - A spy injected as authenticateRequest appears in the middleware chain for
 *     POST /api/retrieval/search (auth-gated).
 *   - GET /api/retrieval/health is NOT auth-gated (public liveness check).
 *   - createRetrievalRouter is idempotent: each call produces an independent instance.
 */
import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { createRetrievalRouter } from './retrieval.routes.js';

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

describe('retrieval.routes: factory', () => {
  it('creates a router without throwing', () => {
    const router = createRetrievalRouter({ authenticateRequest: noopAuth });
    expect(router).toBeDefined();
    expect(typeof router).toBe('function');
  });

  it('produces a new independent instance on each call', () => {
    const r1 = createRetrievalRouter({ authenticateRequest: noopAuth });
    const r2 = createRetrievalRouter({ authenticateRequest: noopAuth });
    expect(r1).not.toBe(r2);
  });
});

// ---------------------------------------------------------------------------
// Route registration assertions (structural, no HTTP)
// ---------------------------------------------------------------------------

describe('retrieval.routes: route registration', () => {
  it('registers exactly 2 routes: health and search', () => {
    const router = createRetrievalRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    expect(entries).toHaveLength(2);
  });

  it('registers GET /api/retrieval/health', () => {
    const router = createRetrievalRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const health = entries.find((e) => e.path === '/api/retrieval/health');
    expect(health).toBeDefined();
    expect(health?.methods).toContain('get');
  });

  it('registers POST /api/retrieval/search', () => {
    const router = createRetrievalRouter({ authenticateRequest: noopAuth });
    const entries = routeEntries(router);
    const search = entries.find((e) => e.path === '/api/retrieval/search');
    expect(search).toBeDefined();
    expect(search?.methods).toContain('post');
  });

  it('GET /api/retrieval/health has no auth middleware (public)', () => {
    const authSpy = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const router = createRetrievalRouter({ authenticateRequest: authSpy });
    const entries = routeEntries(router);
    const health = entries.find((e) => e.path === '/api/retrieval/health');
    // Health route: 1 handler (asyncHandler only) — no auth middleware
    expect(health?.middlewareCount).toBe(1);
  });

  it('POST /api/retrieval/search has auth middleware (auth-gated)', () => {
    const authSpy = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const router = createRetrievalRouter({ authenticateRequest: authSpy });
    const stack = routerStack(router);
    const searchLayer = stack.find(
      (l) => l.route?.path === '/api/retrieval/search',
    );
    expect(searchLayer).toBeDefined();
    // Should have at least 2 handlers: auth + asyncHandler
    expect(searchLayer?.route?.stack.length).toBeGreaterThanOrEqual(2);
    // Auth spy should be the first handler in the chain
    const firstHandle = searchLayer?.route?.stack[0]?.handle;
    expect(firstHandle).toBe(authSpy);
  });

  it('idempotent: routers with different auth spies are independent', () => {
    const spy1 = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const spy2 = vi.fn((_req: Request, _res: Response, next: NextFunction) => next());
    const r1 = createRetrievalRouter({ authenticateRequest: spy1 });
    const r2 = createRetrievalRouter({ authenticateRequest: spy2 });
    const stack1 = routerStack(r1);
    const stack2 = routerStack(r2);
    const search1 = stack1.find((l) => l.route?.path === '/api/retrieval/search');
    const search2 = stack2.find((l) => l.route?.path === '/api/retrieval/search');
    // Each router carries its own spy
    expect(search1?.route?.stack[0]?.handle).toBe(spy1);
    expect(search2?.route?.stack[0]?.handle).toBe(spy2);
  });
});
