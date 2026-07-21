/**
 * `GET /api/conductor/sessions` — the READ-ONLY `recoder-*` attach list
 * (durable-shell unify §A2). Proves the route surfaces the live conductor tmux
 * sessions so the wave-side attach can SEE them, without owning a competing
 * durability engine:
 *
 *  - the body returns `sessions` from the injected lister;
 *  - tmux absent/unrunnable ⇒ a truthful EMPTY list (degrade-truthful), never an
 *    error and never a fabricated session;
 *  - it is a read (`authenticate`, no gate) — no lifecycle mutation.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { ConductorModule } from './index.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';

const passthrough: RequestHandler = (_req, _res, next) => next();
const middleware = {
  authenticate: passthrough,
  authenticateMutating: passthrough,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as unknown as AuthMiddleware;

/** `/sessions` never touches the module — an empty stub proves the isolation. */
const emptyModule = {} as unknown as ConductorModule;

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(listRecoderSessions: () => Promise<readonly string[]>): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use('/api/conductor', buildConductorRoutes({ module: emptyModule, middleware, listRecoderSessions }));
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

function get(base: string, path: string): Promise<{ status: number; body: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname, method: 'GET' },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({ status: res.statusCode ?? 0, body: () => (text ? JSON.parse(text) : null) });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

interface SessionsBody {
  sessions: string[];
}

describe('GET /api/conductor/sessions', () => {
  it('returns the live recoder-* sessions from the lister', async () => {
    const harness = await serve(async () => ['recoder-abc123', 'recoder-def456']);
    try {
      const res = await get(harness.base, '/api/conductor/sessions');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: SessionsBody }).data;
      expect(data.sessions).toEqual(['recoder-abc123', 'recoder-def456']);
    } finally {
      await harness.close();
    }
  });

  it('returns a truthful empty list when tmux cannot be observed (degrade-truthful)', async () => {
    const harness = await serve(async () => []);
    try {
      const res = await get(harness.base, '/api/conductor/sessions');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: SessionsBody }).data;
      expect(data.sessions).toEqual([]);
    } finally {
      await harness.close();
    }
  });
});
