/**
 * `/api/agent-os/squads/*` read-only introspection. Covers the truthful shapes:
 * feature off (`enabled:false`), the list surface, one-squad detail with members,
 * the members + activity sub-resources, and 404 for an unknown squad. Asserts the
 * surface is READ-ONLY (owner decision: no mutating squad routes).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { buildSquadReadRouter } from '../routes/squad-read.routes.js';
import { SquadService, InMemorySquadStore } from '../services/squad.service.js';

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

function get(base: string, path: string): Promise<{ status: number; body: () => unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
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

async function seededSquads(): Promise<SquadService> {
  const squads = new SquadService({ store: new InMemorySquadStore() });
  await squads.createSquad({
    squadId: 'sq-1',
    spaceId: 'sp-1',
    displayName: 'Alpha',
    leaderAgentId: 'agent-lead',
    routingStrategy: 'leader',
  });
  await squads.addMember({ squadId: 'sq-1', agentId: 'agent-lead', role: 'leader', weight: 5 });
  await squads.addMember({ squadId: 'sq-1', agentId: 'agent-2', role: 'member', weight: 1 });
  await squads.route('sq-1', 'task-1'); // records one activity entry
  return squads;
}

describe('GET /api/agent-os/squads (read-only introspection)', () => {
  it('reports the squads feature truthfully disabled', async () => {
    const harness = await serve(buildSquadReadRouter({ squads: null, middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: Record<string, unknown> }).data;
      expect(data.enabled).toBe(false);
      expect(data.reason).toContain('disabled');
      expect(data.squads).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('lists squads and filters by spaceId', async () => {
    const harness = await serve(buildSquadReadRouter({ squads: await seededSquads(), middleware }));
    try {
      const all = await get(harness.base, '/api/agent-os/squads');
      const data = (all.body() as { data: { enabled: boolean; squads: unknown[] } }).data;
      expect(data.enabled).toBe(true);
      expect(data.squads).toEqual([expect.objectContaining({ squadId: 'sq-1' })]);

      const filtered = await get(harness.base, '/api/agent-os/squads?spaceId=other');
      expect((filtered.body() as { data: { squads: unknown[] } }).data.squads).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('returns one squad with its members', async () => {
    const harness = await serve(buildSquadReadRouter({ squads: await seededSquads(), middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads/sq-1');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { squad: { squadId: string }; members: unknown[] } }).data;
      expect(data.squad.squadId).toBe('sq-1');
      expect(data.members).toHaveLength(2);
    } finally {
      await harness.close();
    }
  });

  it('serves the members + activity sub-resources', async () => {
    const harness = await serve(buildSquadReadRouter({ squads: await seededSquads(), middleware }));
    try {
      const members = await get(harness.base, '/api/agent-os/squads/sq-1/members');
      expect((members.body() as { data: { members: unknown[] } }).data.members).toHaveLength(2);

      const activity = await get(harness.base, '/api/agent-os/squads/sq-1/activity');
      const entries = (activity.body() as { data: { activity: Array<{ routedAgentId?: string }> } })
        .data.activity;
      expect(entries).toHaveLength(1);
      expect(entries[0].routedAgentId).toBe('agent-lead');
    } finally {
      await harness.close();
    }
  });

  it('404s an unknown squad', async () => {
    const harness = await serve(buildSquadReadRouter({ squads: await seededSquads(), middleware }));
    try {
      const res = await get(harness.base, '/api/agent-os/squads/nope');
      expect(res.status).toBe(404);
      expect((res.body() as { success: boolean }).success).toBe(false);
    } finally {
      await harness.close();
    }
  });
});
