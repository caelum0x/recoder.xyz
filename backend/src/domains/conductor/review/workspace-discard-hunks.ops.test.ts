/**
 * Hunk-level REJECT in review (`discardWorkspaceHunks` + `POST
 * /workspaces/:id/files/discard-hunks`) — reverse-apply the selected hunks of a
 * single path so Apply (= merge) delivers only the accepted edits
 * (DESIGN-REFERENCE "accept/reject at set / file / hunk", the HUNK level).
 *
 * Proves (real git): rejecting one of two separated hunks keeps ONLY the other
 * edit and lands as exactly one commit touching only that path; rejecting ALL
 * hunks makes the file byte-equal to base; an out-of-range index fails THAT
 * index with a reason while valid indexes still apply; unrelated staged agent
 * work survives untouched (pathspec-limited commit); a no-diff path is a
 * truthful failed + `committed:false` (no empty commit); unsafe paths fail with
 * the repo untouched. The pure parser splits multi-hunk diffs on `@@` headers
 * and preserves the `\ No newline at end of file` marker.
 *
 * Proves (route): `{path, hunkIndexes}` is validated fail-fast (400
 * VALIDATION_ERROR before the module is touched), an anonymous caller is
 * rejected by `authenticateMutating`, and a missing workspace is a truthful 404.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
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
import {
  discardWorkspaceHunks,
  parseUnifiedDiffHunks,
} from './workspace-discard-hunks.ops.js';
import type { DiscardOpsDeps } from './workspace-discard.ops.js';

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
    workspaceId: 'ws-discard-hunks',
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

/** 20 numbered lines — edits at lines 2 and 18 sit in two separated hunks. */
const baseLines = Array.from({ length: 20 }, (_, i) => `l${String(i + 1).padStart(2, '0')}`);
const BASE_CONTENT = `${baseLines.join('\n')}\n`;
const agentLines = baseLines.map((l, i) => (i === 1 || i === 17 ? `${l}-agent` : l));
const AGENT_CONTENT = `${agentLines.join('\n')}\n`;
/** Base with ONLY the second edit (line 18) kept — hunk 0 rejected. */
const HUNK1_ONLY_CONTENT = `${baseLines.map((l, i) => (i === 17 ? `${l}-agent` : l)).join('\n')}\n`;

describe('discardWorkspaceHunks (real git)', () => {
  let root: string;
  let repo: string;
  let ws: Workspace;
  const deps: DiscardOpsDeps = { logger: noopLogger };

  const commitCount = (): number => Number(git(repo, ['rev-list', '--count', 'HEAD']).trim());

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-discard-hunks-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo);
    git(repo, ['init']);
    git(repo, ['checkout', '-b', 'main']);
    writeFileSync(path.join(repo, 'hunks.txt'), BASE_CONTENT);
    writeFileSync(path.join(repo, 'keep.txt'), 'base-keep\n');
    writeFileSync(path.join(repo, 'other.txt'), 'base-other\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
    // The agent's branch: two separated edits in hunks.txt — committed (the
    // continue/publish flow commits agent edits onto the worktree branch).
    git(repo, ['checkout', '-b', 'work']);
    writeFileSync(path.join(repo, 'hunks.txt'), AGENT_CONTENT);
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'agent']);
    ws = makeWs({ worktreePath: repo });
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('(a) rejecting hunk 0 keeps only the hunk-1 edit and commits ONCE, touching only the path', async () => {
    const before = commitCount();
    const view = await discardWorkspaceHunks(deps, ws, 'hunks.txt', [0]);

    expect(view.hunks).toEqual([{ index: 0, action: 'discarded' }]);
    expect(view.path).toBe('hunks.txt');
    expect(view.base).toBe('main');
    expect(view.committed).toBe(true);
    expect(view.commitSha).toBe(git(repo, ['rev-parse', 'HEAD']).trim());
    expect(readFileSync(path.join(repo, 'hunks.txt'), 'utf8')).toBe(HUNK1_ONLY_CONTENT);
    expect(commitCount()).toBe(before + 1);
    // The discard commit contains ONLY the requested path (Apply-set integrity).
    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(committedFiles).toEqual(['hunks.txt']);
  });

  it('(b) rejecting ALL hunks makes the file byte-equal to base', async () => {
    const view = await discardWorkspaceHunks(deps, ws, 'hunks.txt', [0, 1]);

    expect(view.hunks).toEqual([
      { index: 0, action: 'discarded' },
      { index: 1, action: 'discarded' },
    ]);
    expect(view.committed).toBe(true);
    expect(readFileSync(path.join(repo, 'hunks.txt'), 'utf8')).toBe(BASE_CONTENT);
  });

  it('(c) an out-of-range index fails THAT index with a reason — no commit when nothing valid', async () => {
    const before = commitCount();
    const view = await discardWorkspaceHunks(deps, ws, 'hunks.txt', [5]);

    expect(view.hunks).toHaveLength(1);
    expect(view.hunks[0].index).toBe(5);
    expect(view.hunks[0].action).toBe('failed');
    expect(view.hunks[0].reason).toBeTruthy();
    expect(view.committed).toBe(false);
    expect(commitCount()).toBe(before);
    expect(readFileSync(path.join(repo, 'hunks.txt'), 'utf8')).toBe(AGENT_CONTENT);
  });

  it('(c2) a mixed request still applies the valid index while failing the bad one', async () => {
    const view = await discardWorkspaceHunks(deps, ws, 'hunks.txt', [0, 5]);

    expect(view.hunks).toEqual([
      { index: 0, action: 'discarded' },
      expect.objectContaining({ index: 5, action: 'failed' }),
    ]);
    expect(view.committed).toBe(true);
    expect(readFileSync(path.join(repo, 'hunks.txt'), 'utf8')).toBe(HUNK1_ONLY_CONTENT);
  });

  it('(d) unrelated staged agent work survives untouched (pathspec-limited commit)', async () => {
    writeFileSync(path.join(repo, 'other.txt'), 'dirty-other\n');
    git(repo, ['add', '--', 'other.txt']);
    const before = commitCount();

    const view = await discardWorkspaceHunks(deps, ws, 'hunks.txt', [0]);

    expect(view.committed).toBe(true);
    expect(commitCount()).toBe(before + 1);
    const committedFiles = git(repo, ['show', '--name-only', '--pretty=format:', 'HEAD'])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    expect(committedFiles).toEqual(['hunks.txt']);
    // The unrelated staged change is still there, still uncommitted.
    expect(readFileSync(path.join(repo, 'other.txt'), 'utf8')).toBe('dirty-other\n');
    expect(git(repo, ['status', '--porcelain'])).toContain('other.txt');
  });

  it('(e) a path with no diff vs base is a truthful failed no-op (no empty commit)', async () => {
    const before = commitCount();
    const view = await discardWorkspaceHunks(deps, ws, 'keep.txt', [0]);

    expect(view.hunks).toEqual([
      expect.objectContaining({ index: 0, action: 'failed' }),
    ]);
    expect(view.hunks[0].reason).toBeTruthy();
    expect(view.committed).toBe(false);
    expect(commitCount()).toBe(before);
  });

  it('rejects unsafe paths with the repo untouched', async () => {
    const before = commitCount();
    const statusBefore = git(repo, ['status', '--porcelain']);

    for (const bad of ['../evil', '-rf', '/abs/path']) {
      const view = await discardWorkspaceHunks(deps, ws, bad, [0]);
      expect(view.hunks.map((h) => h.action)).toEqual(['failed']);
      expect(view.committed).toBe(false);
    }
    expect(commitCount()).toBe(before);
    expect(git(repo, ['status', '--porcelain'])).toBe(statusBefore);
  });

  it('throws a truthful error when the workspace has no worktree', async () => {
    await expect(discardWorkspaceHunks(deps, makeWs(), 'hunks.txt', [0])).rejects.toThrow(
      /no worktree/,
    );
  });
});

// --- pure parser --------------------------------------------------------------

describe('parseUnifiedDiffHunks (pure)', () => {
  it('(f) splits a multi-hunk diff on @@ headers, keeping the file header', () => {
    const header = ['diff --git a/f.txt b/f.txt', 'index 111..222 100644', '--- a/f.txt', '+++ b/f.txt'];
    const hunk0 = ['@@ -1,3 +1,3 @@', ' a', '-b', '+B', ' c'];
    const hunk1 = ['@@ -10,3 +10,3 @@', ' x', '-y', '+Y', ' z', '\\ No newline at end of file'];
    const diff = `${[...header, ...hunk0, ...hunk1].join('\n')}\n`;

    const parsed = parseUnifiedDiffHunks(diff);

    expect(parsed.header).toBe(header.join('\n'));
    expect(parsed.hunks).toEqual([hunk0.join('\n'), hunk1.join('\n')]);
    // The no-newline-at-eof marker stays attached to its hunk.
    expect(parsed.hunks[1]).toContain('\\ No newline at end of file');
  });

  it('(f2) an empty diff parses to no hunks', () => {
    expect(parseUnifiedDiffHunks('')).toEqual({ header: '', hunks: [] });
  });
});

// --- route level: POST /workspaces/:id/files/discard-hunks --------------------

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

interface DiscardHunksCall {
  workspaceId: string;
  path: string;
  hunkIndexes: readonly number[];
  principal: Principal;
}

function stubModule(opts: { missing?: boolean } = {}, calls: DiscardHunksCall[] = []): ConductorModule {
  return {
    async getWorkspace(workspaceId: string) {
      if (opts.missing) return null;
      return { workspaceId, createdBy: 'user_test' };
    },
    async discardWorkspaceHunks(
      workspaceId: string,
      p: string,
      hunkIndexes: readonly number[],
      principal: Principal,
    ) {
      calls.push({ workspaceId, path: p, hunkIndexes, principal });
      return {
        ok: true,
        verdict: allowVerdict(),
        value: { workspaceId, base: 'main', path: p, committed: true, hunks: [] },
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

describe('POST /workspaces/:id/files/discard-hunks (route)', () => {
  const URL_PATH = '/api/conductor/workspaces/ws1/files/discard-hunks';

  it('400 VALIDATION_ERROR on a missing/unsafe path — the module is never touched', async () => {
    const calls: DiscardHunksCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      for (const p of [undefined, '', 42, '../evil', '-rf', '/etc/passwd']) {
        const res = await post(h.base, URL_PATH, { path: p, hunkIndexes: [0] });
        expect(res.status).toBe(400);
        expect(res.json?.error?.code).toBe('VALIDATION_ERROR');
      }
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('400 on bad hunkIndexes (empty / non-array / negative / non-integer / oversized)', async () => {
    const calls: DiscardHunksCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      const bad = [[], 'x', null, [-1], [1.5], ['0'], Array.from({ length: 201 }, (_, i) => i)];
      for (const hunkIndexes of bad) {
        const res = await post(h.base, URL_PATH, { path: 'a.txt', hunkIndexes });
        expect(res.status).toBe(400);
        expect(res.json?.error?.code).toBe('VALIDATION_ERROR');
      }
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('rejects an anonymous caller (authenticateMutating enforced)', async () => {
    const calls: DiscardHunksCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware({ anonymous: true }));
    try {
      const res = await post(h.base, URL_PATH, { path: 'a.txt', hunkIndexes: [0] });
      expect(res.status).toBe(401);
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('missing workspace is a truthful 404', async () => {
    const calls: DiscardHunksCall[] = [];
    const h = await serve(stubModule({ missing: true }, calls), makeMiddleware());
    try {
      const res = await post(h.base, '/api/conductor/workspaces/nope/files/discard-hunks', {
        path: 'a.txt',
        hunkIndexes: [0],
      });
      expect(res.status).toBe(404);
      expect(calls).toHaveLength(0);
    } finally {
      await h.close();
    }
  });

  it('drives module.discardWorkspaceHunks with the resolved principal and returns the view', async () => {
    const calls: DiscardHunksCall[] = [];
    const h = await serve(stubModule({}, calls), makeMiddleware());
    try {
      const res = await post(h.base, URL_PATH, { path: 'src/a.ts', hunkIndexes: [0, 2] });
      expect(res.status).toBe(200);
      expect(res.json?.data?.discard?.path).toBe('src/a.ts');
      expect(calls).toEqual([
        { workspaceId: 'ws1', path: 'src/a.ts', hunkIndexes: [0, 2], principal: PRINCIPAL },
      ]);
    } finally {
      await h.close();
    }
  });
});
