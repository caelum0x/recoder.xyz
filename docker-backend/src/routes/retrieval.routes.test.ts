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
import { describe, it, expect, vi, afterEach } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Request, Response, NextFunction } from 'express';
import { createRetrievalRouter } from './retrieval.routes.js';
import type { RetrievalSearchEngine } from './retrieval.routes.js';

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

// ---------------------------------------------------------------------------
// rag → retrieval consolidation seam (opt-in @recoder/retrieval engine path)
// ---------------------------------------------------------------------------

/**
 * Post JSON to a freshly-mounted router over an ephemeral HTTP server, using
 * node:http (the vitest setup globally mocks global.fetch, so real fetch is
 * unavailable here — node:http exercises the true Express routing end-to-end).
 */
async function postSearch(
  deps: Parameters<typeof createRetrievalRouter>[0],
  body: unknown,
): Promise<{ status: number; json: any }> {
  const app = express();
  app.use(express.json());
  app.use(createRetrievalRouter(deps));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  try {
    const { port } = server.address() as AddressInfo;
    const payload = JSON.stringify(body);
    return await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/api/retrieval/search',
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
          },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            resolve({ status: res.statusCode ?? 0, json: raw ? JSON.parse(raw) : null });
          });
        },
      );
      req.on('error', reject);
      req.end(payload);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

/** A fake @recoder/retrieval engine (records calls, returns a canned result). */
function fakeEngine(
  result: Awaited<ReturnType<RetrievalSearchEngine['search']>> | Error,
): RetrievalSearchEngine & { calls: Array<{ query: string; topK?: number }> } {
  const calls: Array<{ query: string; topK?: number }> = [];
  return {
    calls,
    async search(query, topK) {
      calls.push({ query, topK });
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('retrieval.routes: consolidation seam', () => {
  const prevFlag = process.env['RECODER_RETRIEVAL_ENGINE'];

  afterEach(() => {
    if (prevFlag === undefined) delete process.env['RECODER_RETRIEVAL_ENGINE'];
    else process.env['RECODER_RETRIEVAL_ENGINE'] = prevFlag;
  });

  it('serves engine results when RECODER_RETRIEVAL_ENGINE=qdrant + engine injected', async () => {
    process.env['RECODER_RETRIEVAL_ENGINE'] = 'qdrant';
    const engine = fakeEngine({
      status: 'ok',
      passages: [
        { id: 'a', text: 'hit one', score: 0.9, source: 'a.md', docId: 'd1' },
        { id: 'b', text: 'hit two', score: 0.8, docId: 'd2' },
      ],
    });
    const { status, json } = await postSearch(
      { authenticateRequest: noopAuth, retrievalEngine: engine },
      { query: 'find it', limit: 5 },
    );
    expect(status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.engine).toBe('recoder-retrieval');
    expect(json.data.results).toHaveLength(2);
    expect(json.data.results[0]).toMatchObject({ rank: 1, text: 'hit one', score: 0.9 });
    expect(engine.calls).toEqual([{ query: 'find it', topK: 5 }]);
  });

  it('returns 503 truthfully when the engine reports not_configured', async () => {
    process.env['RECODER_RETRIEVAL_ENGINE'] = 'qdrant';
    const engine = fakeEngine({
      status: 'not_configured',
      passages: [],
      reason: 'retrieval not configured (no embedder and/or vector store available)',
    });
    const { status, json } = await postSearch(
      { authenticateRequest: noopAuth, retrievalEngine: engine },
      { query: 'q' },
    );
    expect(status).toBe(503);
    expect(json.success).toBe(false);
    expect(json.error.message).toContain('not configured');
  });

  it('degrades to 503 (never throws / fakes) when the engine throws', async () => {
    process.env['RECODER_RETRIEVAL_ENGINE'] = 'qdrant';
    const engine = fakeEngine(new Error('boom'));
    const { status, json } = await postSearch(
      { authenticateRequest: noopAuth, retrievalEngine: engine },
      { query: 'q' },
    );
    expect(status).toBe(503);
    expect(json.success).toBe(false);
  });

  it('flag OFF: injected engine is ignored, legacy path runs (503, no engine call)', async () => {
    delete process.env['RECODER_RETRIEVAL_ENGINE'];
    const engine = fakeEngine({ status: 'ok', passages: [] });
    const { status, json } = await postSearch(
      { authenticateRequest: noopAuth, retrievalEngine: engine },
      { query: 'q' },
    );
    // Legacy env-gated path: no COLBERT_RERANK_URL / LANCE_DB_PATH in test env.
    expect(status).toBe(503);
    expect(json.data?.engine).toBeUndefined();
    expect(engine.calls).toHaveLength(0);
  });

  it('flag ON but no engine injected: falls through to legacy path', async () => {
    process.env['RECODER_RETRIEVAL_ENGINE'] = 'qdrant';
    const { status, json } = await postSearch(
      { authenticateRequest: noopAuth },
      { query: 'q' },
    );
    expect(status).toBe(503);
    expect(json.data?.engine).toBeUndefined();
  });

  it('still validates: empty query is 400 even on the engine path', async () => {
    process.env['RECODER_RETRIEVAL_ENGINE'] = 'qdrant';
    const engine = fakeEngine({ status: 'ok', passages: [] });
    const { status } = await postSearch(
      { authenticateRequest: noopAuth, retrievalEngine: engine },
      { query: '   ' },
    );
    expect(status).toBe(400);
    expect(engine.calls).toHaveLength(0);
  });
});
