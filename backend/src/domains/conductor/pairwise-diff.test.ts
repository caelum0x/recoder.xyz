/**
 * Pairwise A/B line-level diff (BE-W8-PAIRWISE) — the backend edge the desktop
 * Compare view's PairwisePanel needs: a TRUE line-level unified diff of the SAME
 * file across two sibling worktrees (`git diff --no-index A/<path> B/<path>`).
 *
 * Proves (real git): divergent edits to a shared file yield a real unified patch
 * (A's line as `-`, B's line as `+`); identical files yield `patch:''` (computed,
 * no delta — never `unavailable`); a differing binary file reports `binary:true,
 * patch:null`; a poisoned path (empty / leading `-` / NUL / absolute / `..`) is
 * rejected BEFORE any spawn; a missing worktree or exec fault degrades to
 * `available:false` with a truthful reason (never a throw); the batched
 * `pairwiseDiff` caps its path list and says so (`capped:true`).
 *
 * Proves (routes, recoder-kybr no-oracle): `GET …/compare/:taskGroup/pairwise`
 * requires `a`+`b` (400); a foreign principal gets a 404 byte-identical to an
 * unknown group; an `a`/`b` outside the caller's OWN sibling set (another
 * tenant's sibling of the SAME group included) is the same no-oracle 404.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RequestHandler } from 'express';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../shared/logger.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { Principal } from '../identity/types.js';
import type { ConductorModule } from './index.js';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import { buildCompareRoutes } from './routes/compare.routes.js';
import {
  pairwiseDiff,
  pairwiseFileDiff,
  sharedPairPaths,
  PAIRWISE_MAX_PATHS,
  type PairwiseDiffDeps,
} from './services/pairwise-diff.service.js';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function git(cwd: string, args: string[]): void {
  execFileSync('git', ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    stdio: 'pipe',
  });
}

function makeWs(over: Partial<Workspace> & { workspaceId: string; worktreePath?: string }): Workspace {
  return {
    spaceId: 's',
    projectId: 'p',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: `b-${over.workspaceId}`,
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...over,
  } as Workspace;
}

describe('pairwiseFileDiff (real git, two divergent worktrees)', () => {
  let root: string;
  let repo: string;
  let wtA: string;
  let wtB: string;
  let wsA: Workspace;
  let wsB: Workspace;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-pairwise-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'keep.ts'), 'base-keep\n');
    writeFileSync(path.join(repo, 'shared.ts'), 'base-shared\n');
    writeFileSync(path.join(repo, 'blob.bin'), Buffer.from([0, 1, 2, 3]));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);

    wtA = path.join(root, 'wt-a');
    wtB = path.join(root, 'wt-b');
    git(repo, ['worktree', 'add', '-b', 'agent-a', wtA, 'main']);
    git(repo, ['worktree', 'add', '-b', 'agent-b', wtB, 'main']);

    writeFileSync(path.join(wtA, 'shared.ts'), 'shared-by-a\n');
    writeFileSync(path.join(wtB, 'shared.ts'), 'shared-by-b\n');
    writeFileSync(path.join(wtB, 'blob.bin'), Buffer.from([0, 9, 9, 9]));

    wsA = makeWs({ workspaceId: 'ws-a', worktreePath: wtA });
    wsB = makeWs({ workspaceId: 'ws-b', worktreePath: wtB });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const deps: PairwiseDiffDeps = { logger: noopLogger };

  it('divergent edits → a real unified diff A vs B (A as -, B as +)', async () => {
    const view = await pairwiseFileDiff(deps, { a: wsA, b: wsB, path: 'shared.ts' });
    expect(view.available).toBe(true);
    expect(view.binary).toBe(false);
    expect(view.path).toBe('shared.ts');
    expect(view.patch).toContain('-shared-by-a');
    expect(view.patch).toContain('+shared-by-b');
    expect(view.patch).toMatch(/^@@ /m);
  });

  it("identical file → available with patch '' (computed, no delta)", async () => {
    const view = await pairwiseFileDiff(deps, { a: wsA, b: wsB, path: 'keep.ts' });
    expect(view.available).toBe(true);
    expect(view.binary).toBe(false);
    expect(view.patch).toBe('');
  });

  it('differing binary file → binary:true, patch:null', async () => {
    const view = await pairwiseFileDiff(deps, { a: wsA, b: wsB, path: 'blob.bin' });
    expect(view.available).toBe(true);
    expect(view.binary).toBe(true);
    expect(view.patch).toBeNull();
  });

  it('poisoned paths are rejected BEFORE any spawn (empty, -flag, NUL, absolute, ..)', async () => {
    let spawned = 0;
    const spyDeps: PairwiseDiffDeps = {
      logger: noopLogger,
      exec: (async () => {
        spawned += 1;
        return { stdout: '', stderr: '', code: 0 };
      }) as PairwiseDiffDeps['exec'],
    };
    for (const bad of ['', '--output=/tmp/pwn', 'a\0b', '/etc/passwd', '../escape.ts', 'ok/../../escape.ts']) {
      const view = await pairwiseFileDiff(spyDeps, { a: wsA, b: wsB, path: bad });
      expect(view.available).toBe(false);
      expect(view.patch).toBeNull();
      expect(view.reason).toBeDefined();
    }
    expect(spawned).toBe(0);
  });

  it('a missing worktree degrades truthfully (available:false + reason, never a throw)', async () => {
    const noTree = makeWs({ workspaceId: 'ws-x' }); // no worktreePath
    const view = await pairwiseFileDiff(deps, { a: noTree, b: wsB, path: 'shared.ts' });
    expect(view.available).toBe(false);
    expect(view.patch).toBeNull();
    expect(view.reason).toContain('worktree');
  });

  it('an exec fault degrades truthfully (never a throw)', async () => {
    const faultDeps: PairwiseDiffDeps = {
      logger: noopLogger,
      exec: (async () => {
        throw new Error('boom');
      }) as PairwiseDiffDeps['exec'],
    };
    const view = await pairwiseFileDiff(faultDeps, { a: wsA, b: wsB, path: 'shared.ts' });
    expect(view.available).toBe(false);
    expect(view.patch).toBeNull();
    expect(view.reason).toBeDefined();
  });

  it('a file present on only one side degrades truthfully (git cannot access it)', async () => {
    writeFileSync(path.join(wtB, 'only-b.ts'), 'from-b\n');
    const view = await pairwiseFileDiff(deps, { a: wsA, b: wsB, path: 'only-b.ts' });
    expect(view.available).toBe(false);
    expect(view.patch).toBeNull();
    expect(view.reason).toBeDefined();
  });

  it('pairwiseDiff maps a bounded path list and caps it truthfully', async () => {
    const view = await pairwiseDiff(deps, { a: wsA, b: wsB, paths: ['shared.ts', 'keep.ts'] });
    expect(view.a).toBe('ws-a');
    expect(view.b).toBe('ws-b');
    expect(view.capped).toBe(false);
    expect(view.files.map((f) => f.path)).toEqual(['shared.ts', 'keep.ts']);
    expect(view.files[0].patch).toContain('+shared-by-b');

    const many = Array.from({ length: PAIRWISE_MAX_PATHS + 3 }, (_, i) => `f-${i}.ts`);
    const capped = await pairwiseDiff(deps, { a: wsA, b: wsB, paths: many });
    expect(capped.capped).toBe(true);
    expect(capped.files).toHaveLength(PAIRWISE_MAX_PATHS);
  });
});

describe('sharedPairPaths (pure default-path fold)', () => {
  it('intersects both changed-file lists when present', () => {
    expect(
      sharedPairPaths(
        { workspaceId: 'A', changedFiles: ['a.ts', 'shared.ts'] },
        { workspaceId: 'B', changedFiles: ['shared.ts', 'b.ts'] },
        [],
      ),
    ).toEqual(['shared.ts']);
  });

  it('falls back to the contested set restricted to the pair when a list is unreadable', () => {
    expect(
      sharedPairPaths({ workspaceId: 'A' }, { workspaceId: 'B', changedFiles: ['shared.ts'] }, [
        { path: 'shared.ts', workspaceIds: ['A', 'B'] },
        { path: 'other.ts', workspaceIds: ['A', 'C'] },
      ]),
    ).toEqual(['shared.ts']);
  });

  it('no lists + no contested overlap ⇒ []', () => {
    expect(sharedPairPaths({ workspaceId: 'A' }, { workspaceId: 'B' }, [])).toEqual([]);
  });
});

// --- route + authz (recoder-kybr no-oracle), over the REAL composed module ------

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
const pairwiseOf = (json: unknown) =>
  (json as { data?: { pairwise?: { a: string; b: string; files: unknown[]; capped: boolean } } }).data?.pairwise;

describe('GET /workspaces/compare/:taskGroup/pairwise (route + recoder-kybr guard)', () => {
  it('missing a/b query params → 400 VALIDATION_ERROR', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launch(module, 'grp_p', 'claude_code', userA);
    const h = await serve(module);
    try {
      const noB = await request(h.base, `/api/conductor/workspaces/compare/grp_p/pairwise?a=${a.workspaceId}`);
      expect(noB.status).toBe(400);
      expect(identify(noB.json).code).toBe('VALIDATION_ERROR');
      const none = await request(h.base, '/api/conductor/workspaces/compare/grp_p/pairwise');
      expect(none.status).toBe(400);
    } finally {
      await h.close();
    }
  });

  it('the owner gets a truthful pairwise view over their own pair (fake worktrees degrade)', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launch(module, 'grp_p', 'claude_code', userA);
    const b = await launch(module, 'grp_p', 'codex', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userA);
      const res = await request(
        h.base,
        `/api/conductor/workspaces/compare/grp_p/pairwise?a=${a.workspaceId}&b=${b.workspaceId}`,
      );
      expect(res.status).toBe(200);
      const view = pairwiseOf(res.json)!;
      expect(view.a).toBe(a.workspaceId);
      expect(view.b).toBe(b.workspaceId);
      expect(view.capped).toBe(false);
      // Fake worktrees are not real repos: the changed-file lists are unreadable,
      // so the default shared set is truthfully empty — never fabricated files.
      expect(view.files).toEqual([]);
    } finally {
      await h.close();
    }
  });

  it('explicit ?paths= drives per-file rows that degrade truthfully on a non-repo worktree', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launch(module, 'grp_p', 'claude_code', userA);
    const b = await launch(module, 'grp_p', 'codex', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userA);
      const res = await request(
        h.base,
        `/api/conductor/workspaces/compare/grp_p/pairwise?a=${a.workspaceId}&b=${b.workspaceId}&paths=x.ts,y.ts`,
      );
      expect(res.status).toBe(200);
      const view = pairwiseOf(res.json)!;
      const files = view.files as { path: string; available: boolean; patch: string | null }[];
      expect(files.map((f) => f.path)).toEqual(['x.ts', 'y.ts']);
      for (const f of files) {
        expect(f.available).toBe(false);
        expect(f.patch).toBeNull();
      }
    } finally {
      await h.close();
    }
  });

  it('a foreign principal gets a no-oracle 404, byte-identical to an unknown group', async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const a = await launch(module, 'grp_a', 'claude_code', userA);
    const b = await launch(module, 'grp_a', 'codex', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userB);
      const foreign = await request(
        h.base,
        `/api/conductor/workspaces/compare/grp_a/pairwise?a=${a.workspaceId}&b=${b.workspaceId}`,
      );
      const unknown = await request(h.base, '/api/conductor/workspaces/compare/grp_nope/pairwise?a=x&b=y');
      expect(foreign.status).toBe(404);
      expect(unknown.status).toBe(404);
      expect(identify(foreign.json)).toEqual(identify(unknown.json));
      expect(identify(foreign.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });

  it("an a/b outside the caller's OWN sibling set (a foreign sibling of the SAME group included) → 404", async () => {
    const { module } = composeConductor({ substrates: [statSubstrate()] });
    const mine = await launch(module, 'grp_mix', 'claude_code', userA);
    const theirs = await launch(module, 'grp_mix', 'opencode', userB);
    const elsewhere = await launch(module, 'grp_other', 'codex', userA);
    const h = await serve(module);
    try {
      h.setPrincipal(userA);
      // B's sibling of the SAME group is filtered by the principal narrowing ⇒ 404.
      const cross = await request(
        h.base,
        `/api/conductor/workspaces/compare/grp_mix/pairwise?a=${mine.workspaceId}&b=${theirs.workspaceId}`,
      );
      expect(cross.status).toBe(404);
      // A workspace of ANOTHER group is not a member either ⇒ 404.
      const wrongGroup = await request(
        h.base,
        `/api/conductor/workspaces/compare/grp_mix/pairwise?a=${mine.workspaceId}&b=${elsewhere.workspaceId}`,
      );
      expect(wrongGroup.status).toBe(404);
      expect(identify(cross.json)).toEqual({ code: 'NOT_FOUND', message: 'workspace not found' });
    } finally {
      await h.close();
    }
  });
});
