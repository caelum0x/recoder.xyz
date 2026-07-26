/**
 * `GET /api/agent-os/issues/ready` — the desktop Board's pickup queue. Covers the
 * truthful shapes: an attached issue graph returns `{ ready: [...] }`; an
 * unattached / down graph returns `{ ready: [] }` (200, NEVER a 404 or a
 * squads-off tombstone); a throwing seam degrades to a truthful 503.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import { buildIssuesReadRouter } from '../routes/issues-read.routes.js';
import type { SquadReadyIssue } from '../ports/squad-issue.port.js';

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

function serve(readyIssues: () => Promise<readonly SquadReadyIssue[]>): Promise<Harness> {
  const app = express();
  app.use('/api/agent-os', buildIssuesReadRouter({ readyIssues, middleware }));
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

describe('GET /api/agent-os/issues/ready (Board pickup queue)', () => {
  it('returns the attached graph ready-list', async () => {
    const issues: readonly SquadReadyIssue[] = [
      { id: 'bd-1', title: 'wire the board', description: 'the last dead surface' },
      { id: 'bd-2', title: 'ship it' },
    ];
    const harness = await serve(async () => issues);
    try {
      const res = await get(harness.base, '/api/agent-os/issues/ready');
      expect(res.status).toBe(200);
      const data = (res.body() as { data: { ready: SquadReadyIssue[] } }).data;
      expect(data.ready).toHaveLength(2);
      expect(data.ready[0]).toEqual({ id: 'bd-1', title: 'wire the board', description: 'the last dead surface' });
    } finally {
      await harness.close();
    }
  });

  it('serves an empty list (200) when the graph is unattached/down — never a 404', async () => {
    const harness = await serve(async () => []);
    try {
      const res = await get(harness.base, '/api/agent-os/issues/ready');
      expect(res.status).toBe(200);
      expect((res.body() as { data: { ready: unknown[] } }).data.ready).toEqual([]);
    } finally {
      await harness.close();
    }
  });

  it('degrades to a truthful 503 when the read throws', async () => {
    const harness = await serve(async () => {
      throw new Error('issue graph transport fault');
    });
    try {
      const res = await get(harness.base, '/api/agent-os/issues/ready');
      expect(res.status).toBe(503);
      expect((res.body() as { success: boolean }).success).toBe(false);
    } finally {
      await harness.close();
    }
  });
});
