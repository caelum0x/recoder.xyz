/**
 * N-up per-file version read (A4) — `GET /workspaces/compare/:taskGroup/file-versions`
 * over the REAL composed module (route → module → converge op).
 *
 * Proves (routes, recoder-kybr no-oracle): a missing `path` query is a 400; the owner
 * gets a truthful view whose siblings degrade to `content:null` over fake (non-repo)
 * worktrees — never a fabricated version; a foreign principal gets a 404 byte-identical
 * to a genuinely-unknown group (never confirming another tenant's group exists); and an
 * unknown group is the same 404.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { Workspace } from '@recoder/agent-os';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../../identity/types.js';
import type { ConductorModule } from '../index.js';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from '../__fixtures__/harness.js';
import { buildCompareRoutes } from './compare.routes.js';

const userA = makePrincipal('user_a');
const userB = makePrincipal('user_b');

function statSubstrate(): FakeSubstrate {
  return new FakeSubstrate({
    diff: { stat: ' 1 file changed, 1 insertion(+)', patch: '', untracked: [], changedFiles: 1 },
  });
}

async function launch(
  module: ConductorModule,
  taskGroup: string,
  agent: string,
  principal: Principal,
): Promise<Workspace> {
  const created = await module.createWorkspace(
    makeCreateInput({ runtimeId: agent, command: 'agent-run', metadata: { taskGroup } }),
    principal,
  );
  return created.value!;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
  setPrincipal: (p: Principal) => void;
}

function serve(module: ConductorModule): Promise<Harness> {
  let current: Principal = userA;
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
  app.use('/api/conductor', buildCompareRoutes({ module, middleware, soloMode: false }));
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

function request(base: string, url: string): Promise<{ status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    http.get(`${base}${url}`, (res) => {
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
    }).on('error', reject);
  });
}

function identify(json: unknown): { code?: string; message?: string } {
  const e = (json as { error?: { code?: string; message?: string } }).error ?? {};
  return { code: e.code, message: e.message };
}

interface FileVersionsBody {
  path: string;
  base: string | null;
  versions: { workspaceId: string; agent: string; content: string | null; reason?: string }[];
}
const fileVersionsOf = (json: unknown) =>
  (json as { data?: { fileVersions?: FileVersionsBody } }).data?.fileVersions;

describe('GET /workspaces/compare/:taskGroup/file-versions (route + recoder-kybr guard)', () => {
  it('a missing `path` query param → 400 VALIDATION_ERROR', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launch(module, 'grp_p', 'claude_code', userA);
    const h = await serve(module);
    try {
      const res = await request(h.base, '/api/conductor/workspaces/compare/grp_p/file-versions');
      expect(res.status).toBe(400);
      expect(identify(res.json).code).toBe('VALIDATION_ERROR');
    } finally {
      await h.close();
    }
  });

  it('the owner gets a truthful N-up view (fake worktrees degrade to content:null)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launch(module, 'grp_p', 'claude_code', userA);
    const b = await launch(module, 'grp_p', 'codex', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userA);
      const res = await request(
        h.base,
        '/api/conductor/workspaces/compare/grp_p/file-versions?path=shared.ts',
      );
      expect(res.status).toBe(200);
      const view = fileVersionsOf(res.json)!;
      expect(view.path).toBe('shared.ts');
      // BOTH of the caller's own siblings appear, in order — the desktop's N columns.
      expect(view.versions.map((v) => v.workspaceId).sort()).toEqual([a.workspaceId, b.workspaceId].sort());
      // Fake worktrees are not real repos ⇒ every version degrades truthfully to null
      // with a reason (never a fabricated file), and the base is not fabricated.
      for (const v of view.versions) {
        expect(v.content).toBeNull();
        expect(typeof v.reason).toBe('string');
      }
    } finally {
      await h.close();
    }
  });

  it('a foreign principal gets a no-oracle 404, byte-identical to an unknown group', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await launch(module, 'grp_a', 'claude_code', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userB);
      const foreign = await request(
        h.base,
        '/api/conductor/workspaces/compare/grp_a/file-versions?path=shared.ts',
      );
      const unknown = await request(
        h.base,
        '/api/conductor/workspaces/compare/grp_nope/file-versions?path=shared.ts',
      );
      expect(foreign.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(identify(foreign.json)).toEqual(identify(unknown.json));
      expect(identify(foreign.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });
});
