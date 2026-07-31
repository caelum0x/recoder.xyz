/**
 * Cross-tenant IDOR guard (recoder-tf68) — the conductor HTTP surface must not let
 * an authed caller enumerate or operate another tenant's workspace.
 *
 * Proves at the ROUTE boundary:
 *  (a) user B gets a 404 (never a 403 oracle) on user A's workspace get/diff/steer/
 *      stop/MERGE;
 *  (b) the list edges return ONLY the caller's own workspaces (base + query router);
 *  (c) the owner (user A) still has full read + write access;
 *  (d) an admin (privileged operator) principal may access any workspace;
 *  (e) solo/desktop single-user mode (`soloMode`) allows access WITHOUT an owner
 *      match (never locks the one local user out).
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../identity/types.js';
import type { ConductorModule } from './index.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';
import { buildWorkspaceQueryRoutes } from './routes/workspaces-query.routes.js';
import {
  canAccessWorkspace,
  filterAccessibleWorkspaces,
  isPrivilegedPrincipal,
} from './routes/workspace-access.js';

const allowVerdict = {
  effect: 'allow',
  tier: 'low',
  degraded: false,
  engine: 'test',
} as const;

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

interface WorkspaceRow {
  workspaceId: string;
  createdBy: string;
  state: string;
}

/** A minimal in-memory conductor module: an owner-tagged workspace map + the edges the test drives. */
function makeModule(rows: WorkspaceRow[]): {
  module: ConductorModule;
  steered: string[];
  stopped: string[];
  merged: string[];
} {
  const byId = new Map(rows.map((r) => [r.workspaceId, r]));
  const steered: string[] = [];
  const stopped: string[] = [];
  const merged: string[] = [];
  const module = {
    async getWorkspace(id: string) {
      return byId.get(id) ?? null;
    },
    async listWorkspaces() {
      return [...byId.values()];
    },
    async queryWorkspaces() {
      return [...byId.values()];
    },
    async listArchivedWorkspaces() {
      return [];
    },
    async workspaceDiff(id: string) {
      if (!byId.has(id)) throw new Error('workspace not found');
      return { stat: '', patch: '', changedFiles: 0 };
    },
    async steerWorkspace(input: { workspaceId: string }) {
      steered.push(input.workspaceId);
      return { ok: true, verdict: allowVerdict, value: undefined };
    },
    async stopWorkspace(id: string) {
      stopped.push(id);
      return { ok: true, verdict: allowVerdict, value: byId.get(id) };
    },
    async mergeWorkspace(id: string) {
      merged.push(id);
      return { ok: true, verdict: allowVerdict, value: { merged: true } };
    },
  } as unknown as ConductorModule;
  return { module, steered, stopped, merged };
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  setPrincipal: (p: Principal) => void;
}

function serve(module: ConductorModule, opts: { soloMode: boolean }): Promise<Harness> {
  let current: Principal = principal('user_a');
  const inject: RequestHandler = (req, _res, next) => {
    (req as unknown as { principal: Principal }).principal = current;
    next();
  };
  const middleware = {
    authenticate: inject,
    authenticateMutating: inject,
    requireAdmin: inject,
    requireInternal: inject,
    requirePermission: () => inject,
    verifyOrgAccess: () => inject,
  } as unknown as AuthMiddleware;

  const app = express();
  app.use(express.json());
  // Query router first (shadows the base list), matching the module's mount order.
  app.use('/api/conductor', buildWorkspaceQueryRoutes({ module, middleware, soloMode: opts.soloMode }));
  app.use('/api/conductor', buildConductorRoutes({ module, middleware, soloMode: opts.soloMode }));
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

function request(
  base: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${path}`);
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method,
        headers: {
          'content-type': 'application/json',
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => {
          data += c;
        });
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = data ? JSON.parse(data) : null;
          } catch {
            json = data;
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const ROWS: WorkspaceRow[] = [
  { workspaceId: 'ws_a', createdBy: 'user_a', state: 'running' },
  { workspaceId: 'ws_b', createdBy: 'user_b', state: 'running' },
];

describe('workspace-access predicate', () => {
  const cloud = { soloMode: false };
  it('grants the creator, denies a different user', () => {
    const ws = { createdBy: 'user_a' };
    expect(canAccessWorkspace(principal('user_a'), ws, cloud)).toBe(true);
    expect(canAccessWorkspace(principal('user_b'), ws, cloud)).toBe(false);
  });
  it('grants a co-tenant in the same org (tenant scoping), denies a different org', () => {
    const ws = { createdBy: 'user_a', tenant: { orgId: 'org_1' } };
    expect(canAccessWorkspace(principal('user_b', { orgId: 'org_1' }), ws, cloud)).toBe(true);
    expect(canAccessWorkspace(principal('user_b', { orgId: 'org_2' }), ws, cloud)).toBe(false);
  });
  it('grants privileged (admin/internal) principals, denies plain scopes', () => {
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['admin'] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['internal'] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { kind: 'internal', scopes: [] }))).toBe(true);
    expect(isPrivilegedPrincipal(principal('u', { scopes: ['read', 'write'] }))).toBe(false);
  });
  it('never grants the anonymous fallback by ownership (non-solo)', () => {
    const anon = principal('anonymous', { kind: 'anonymous', isAnonymous: true, scopes: [] });
    expect(canAccessWorkspace(anon, { createdBy: 'anonymous' }, cloud)).toBe(false);
  });
  it('fails OPEN in solo mode regardless of owner', () => {
    expect(canAccessWorkspace(principal('anyone'), { createdBy: 'someone_else' }, { soloMode: true })).toBe(true);
  });
  it('filterAccessibleWorkspaces narrows to owned (cloud) and passes all (privileged/solo)', () => {
    const rows = [{ createdBy: 'user_a' }, { createdBy: 'user_b' }];
    expect(filterAccessibleWorkspaces(rows, principal('user_a'), cloud)).toEqual([{ createdBy: 'user_a' }]);
    expect(filterAccessibleWorkspaces(rows, principal('user_a', { scopes: ['admin'] }), cloud)).toHaveLength(2);
    expect(filterAccessibleWorkspaces(rows, principal('nobody'), { soloMode: true })).toHaveLength(2);
  });
});

describe('conductor cross-tenant IDOR guard', () => {
  it('(a) user B gets an identical 404 (never a 403 oracle) on user A workspace read/writes', async () => {
    const { module, steered, stopped, merged } = makeModule(ROWS);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(principal('user_b'));
      for (const path of [
        '/api/conductor/workspaces/ws_a',
        '/api/conductor/workspaces/ws_a/diff',
      ]) {
        const res = await request(h.base, 'GET', path);
        expect(res.status).toBe(404);
      }
      const steer = await request(h.base, 'POST', '/api/conductor/workspaces/ws_a/steer', {
        keys: 'do harm',
      });
      expect(steer.status).toBe(404);
      const stop = await request(h.base, 'POST', '/api/conductor/workspaces/ws_a/stop', {});
      expect(stop.status).toBe(404);
      const merge = await request(h.base, 'POST', '/api/conductor/workspaces/ws_a/merge', {});
      expect(merge.status).toBe(404);
      // The guard blocked BEFORE any module mutation ran.
      expect(steered).toHaveLength(0);
      expect(stopped).toHaveLength(0);
      expect(merged).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('(a2) the inaccessible 404 is byte-identical to a genuinely-missing workspace', async () => {
    const { module } = makeModule(ROWS);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(principal('user_b'));
      const foreign = await request(h.base, 'GET', '/api/conductor/workspaces/ws_a');
      const missing = await request(h.base, 'GET', '/api/conductor/workspaces/ws_missing');
      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      // The identifying fields (code + message) are identical — no existence oracle.
      // (The envelope's `timestamp` is intentionally excluded; it is not identifying.)
      const identify = (j: unknown) => {
        const e = (j as { error?: { code?: string; message?: string } }).error ?? {};
        return { code: e.code, message: e.message };
      };
      expect(identify(foreign.json)).toEqual(identify(missing.json));
      expect(identify(foreign.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });

  it('(b) the list edges return only the caller-owned workspaces', async () => {
    const { module } = makeModule(ROWS);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(principal('user_b'));
      // Query router shadows the base `/workspaces` list.
      const listed = await request(h.base, 'GET', '/api/conductor/workspaces');
      const ids = ((listed.json as { data?: { workspaces?: WorkspaceRow[] } }).data?.workspaces ?? []).map(
        (w) => w.workspaceId,
      );
      expect(ids).toEqual(['ws_b']);
      expect(ids).not.toContain('ws_a');
    } finally {
      await h.close();
    }
  });

  it('(c) the owner (user A) keeps full read + write access', async () => {
    const { module, steered, stopped } = makeModule(ROWS);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(principal('user_a'));
      const get = await request(h.base, 'GET', '/api/conductor/workspaces/ws_a');
      expect(get.status).toBe(200);
      const steer = await request(h.base, 'POST', '/api/conductor/workspaces/ws_a/steer', {
        keys: 'ok',
      });
      expect(steer.status).toBe(200);
      const stop = await request(h.base, 'POST', '/api/conductor/workspaces/ws_a/stop', {});
      expect(stop.status).toBe(200);
      expect(steered).toContain('ws_a');
      expect(stopped).toContain('ws_a');
    } finally {
      await h.close();
    }
  });

  it('(d) an admin principal may access any workspace', async () => {
    const { module } = makeModule(ROWS);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(principal('user_admin', { scopes: ['read', 'write', 'admin'] }));
      const get = await request(h.base, 'GET', '/api/conductor/workspaces/ws_a');
      expect(get.status).toBe(200);
      const merge = await request(h.base, 'POST', '/api/conductor/workspaces/ws_b/merge', {});
      expect(merge.status).toBe(200);
      // Admin sees every workspace in the list.
      const listed = await request(h.base, 'GET', '/api/conductor/workspaces');
      const ids = ((listed.json as { data?: { workspaces?: WorkspaceRow[] } }).data?.workspaces ?? []).map(
        (w) => w.workspaceId,
      );
      expect(ids).toEqual(expect.arrayContaining(['ws_a', 'ws_b']));
    } finally {
      await h.close();
    }
  });

  it('(e) solo-mode allows access without an owner match (never locks the local user out)', async () => {
    const { module } = makeModule(ROWS);
    const h = await serve(module, { soloMode: true });
    try {
      // A caller who owns NEITHER workspace still reaches them in solo/desktop mode.
      h.setPrincipal(principal('recoder-solo-owner'));
      const a = await request(h.base, 'GET', '/api/conductor/workspaces/ws_a');
      const b = await request(h.base, 'GET', '/api/conductor/workspaces/ws_b');
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const listed = await request(h.base, 'GET', '/api/conductor/workspaces');
      const ids = ((listed.json as { data?: { workspaces?: WorkspaceRow[] } }).data?.workspaces ?? []).map(
        (w) => w.workspaceId,
      );
      expect(ids).toEqual(expect.arrayContaining(['ws_a', 'ws_b']));
    } finally {
      await h.close();
    }
  });
});
