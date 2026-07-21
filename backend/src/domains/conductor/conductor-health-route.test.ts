/**
 * `GET /api/conductor/health` — the conductor readiness summary the cockpit polls.
 * Proves the route carries the shared-tmux-server pin (durable-shell unify §A1a):
 *
 *  - the body exposes `substrate.tmuxBin` sourced from the tmux_worktree
 *    availability view (the effective pinned binary — config pin, else PATH `tmux`),
 *    so the wave-side attach can source the SAME server instead of a silent
 *    PATH-`tmux` fallback;
 *  - a missing/unknown tmux substrate yields a truthful `tmuxBin: null` (never a
 *    guessed default);
 *  - the existing `available` / `tmux` fields are unchanged (behavior-preserving).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { SubstrateAvailabilityView } from './types.js';
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

/** A stub module that only implements `substrates()` (the only method `/health` hits). */
function stubModule(substrates: readonly SubstrateAvailabilityView[]): ConductorModule {
  return {
    substrates(): readonly SubstrateAvailabilityView[] {
      return substrates;
    },
  } as unknown as ConductorModule;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(module: ConductorModule): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use('/api/conductor', buildConductorRoutes({ module, middleware }));
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

interface HealthBody {
  available: boolean;
  tmux: boolean;
  substrate: { tmuxBin: string | null };
  reason?: string;
}

describe('GET /api/conductor/health', () => {
  it('carries the effective pinned tmux binary in `substrate.tmuxBin`', async () => {
    const module = stubModule([
      { id: 'tmux_worktree', available: true, tmuxBin: '/vendored/recoder/tmux' },
      { id: 'daytona', available: false, reason: 'DAYTONA_API_KEY not configured' },
    ]);
    const harness = await serve(module);
    try {
      const res = await get(harness.base, '/api/conductor/health');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: HealthBody }).data;
      expect(data.available).toBe(true);
      expect(data.tmux).toBe(true);
      // The load-bearing new field: a real binary, not the silent PATH fallback.
      expect(data.substrate.tmuxBin).toBe('/vendored/recoder/tmux');
    } finally {
      await harness.close();
    }
  });

  it('reports the PATH-`tmux` fallback when no pin is configured', async () => {
    const module = stubModule([{ id: 'tmux_worktree', available: true, tmuxBin: 'tmux' }]);
    const harness = await serve(module);
    try {
      const res = await get(harness.base, '/api/conductor/health');
      const data = (res.body() as { data: HealthBody }).data;
      expect(data.substrate.tmuxBin).toBe('tmux');
    } finally {
      await harness.close();
    }
  });

  it('yields a truthful `tmuxBin: null` when no tmux substrate is known', async () => {
    const module = stubModule([{ id: 'daytona', available: false, reason: 'DAYTONA_API_KEY not configured' }]);
    const harness = await serve(module);
    try {
      const res = await get(harness.base, '/api/conductor/health');
      const data = (res.body() as { data: HealthBody }).data;
      // No tmux entry ⇒ never a guessed binary; the caller treats null as "unknown".
      expect(data.substrate.tmuxBin).toBeNull();
      expect(data.available).toBe(false);
      expect(data.tmux).toBe(false);
      expect(data.reason).toBeTruthy();
    } finally {
      await harness.close();
    }
  });
});
