/**
 * N-up per-file version read (A4) — `gatherFileVersions`: for ONE contested path,
 * EACH sibling's version of that file + the base version, so the desktop can render N
 * columns of the SAME file side by side. Reuse-only: it runs the SAME per-file reads
 * the synthesize probe does (`gatherContributorVersions` + `showFileAtRef`), inventing
 * no new git logic.
 *
 * Proves (real git): N siblings each return their own version and the base resolves; a
 * sibling that DELETED the path returns `content:null` + a truthful reason (never a
 * fabricated version); a sibling with no worktree returns `content:null` + reason; an
 * oversized version is bounded with `truncated:true`; an unknown path returns every
 * sibling truthfully null (no fabricated content); and an unsafe path is rejected
 * without reading anything.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { gatherFileVersions, MAX_ASSIST_FILE_BYTES, type ConvergeOpsDeps } from './converge.ops.js';

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

describe('gatherFileVersions (N-up per-file read, real git)', () => {
  let root: string;
  let repo: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-fileversions-'));
    repo = path.join(root, 'repo');
    mkdirSync(repo, { recursive: true });
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'shared.ts'), 'base-shared\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  /** Add a sibling worktree off main; `mutate`=undefined DELETES shared.ts. */
  function addSibling(id: string, mutate?: (p: string) => void): Workspace {
    const wt = path.join(root, id);
    git(repo, ['worktree', 'add', '-b', `agent-${id}`, wt, 'main']);
    if (mutate) {
      mutate(path.join(wt, 'shared.ts'));
    } else {
      rmSync(path.join(wt, 'shared.ts'));
    }
    return makeWs({ workspaceId: id, worktreePath: wt, branch: `agent-${id}` });
  }

  /** Deps whose `getWorkspace` resolves the given workspace records. */
  function deps(workspaces: readonly Workspace[]): ConvergeOpsDeps {
    const byId = new Map(workspaces.map((w) => [w.workspaceId, w]));
    return {
      compare: async () => ({ count: workspaces.length, siblings: [] }),
      getWorkspace: async (id) => byId.get(id) ?? null,
      registerWorkspace: async (ws) => ws,
      logger: noopLogger,
    };
  }

  function siblingsOf(...workspaces: Workspace[]): { workspaceId: string; agent: string }[] {
    return workspaces.map((w) => ({ workspaceId: w.workspaceId, agent: w.runtimeId }));
  }

  it('returns EACH of N siblings’ versions + the resolved base', async () => {
    const a = addSibling('ws-a', (p) => writeFileSync(p, 'shared-by-a\n'));
    const b = addSibling('ws-b', (p) => writeFileSync(p, 'shared-by-b\n'));
    const c = addSibling('ws-c', (p) => writeFileSync(p, 'shared-by-c\n'));

    const view = await gatherFileVersions(deps([a, b, c]), {
      siblings: siblingsOf(a, b, c),
      relPath: 'shared.ts',
    });

    expect(view.path).toBe('shared.ts');
    expect(view.base).toBe('base-shared\n'); // resolved from `git show main:shared.ts`
    expect(view.baseTruncated).toBeUndefined();
    expect(view.versions).toEqual([
      { workspaceId: 'ws-a', agent: 'claude_code', content: 'shared-by-a\n' },
      { workspaceId: 'ws-b', agent: 'claude_code', content: 'shared-by-b\n' },
      { workspaceId: 'ws-c', agent: 'claude_code', content: 'shared-by-c\n' },
    ]);
  });

  it('a sibling that DELETED the file → content:null + a truthful reason (never fabricated)', async () => {
    const a = addSibling('ws-a', (p) => writeFileSync(p, 'shared-by-a\n'));
    const b = addSibling('ws-b'); // deletes shared.ts

    const view = await gatherFileVersions(deps([a, b]), {
      siblings: siblingsOf(a, b),
      relPath: 'shared.ts',
    });

    expect(view.base).toBe('base-shared\n');
    expect(view.versions[0]).toEqual({ workspaceId: 'ws-a', agent: 'claude_code', content: 'shared-by-a\n' });
    expect(view.versions[1].content).toBeNull();
    expect(view.versions[1].reason).toContain('not present');
  });

  it('a sibling with NO worktree → content:null + a "no worktree" reason', async () => {
    const a = addSibling('ws-a', (p) => writeFileSync(p, 'shared-by-a\n'));
    const noTree = makeWs({ workspaceId: 'ws-x' }); // no worktreePath

    const view = await gatherFileVersions(deps([a, noTree]), {
      siblings: siblingsOf(a, noTree),
      relPath: 'shared.ts',
    });

    expect(view.versions[1].content).toBeNull();
    expect(view.versions[1].reason).toContain('worktree');
  });

  it('bounds an oversized version to the byte cap with truncated:true', async () => {
    const big = `${'x'.repeat(MAX_ASSIST_FILE_BYTES + 500)}\n`;
    const a = addSibling('ws-a', (p) => writeFileSync(p, big));
    const b = addSibling('ws-b', (p) => writeFileSync(p, 'small\n'));

    const view = await gatherFileVersions(deps([a, b]), {
      siblings: siblingsOf(a, b),
      relPath: 'shared.ts',
    });

    expect(view.versions[0].truncated).toBe(true);
    expect(Buffer.byteLength(view.versions[0].content ?? '', 'utf8')).toBeLessThanOrEqual(MAX_ASSIST_FILE_BYTES);
    // The small sibling is untouched (no truncated flag).
    expect(view.versions[1]).toEqual({ workspaceId: 'ws-b', agent: 'claude_code', content: 'small\n' });
  });

  it('an UNKNOWN path → every sibling truthfully null (no fabricated content)', async () => {
    const a = addSibling('ws-a', (p) => writeFileSync(p, 'shared-by-a\n'));
    const b = addSibling('ws-b', (p) => writeFileSync(p, 'shared-by-b\n'));

    const view = await gatherFileVersions(deps([a, b]), {
      siblings: siblingsOf(a, b),
      relPath: 'nope/never-existed.ts',
    });

    expect(view.path).toBe('nope/never-existed.ts');
    // Untracked at base ⇒ '' (showFileAtRef's empty-ancestor convention), not fabricated.
    expect(view.base).toBe('');
    expect(view.versions.every((v) => v.content === null)).toBe(true);
    expect(view.versions.every((v) => typeof v.reason === 'string')).toBe(true);
  });

  it('rejects an unsafe path without reading anything (no base, every sibling absent)', async () => {
    const a = addSibling('ws-a', (p) => writeFileSync(p, 'shared-by-a\n'));

    const view = await gatherFileVersions(deps([a]), {
      siblings: siblingsOf(a),
      relPath: '../escape.ts',
    });

    expect(view.base).toBeNull();
    expect(view.versions).toEqual([
      { workspaceId: 'ws-a', agent: 'claude_code', content: null, reason: 'unsafe path rejected' },
    ]);
  });

  it('base is null when NO sibling worktree resolves (nothing to git-show from)', async () => {
    const noTree = makeWs({ workspaceId: 'ws-x' });

    const view = await gatherFileVersions(deps([noTree]), {
      siblings: siblingsOf(noTree),
      relPath: 'shared.ts',
    });

    expect(view.base).toBeNull();
    expect(view.versions[0].content).toBeNull();
  });
});
