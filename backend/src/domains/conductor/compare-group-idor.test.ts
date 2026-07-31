/**
 * Group-scoped cross-tenant IDOR guard (recoder-kybr) — the conductor compare /
 * converge edges are keyed on a shared `taskGroup`, NOT a single workspace id, so
 * the single-id `requireWorkspaceAccess` guard the `:id` routes carry does NOT cover
 * them. Without the group filter an authed caller could aggregate/compare/converge
 * across siblings of a parallel run they do not own.
 *
 * Proves — over the REAL composed module behind `buildCompareRoutes` (route → module
 * → compare/converge services), plus a couple of pure-service unit checks:
 *  (a) tenant B gets a no-oracle 404 (identical to an unknown group) on a taskGroup
 *      whose siblings all belong to tenant A — compare / converge-plan / converge;
 *  (b) a MIXED group returns ONLY the caller's own siblings (no A rows leak to B),
 *      and a converge/plan folds only the caller's own worktrees (siblingCount);
 *  (c) the owner sees their own siblings and gets PAST the group gate;
 *  (d) an admin (privileged operator) principal sees every sibling;
 *  (e) solo/desktop single-user mode fails OPEN (never locks the one local user out);
 *  (f) `workspaceSiblings` narrows the returned group to the caller's own siblings.
 */
import { describe, it, expect } from 'vitest';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { Workspace } from '@recoder/agent-os';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../identity/types.js';
import type { ConductorModule } from './index.js';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeConfig,
  makePrincipal,
} from './__fixtures__/harness.js';
import { buildCompareRoutes } from './routes/compare.routes.js';
import {
  compareTaskGroup as compareTaskGroupOp,
  workspaceSiblings as workspaceSiblingsOp,
  type CompareDeps,
} from './services/compare.service.js';

/** A FakeSubstrate whose diff reports a real `git diff --stat` line (so launches get a worktree). */
function statSubstrate(): FakeSubstrate {
  return new FakeSubstrate({
    diff: { stat: ' 1 file changed, 1 insertion(+)', patch: '', untracked: [], changedFiles: 1 },
  });
}

const userA = makePrincipal('user_a');
const userB = makePrincipal('user_b');
const admin: Principal = { ...makePrincipal('user_admin'), scopes: ['read', 'write', 'admin'] };

/** Launch a sibling in `taskGroup`, run by `agent`, OWNED by `principal` (stamps createdBy). */
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

/** Mount `buildCompareRoutes` over a real module with an injectable principal. */
function serve(module: ConductorModule, opts: { soloMode: boolean }): Promise<Harness> {
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
  app.use('/api/conductor', buildCompareRoutes({ module, middleware, soloMode: opts.soloMode }));
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

/** Identify an error envelope by its (non-timestamp) fields — the no-oracle contract. */
function identify(json: unknown): { code?: string; message?: string } {
  const e = (json as { error?: { code?: string; message?: string } }).error ?? {};
  return { code: e.code, message: e.message };
}
const compareOf = (json: unknown) =>
  (json as { data?: { compare?: { count: number; siblings: { agent: string; workspaceId: string }[] } } }).data
    ?.compare;
const planOf = (json: unknown) =>
  (json as { data?: { plan?: { siblingCount: number } } }).data?.plan;

describe('recoder-kybr group-scoped compare/converge IDOR guard (routes)', () => {
  /** grp_mix: A owns claude_code + codex, B owns opencode. grp_a: A owns 2. */
  async function seed(module: ConductorModule) {
    const aMix1 = await launch(module, 'grp_mix', 'claude_code', userA);
    await launch(module, 'grp_mix', 'codex', userA);
    await launch(module, 'grp_mix', 'opencode', userB);
    await launch(module, 'grp_a', 'claude_code', userA);
    await launch(module, 'grp_a', 'codex', userA);
    return { aMix1 };
  }

  it('(a) tenant B: a group owned entirely by A is a no-oracle 404 (identical to an unknown group)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await seed(module);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(userB);
      const foreign = await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_a');
      const unknown = await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_nope');
      expect(foreign.status).toBe(404);
      expect(unknown.status).toBe(404);
      // Byte-identical (code + message) — never confirms A's group exists.
      expect(identify(foreign.json)).toEqual(identify(unknown.json));
      expect(identify(foreign.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });

  it('(b) a MIXED group returns ONLY the caller-owned siblings (no A rows leak to B)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await seed(module);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(userB);
      const bView = compareOf(
        (await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_mix')).json,
      );
      expect(bView?.count).toBe(1);
      expect(bView?.siblings.map((s) => s.agent)).toEqual(['opencode']);

      h.setPrincipal(userA);
      const aView = compareOf(
        (await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_mix')).json,
      );
      expect(aView?.count).toBe(2);
      expect(aView?.siblings.map((s) => s.agent).sort()).toEqual(['claude_code', 'codex']);
    } finally {
      await h.close();
    }
  });

  it('(c/d) the owner gets past the group gate; an admin sees every sibling', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await seed(module);
    const h = await serve(module, { soloMode: false });
    try {
      // Owner A on grp_a: gets PAST the ownership gate (its 2 siblings are folded) — a
      // 400 (no changed files in the fake worktrees), NOT the no-oracle 404 B receives.
      h.setPrincipal(userA);
      const aConverge = await request(h.base, 'POST', '/api/conductor/workspaces/compare/grp_a/converge', {});
      expect(aConverge.status).toBe(400);
      // Tenant B on the same group: no-oracle 404 (before any compose).
      h.setPrincipal(userB);
      const bConverge = await request(h.base, 'POST', '/api/conductor/workspaces/compare/grp_a/converge', {});
      expect(bConverge.status).toBe(404);

      // Admin sees ALL three siblings of the mixed group.
      h.setPrincipal(admin);
      const adminView = compareOf(
        (await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_mix')).json,
      );
      expect(adminView?.count).toBe(3);
    } finally {
      await h.close();
    }
  });

  it('(b2) converge-plan folds only the caller-own siblings (siblingCount), 404 for a foreign group', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    await seed(module);
    const h = await serve(module, { soloMode: false });
    try {
      h.setPrincipal(userB);
      // Foreign group ⇒ no-oracle 404.
      expect(
        (await request(h.base, 'GET', '/api/conductor/workspaces/compare/grp_a/converge-plan')).status,
      ).toBe(404);
      // Mixed group ⇒ only B's one sibling is folded.
      const bPlan = await request(h.base, 'GET', '/api/conductor/workspaces/compare/grp_mix/converge-plan');
      expect(bPlan.status).toBe(200);
      expect(planOf(bPlan.json)?.siblingCount).toBe(1);

      h.setPrincipal(userA);
      const aPlan = await request(h.base, 'GET', '/api/conductor/workspaces/compare/grp_mix/converge-plan');
      expect(planOf(aPlan.json)?.siblingCount).toBe(2);

      h.setPrincipal(admin);
      const adminPlan = await request(h.base, 'GET', '/api/conductor/workspaces/compare/grp_mix/converge-plan');
      expect(planOf(adminPlan.json)?.siblingCount).toBe(3);
    } finally {
      await h.close();
    }
  });

  it('(f) workspaceSiblings narrows the returned group to the owner-own siblings; B gets a no-oracle 404 on :id', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const { aMix1 } = await seed(module);
    const h = await serve(module, { soloMode: false });
    try {
      // Owner A: their workspace's group is filtered to A's OWN 2 siblings (not 3).
      h.setPrincipal(userA);
      const aSiblings = await request(
        h.base,
        'GET',
        `/api/conductor/workspaces/${aMix1.workspaceId}/siblings`,
      );
      expect(aSiblings.status).toBe(200);
      expect(compareOf(aSiblings.json)?.count).toBe(2);

      // Tenant B on A's workspace id ⇒ the `:id` access guard 404s (no-oracle).
      h.setPrincipal(userB);
      const bSiblings = await request(
        h.base,
        'GET',
        `/api/conductor/workspaces/${aMix1.workspaceId}/siblings`,
      );
      expect(bSiblings.status).toBe(404);
      expect(identify(bSiblings.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });

  it('(e) solo/desktop mode fails OPEN — a caller who owns nothing still sees the group', async () => {
    // Solo config: the single local owner is never locked out (RECODER_SOLO_MODE).
    const { module } = composeConductor({
      substrates: [statSubstrate()],
      config: makeConfig(false, true),
    });
    await launch(module, 'grp_a', 'claude_code', userA);
    await launch(module, 'grp_a', 'codex', userA);
    const h = await serve(module, { soloMode: true });
    try {
      h.setPrincipal(makePrincipal('nobody')); // owns none of grp_a
      const view = compareOf(
        (await request(h.base, 'GET', '/api/conductor/workspaces/compare?taskGroup=grp_a')).json,
      );
      expect(view?.count).toBe(2); // fail-open: sees both siblings
    } finally {
      await h.close();
    }
  });
});

describe('recoder-kybr compare service canAccess predicate (pure)', () => {
  function ws(workspaceId: string, taskGroup: string, createdBy: string): Workspace {
    return {
      workspaceId,
      spaceId: 's',
      projectId: 'p',
      taskId: 't',
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'b',
      baseRef: 'HEAD',
      state: 'running',
      createdBy,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      metadata: { taskGroup },
    } as unknown as Workspace;
  }
  const members = [ws('A1', 'grp', 'user_a'), ws('A2', 'grp', 'user_a'), ws('B1', 'grp', 'user_b')];
  function deps(canAccess?: (w: Workspace) => boolean): CompareDeps {
    return {
      listWorkspaces: async () => [...members],
      getWorkspace: async (id) => members.find((m) => m.workspaceId === id) ?? null,
      buildView: async () => {
        throw new Error('no view in this pure test');
      },
      diffStat: async () => ({ reason: 'not exercised' }),
      changedFiles: async () => ({ reason: 'not exercised' }),
      ...(canAccess ? { canAccess } : {}),
    };
  }

  it('compareTaskGroup folds ONLY siblings the predicate admits', async () => {
    const bOnly = await compareTaskGroupOp(deps((w) => w.createdBy === 'user_b'), 'grp');
    expect(bOnly.count).toBe(1);
    expect(bOnly.siblings.map((s) => s.workspaceId)).toEqual(['B1']);

    const aOnly = await compareTaskGroupOp(deps((w) => w.createdBy === 'user_a'), 'grp');
    expect(aOnly.siblings.map((s) => s.workspaceId).sort()).toEqual(['A1', 'A2']);
  });

  it('an absent predicate (internal read) or an allow-all predicate (solo/admin) sees the full group', async () => {
    expect((await compareTaskGroupOp(deps(), 'grp')).count).toBe(3); // internal evidence read
    expect((await compareTaskGroupOp(deps(() => true), 'grp')).count).toBe(3); // solo/admin
  });

  it('workspaceSiblings returns a no-oracle null when the predicate denies the subject workspace', async () => {
    // The workspace exists, but the caller may not access it ⇒ null (⇒ route 404),
    // byte-identical to a genuinely-missing workspace.
    expect(await workspaceSiblingsOp(deps((w) => w.createdBy === 'user_a'), 'B1')).toBeNull();
    // The owner reaches it and gets their own-narrowed group.
    const own = await workspaceSiblingsOp(deps((w) => w.createdBy === 'user_b'), 'B1');
    expect(own?.count).toBe(1);
  });
});
