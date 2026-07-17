/**
 * `GET /api/agent-os/squads/board` — the squads board read model. Covers the
 * three truthful shapes: squads feature off, squads on with the autopilot not
 * enabled, and the live autopilot board (degraded seams reported, not faked).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { buildSquadBoardRouter } from '../routes/squad-board.routes.js';
import { SquadAutopilotService } from '../services/squad-autopilot.service.js';
import { SquadService, InMemorySquadStore } from '../services/squad.service.js';

const silentLogger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} } as never;

/** Pass-through auth middleware (route-shape suite; the real chain has its own tests). */
const passthrough: RequestHandler = (_req, _res, next) => next();
const middleware = {
  authenticate: passthrough,
  authenticateMutating: passthrough,
  requireAdmin: passthrough,
  requireInternal: passthrough,
  requirePermission: () => passthrough,
  verifyOrgAccess: () => passthrough,
} as AuthMiddleware;

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(router: express.Router): Promise<Harness> {
  const app = express();
  app.use('/api/agent-os', router);
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

/** Raw `http` GET (the vitest setup mocks global fetch). */
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

describe('GET /api/agent-os/squads/board', () => {
  it('reports the squads feature truthfully disabled', async () => {
    const harness = await serve(buildSquadBoardRouter({ squads: null, autopilot: null, middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads/board');
      expect(res.status).toBe(200);
      const body = res.body() as { success: boolean; data: Record<string, unknown> };
      expect(body.success).toBe(true);
      expect(body.data.enabled).toBe(false);
      expect(body.data.reason).toContain('disabled');
      expect(body.data.autopilot).toBeNull();
    } finally {
      await harness.close();
    }
  });

  it('lists squads with a truthful autopilot-not-enabled reason', async () => {
    const squads = new SquadService({ store: new InMemorySquadStore() });
    await squads.createSquad({ squadId: 'sq-1', spaceId: 'sp-1', displayName: 'Alpha', routingStrategy: 'leader' });
    const harness = await serve(buildSquadBoardRouter({ squads, autopilot: null, middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads/board');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: Record<string, unknown> }).data;
      expect(data.enabled).toBe(true);
      expect(data.autopilot).toBeNull();
      expect(data.reason).toContain('autopilot is not enabled');
      expect(data.squads).toEqual([expect.objectContaining({ squadId: 'sq-1' })]);
    } finally {
      await harness.close();
    }
  });

  it('serves the live autopilot board with truthful seam posture', async () => {
    const squads = new SquadService({ store: new InMemorySquadStore() });
    const autopilot = new SquadAutopilotService({
      logger: silentLogger,
      intervalMs: 60_000,
      maxDispatchesPerTick: 3,
    });
    await autopilot.tickOnce(); // degraded — no seams wired
    const harness = await serve(buildSquadBoardRouter({ squads, autopilot, middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads/board');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { autopilot: Record<string, unknown> } }).data;
      const board = data.autopilot;
      expect(board.running).toBe(false);
      expect(board.beads).toMatchObject({ wired: false });
      expect(board.conductor).toEqual({ wired: false });
      expect((board.lastTick as { status: string }).status).toBe('degraded');
    } finally {
      await harness.close();
    }
  });
});
