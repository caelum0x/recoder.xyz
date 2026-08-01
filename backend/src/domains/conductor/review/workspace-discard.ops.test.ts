/**
 * File-level REJECT in review (`discardWorkspacePaths` + `POST
 * /workspaces/:id/files/discard`) — restore selected paths to the review base so
 * Apply (= merge) delivers only the accepted set.
 *
 * Proves (real git): a base-modified file is restored byte-for-byte and committed;
 * an added file is removed from worktree AND index; a deleted file (committed or
 * worktree-only) is restored; an untouched file is a truthful 'unchanged' no-op
 * (no empty commit); '../evil' / '-rf' style paths fail per-path with the repo
 * untouched; a mixed batch lands as ONE commit containing ONLY the discarded
 * paths while unrelated worktree changes stay untouched (Apply-set integrity).
 *
 * Proves (route): `{paths}` is validated fail-fast (400 VALIDATION_ERROR for
 * empty/non-string-array/unsafe before the module is touched), an anonymous
 * caller is rejected by `authenticateMutating`, and a missing workspace is a
 * truthful 404 from the ownership guard.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { RequestHandler } from 'express';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { errorEnvelope } from '../../../shared/errors.js';
import type { Principal } from '../../identity/types.js';
import type { AuthMiddleware } from '../../identity/middleware/authenticate.middleware.js';
import type { GateVerdict } from '../ports/index.js';
import type { ConductorModule } from '../index.js';
import { buildConductorRoutes } from '../routes/conductor.routes.js';
import { discardWorkspacePaths, type DiscardOpsDeps } from './workspace-discard.ops.js';

const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as unknown as Logger;

function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, stdio: 'pipe' },
  ).toString();
}

function makeWs(over: Partial<Workspace> = {}): Workspace {
  return {
    workspaceId: 'ws-discard',
    spaceId: 's',
    projectId: 'p',
    taskId: 'task-1',
    runtimeId: 'claude_code',
    substrate: 'tmux_worktree',
    branch: 'work',
    baseRef: 'main',
    state: 'awaiting_review',
    createdBy: 'user-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    metadata: {},
    ...over,
  } as Workspace;
}

describe('discardWorkspacePaths (real git)', () => {
  let root: string;
  let repo: string;
  let ws: Workspace;
  const deps: DiscardOpsDeps = { logger: noopLogger };

  const commitCount = (): number => Number(git(repo, ['rev-list', '--count', 'HEAD']).trim());

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-discard-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo);
    git(repo, ['init']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'keep.txt'), 'base-keep\n');
    writeFileSync(path.join(repo, 'mod.txt'), 'base-mod\n');
    writeFileSync(path.join(repo, 'del.txt'), 'base-del\n');
    writeFileSync(path.join(repo, 'other.txt'), 'base-other\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
    // The agent's branch: modify mod.txt, add added.txt, delete del.txt — committed
    // (the continue/publish flow commits agent edits onto the worktree branch).
    git(repo, ['checkout', '-b', 'work']);
    writeFileSync(path.join(repo, 'mod.txt'), 'agent-mod\n');
    writeFileSync(path.join(repo, 'added.txt'), 'agent-new\n');
    rmSync(path.join(repo, 'del.txt'));
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'agent']);
    ws = makeWs({ worktreePath: repo });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('(a) restores a modified file byte-for-byte to base and commits once', async () => {
    const before = commitCount();
    const view = await discardWorkspacePaths(deps, ws, ['mod.txt']);

    expect(view.results).toEqual([{ path: 'mod.txt', action: 'restored' }]);
    expect(view.base).toBe('main');
    expect(view.committed).toBe(true);
    expect(readFileSync(path.join(repo, 'mod.txt'), 'utf8')).toBe('base-mod\n');
    expect(commitCount()).toBe(before + 1);
    expect(git(repo, ['log', '-1', '--pretty=%s']).trim()).toBe('recoder: discard 1 path(s) to base');
  });

  it('(b) removes an added file from worktree and index', async () => {
    const view = await discardWorkspacePaths(deps, ws, ['added.txt']);

    expect(view.results).toEqual([{ path: 'added.txt', action: 'removed' }]);
    expect(view.committed).toBe(true);
    expect(existsSync(path.join(repo, 'added.txt'))).toBe(false);
    expect(git(repo, ['ls-files', '--', 'added.txt']).trim()).toBe('');
  });

  it('(c) restores a file the agent deleted (committed deletion)', async () => {
    const view = await discardWorkspacePaths(deps, ws, ['del.txt']);

    expect(view.results).toEqual([{ path: 'del.txt', action: 'restored' }]);
    expect(view.committed).toBe(true);
    expect(readFileSync(path.join(repo, 'del.txt'), 'utf8')).toBe('base-del\n');
  });

  it('(c2) restores a worktree-only deletion without an empty commit', async () => {
    rmSync(path.join(repo, 'keep.txt'));
    const before = commitCount();

    const view = await discardWorkspacePaths(deps, ws, ['keep.txt']);

    expect(view.results).toEqual([{ path: 'keep.txt', action: 'restored' }]);
    expect(readFileSync(path.join(repo, 'keep.txt'), 'utf8')).toBe('base-keep\n');
    // The branch HEAD already carries the base content — nothing to commit.
    expect(view.committed).toBe(false);
    expect(commitCount()).toBe(before);
  });

  it('(d) an unchanged file is a truthful no-op (no commit)', async () => {
    const before = commitCount();
    const view = await discardWorkspacePaths(deps, ws, ['keep.txt']);

    expect(view.results).toEqual([{ path: 'keep.txt', action: 'unchanged' }]);
    expect(view.committed).toBe(false);
    expect(commitCount()).toBe(before);
  });

  it('(e) rejects unsafe paths per-path with the repo untouched', async () => {
    const before = commitCount();
    const statusBefore = git(repo, ['status', '--porcelain']);

    const view = await discardWorkspacePaths(deps, ws, ['../evil', '-rf', '/abs/path']);

    expect(view.results.map((r) => r.action)).toEqual(['failed', 'failed', 'failed']);
    for (const r of view.results) expect(r.reason).toBeTruthy();
    expect(view.committed).toBe(false);
    expect(commitCount()).toBe(before);
    expect(git(repo, ['status', '--porcelain'])).toBe(statusBefore);
  });

  it('(f) a mixed batch lands as ONE commit of only the discarded paths; other work untouched', async () => {
    // Unrelated, uncommitted agent work that must survive the discard untouched.
    writeFileSync(path.join(repo, 'other.txt'), 'dirty-other\n');
    const before = commitCount();

    const view = await discardWorkspacePaths(deps, ws, ['mod.txt', 'added.txt', 'keep.txt']);

    expect(view.results).toEqual([
      { path: 'mod.txt', action: 'restored' },
      { path: 'added.txt', action: 'removed' },
      { path: 'keep.txt', action: 'unchanged' },
    ]);
    expect(view.committed).toBe(true);
    expect(commitCount()).toBe(before + 1);
    // The discard commit contains ONLY the discarded paths (Apply-set integrity).
    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();
    expect(committedFiles).toEqual(['added.txt', 'mod.txt']);
    // The unrelated worktree change is still there, still uncommitted.
    expect(readFileSync(path.join(repo, 'other.txt'), 'utf8')).toBe('dirty-other\n');
    expect(git(repo, ['status', '--porcelain'])).toContain('other.txt');
  });

  it('throws a truthful error when the workspace has no worktree', async () => {
    await expect(discardWorkspacePaths(deps, makeWs(), ['mod.txt'])).rejects.toThrow(/no worktree/);
  });
});

// --- route level: POST /workspaces/:id/files/discard --------------------------

const PRINCIPAL: Principal = {
  userId: 'user_test',
  actorId: 'user_test',
  actorType: 'user',
  scopes: ['admin'],
} as unknown as Principal;

function makeMiddleware(opts: { anonymous?: boolean } = {}): AuthMiddleware {
  const mutating: RequestHandler = (req, res, next) => {
    if (opts.anonymous) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED' } });
      return;
    }
    (req as { principal?: Principal }).principal = PRINCIPAL;
    next();
  };
  const passthrough: RequestHandler = (req, _res, next) => {
    (req as { principal?: Principal }).principal = PRINCIPAL;
    next();
  };
  return {
    authenticate: passthrough,
    authenticateMutating: mutating,
    requireAdmin: passthrough,
    requireInternal: passthrough,
    requirePermission: () => passthrough,
    verifyOrgAccess: () => passthrough,
  } as unknown as AuthMiddleware;
}

function allowVerdict(): GateVerdict {
  return {
    verdictId: 'v1',
    requestId: 'r1',
    effect: 'allow',
    tier: 'low',
    reason: 'allowed',
    degraded: false,
    engine: 'ts',
    createdAt: new Date().toISOString(),
  } as unknown as GateVerdict;
}

interface DiscardCall {
  workspaceId: string;
  paths: readonly string[];
  principal: Principal;
}

function stubModule(opts: { missing?: boolean } = {}, calls: DiscardCall[] = []): ConductorModule {
  return {
    async getWorkspace(workspaceId: string) {
      if (opts.missing) return null;
      return { workspaceId, createdBy: 'user_test' };
    },
    async discardWorkspaceFiles(workspaceId: string, paths: readonly string[], principal: Principal) {
      calls.push({ workspaceId, paths, principal });
      return {
        ok: true,
        verdict: allowVerdict(),
        value: { workspaceId, base: 'main', committed: true, results: [] },
      };
    },
  } as unknown as ConductorModule;
}

interface Harness {
  base: string;
  close: () => Promise<void>;
}

function serve(module: ConductorModule, middleware: AuthMiddleware): Promise<Harness> {
  const app = express();
  app.use(express.json());
  app.use('/api/conductor', buildConductorRoutes({ module, middleware }));
  app.use(errorEnvelope());
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

/** Raw node http POST — the setup file mocks global `fetch`, so never use it here. */
function post(base: string, urlPath: string, body: unknown): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(`${base}${urlPath}`);
    const payload = JSON.stringify(body);
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          let json: unknown = null;
          try {
            json = JSON.parse(data);
          } catch {
            /* non-JSON body — status is what the assertion needs */
          }
          resolve({ status: res.statusCode ?? 0, json });
        });
      },
    );
    req.on('error', reject);
    req.end(payload);
  });
}

describe('POST /workspaces/:id/files/discard (route)', () => {
  it('400 VALIDATION_ERROR on empty paths — the module is never touched', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      const res = await post(h.base, '/api/conductor/workspaces/ws1/files/discard', { paths: [] });
      expect(res.status).toBe(400);
      expect(res.json?.error?.code).toBe('VALIDATION_ERROR');
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('400 on a non-string-array `paths`', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      for (const paths of ['a.txt', [1, 2], null]) {
        const res = await post(h.base, '/api/conductor/workspaces/ws1/files/discard', { paths });
        expect(res.status).toBe(400);
        expect(res.json?.error?.code).toBe('VALIDATION_ERROR');
      }
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('400 on unsafe paths (option-injection / traversal / absolute)', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      for (const bad of ['../evil', '-rf', '/etc/passwd']) {
        const res = await post(h.base, '/api/conductor/workspaces/ws1/files/discard', { paths: [bad] });
        expect(res.status).toBe(400);
        expect(res.json?.error?.code).toBe('VALIDATION_ERROR');
      }
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('rejects an anonymous caller (authenticateMutating enforced)', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware({ anonymous: true }));
    try {
      const res = await post(h.base, '/api/conductor/workspaces/ws1/files/discard', { paths: ['a.txt'] });
      expect(res.status).toBe(401);
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('missing workspace is a truthful 404', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({ missing: true }, calls), makeMiddleware());
    try {
      const res = await post(h.base, '/api/conductor/workspaces/nope/files/discard', { paths: ['a.txt'] });
      expect(res.status).toBe(404);
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('drives module.discardWorkspaceFiles with the resolved principal and returns the view', async () => {
    const calls: DiscardCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      const res = await post(h.base, '/api/conductor/workspaces/ws1/files/discard', {
        paths: ['a.txt', 'src/b.ts'],
      });
      expect(res.status).toBe(200);
      expect(res.json?.data?.discard?.workspaceId).toBe('ws1');
      expect(calls).toEqual([
        { workspaceId: 'ws1', paths: ['a.txt', 'src/b.ts'], principal: PRINCIPAL },
      ]);
    } finally {
      await h.close();
    }
  });
});
