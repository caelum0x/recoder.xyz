/**
 * Archived-history pagination (recoder-qhlo) — `GET /workspaces/archived` must
 * never ship the ever-growing full archive. Proves at the ROUTE boundary:
 *
 *  (a) absent params ⇒ the newest DEFAULT_ARCHIVED_PAGE_LIMIT rows, with the
 *      true total in the envelope `meta` and `data.workspaces` still the array
 *      the desktop board reads;
 *  (b) `?limit=`/`?offset=` slice the newest-first list correctly;
 *  (c) `limit` above MAX_ARCHIVED_PAGE_LIMIT, a non-integer, or a negative
 *      offset fail fast with the canonical VALIDATION_ERROR (400);
 *  (d) the slice happens AFTER ownership filtering, so a caller's page and
 *      total never count another tenant's rows.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { ConductorModule } from '../index.js';
import {
  buildWorkspaceQueryRoutes,
  DEFAULT_ARCHIVED_PAGE_LIMIT,
  MAX_ARCHIVED_PAGE_LIMIT,
} from './workspaces-query.routes.js';

interface ArchivedRow {
  workspaceId: string;
  createdBy: string;
  state: string;
}

function principal(userId: string, over: Partial<Principal> = {}): Principal {
  return {
    userId,
    scopes: ['read', 'write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
    ...over,
  };
}

/** Newest-first archived rows, the shape `module.listArchivedWorkspaces` returns. */
function archivedRows(count: number, createdBy = 'user_a'): ArchivedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    workspaceId: `ws_${i}`,
    createdBy,
    state: 'archived',
  }));
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  setPrincipal: (p: Principal) => void;
}

function serve(rows: ArchivedRow[], opts: { soloMode: boolean }): Promise<Harness> {
  let current: Principal = principal('user_a');
  const inject: RequestHandler = (req, _res, next) => {
    (req as unknown as { principal: Principal }).principal = current;
    next();
  };
  const middleware = { authenticate: inject } as unknown as AuthMiddleware;
  const module = {
    async listArchivedWorkspaces() {
      return rows;
    },
  } as unknown as ConductorModule;

  const app = express();
  app.use('/api/conductor', buildWorkspaceQueryRoutes({ module, middleware, soloMode: opts.soloMode }));
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        base: `http://127.0.0.1:${port}`,
        close: () => new Promise<void>((r) => server.close(() => r())),
        setPrincipal: (p) => {
          current = p;
        },
      });
    });
  });
}

interface ArchivedEnvelope {
  success?: boolean;
  data?: { workspaces?: ArchivedRow[] };
  meta?: { total?: number; limit?: number; offset?: number };
  error?: { code?: string };
}

/** Raw `node:http` GET — the global `fetch` is mocked by tests/setup.ts. */
function getArchived(base: string, query = ''): Promise<{ status: number; body: ArchivedEnvelope }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}/api/conductor/workspaces/archived${query}`);
    const req = http.request(
      { hostname: url.hostname, port: url.port, path: url.pathname + url.search, method: 'GET' },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let body: ArchivedEnvelope = {};
          try {
            body = data ? (JSON.parse(data) as ArchivedEnvelope) : {};
          } catch {
            body = {};
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('GET /workspaces/archived pagination', () => {
  it('(a) absent params return the newest default page, never the full archive', async () => {
    const h = await serve(archivedRows(DEFAULT_ARCHIVED_PAGE_LIMIT + 25), { soloMode: true });
    try {
      const { status, body } = await getArchived(h.base);
      expect(status).toBe(200);
      const list = body.data?.workspaces ?? [];
      expect(list).toHaveLength(DEFAULT_ARCHIVED_PAGE_LIMIT);
      // Newest-first input order is preserved: the page is the head of the list.
      expect(list[0]?.workspaceId).toBe('ws_0');
      expect(body.meta).toEqual({
        total: DEFAULT_ARCHIVED_PAGE_LIMIT + 25,
        limit: DEFAULT_ARCHIVED_PAGE_LIMIT,
        offset: 0,
      });
    } finally {
      await h.close();
    }
  });

  it('(b) limit/offset slice the newest-first list', async () => {
    const h = await serve(archivedRows(10), { soloMode: true });
    try {
      const { status, body } = await getArchived(h.base, '?limit=3&offset=4');
      expect(status).toBe(200);
      expect((body.data?.workspaces ?? []).map((w) => w.workspaceId)).toEqual(['ws_4', 'ws_5', 'ws_6']);
      expect(body.meta).toEqual({ total: 10, limit: 3, offset: 4 });
    } finally {
      await h.close();
    }
  });

  it('(b2) an offset past the end is a truthful empty page, not an error', async () => {
    const h = await serve(archivedRows(3), { soloMode: true });
    try {
      const { status, body } = await getArchived(h.base, '?limit=50&offset=100');
      expect(status).toBe(200);
      expect(body.data?.workspaces).toEqual([]);
      expect(body.meta?.total).toBe(3);
    } finally {
      await h.close();
    }
  });

  it('(c) out-of-bound or malformed params fail fast with VALIDATION_ERROR', async () => {
    const h = await serve(archivedRows(3), { soloMode: true });
    try {
      for (const query of [
        `?limit=${MAX_ARCHIVED_PAGE_LIMIT + 1}`,
        '?limit=0',
        '?limit=abc',
        '?offset=-1',
        '?limit=1.5',
      ]) {
        const { status, body } = await getArchived(h.base, query);
        expect(status).toBe(400);
        expect(body.error?.code).toBe('VALIDATION_ERROR');
      }
    } finally {
      await h.close();
    }
  });

  it('(d) the page slices AFTER ownership filtering (cloud): foreign rows never pad a page or the total', async () => {
    const rows = [
      { workspaceId: 'ws_b1', createdBy: 'user_b', state: 'archived' },
      { workspaceId: 'ws_a1', createdBy: 'user_a', state: 'archived' },
      { workspaceId: 'ws_b2', createdBy: 'user_b', state: 'archived' },
      { workspaceId: 'ws_a2', createdBy: 'user_a', state: 'archived' },
      { workspaceId: 'ws_a3', createdBy: 'user_a', state: 'archived' },
    ];
    const h = await serve(rows, { soloMode: false });
    try {
      h.setPrincipal(principal('user_a'));
      const { status, body } = await getArchived(h.base, '?limit=2');
      expect(status).toBe(200);
      expect((body.data?.workspaces ?? []).map((w) => w.workspaceId)).toEqual(['ws_a1', 'ws_a2']);
      expect(body.meta).toEqual({ total: 3, limit: 2, offset: 0 });
    } finally {
      await h.close();
    }
  });
});
