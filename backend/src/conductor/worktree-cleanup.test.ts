/**
 * Tests for worktree-cleanup — disk reclamation + orphaned-session reaping.
 *
 * The module removes worktrees for TERMINAL workspaces whose path still exists on
 * disk, prunes git's worktree registry, and kills `recoder-*` tmux sessions that
 * have NO matching workspace record. The safety-critical property under test: it
 * must NEVER remove a worktree (or kill a session) that maps to a LIVE,
 * non-terminal workspace.
 *
 * This drives the REAL `cleanupStaleWorktrees` selection logic over the REAL
 * in-memory AgentOsRepository singleton. The ONLY things stubbed are the true
 * external-IO seams the module reaches: `node:child_process` execFile (git
 * worktree prune + tmux list/kill) and `node:fs` (existsSync/statSync/rmSync).
 * Those are replaced with in-memory fakes so the SELECTION logic — which paths
 * get removed, which sessions get killed — is asserted deterministically without
 * touching the real disk or a real tmux server. The cleanup logic + repo are
 * unstubbed. Mirrors conductor-locks.test.ts (injected engine).
 *
 * Skips on a Postgres driver rather than mutate a real database.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Workspace } from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';

const usingMemoryRepo = agentOsContainer.repositoryDriver === 'memory';

// ---- In-memory fakes for the external-IO seams, mutated per test ----

// Paths that "exist" on disk (existsSync true) and were removed (rmSync recorded).
const existingPaths = new Set<string>();
const removedPaths: string[] = [];
// Live tmux sessions reported by `tmux list-sessions`.
let liveTmuxSessions: string[] = [];
const killedSessions: string[] = [];
let gitPruneCalled = false;
// When true, the tmux server is unreachable (list-sessions throws).
let tmuxDown = false;

vi.mock('node:fs', async (importActual) => {
  const actual = await importActual<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: (p: string) => existingPaths.has(p),
    statSync: (p: string) => {
      if (!existingPaths.has(p)) throw new Error(`ENOENT: ${p}`);
      return { isDirectory: () => true, size: 4096 } as unknown as import('node:fs').Stats;
    },
    rmSync: (p: string) => {
      removedPaths.push(p);
      existingPaths.delete(p);
    },
  };
});

vi.mock('node:child_process', async (importActual) => {
  const actual = await importActual<typeof import('node:child_process')>();
  // Callback-style execFile so `promisify(execFile)` produces a working async fn.
  const execFile = (
    file: string,
    args: string[],
    optsOrCb: unknown,
    maybeCb?: unknown,
  ) => {
    const cb = (typeof optsOrCb === 'function' ? optsOrCb : maybeCb) as
      | ((err: Error | null, out?: { stdout: string; stderr: string }) => void)
      | undefined;
    const done = (err: Error | null, stdout = '') => cb?.(err, { stdout, stderr: '' });

    // git worktree prune
    if (args[0] === 'worktree' && args[1] === 'prune') {
      gitPruneCalled = true;
      return done(null, '');
    }
    // tmux list-sessions
    if (args.includes('list-sessions')) {
      if (tmuxDown) return done(new Error('no server running'));
      return done(null, liveTmuxSessions.join('\n') + '\n');
    }
    // tmux kill-session -t <name>
    if (args.includes('kill-session')) {
      const idx = args.indexOf('-t');
      const name = idx >= 0 ? args[idx + 1] : '';
      killedSessions.push(name);
      return done(null, '');
    }
    return done(null, '');
  };
  return { ...actual, execFile };
});

describe.skipIf(!usingMemoryRepo)('worktree-cleanup (real selection logic + faked IO seams)', () => {
  const repo = agentOsContainer.repository;
  let cleanupStaleWorktrees: typeof import('./worktree-cleanup.js').cleanupStaleWorktrees;

  beforeEach(async () => {
    existingPaths.clear();
    removedPaths.length = 0;
    killedSessions.length = 0;
    liveTmuxSessions = [];
    gitPruneCalled = false;
    tmuxDown = false;
    ({ cleanupStaleWorktrees } = await import('./worktree-cleanup.js'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function seedWorkspace(overrides: Partial<Workspace> = {}): Promise<Workspace> {
    const now = new Date().toISOString();
    const workspaceId = `ws_${randomUUID()}`;
    const ws: Workspace = {
      workspaceId,
      spaceId: 'space_cleanup',
      projectId: 'proj_cleanup',
      taskId: `task_${randomUUID()}`,
      runtimeId: 'claude_code',
      substrate: 'tmux_worktree',
      branch: 'recoder/cleanup-test',
      baseRef: 'HEAD',
      state: 'failed',
      createdBy: 'cleanup-test',
      createdAt: now,
      updatedAt: now,
      metadata: {},
      ...overrides,
    };
    return repo.upsertWorkspace(ws);
  }

  it('removes worktrees for terminal workspaces whose path exists on disk', async () => {
    const path = `/tmp/recoder-worktrees/term-${randomUUID()}`;
    existingPaths.add(path);
    const ws = await seedWorkspace({ state: 'failed', worktreePath: path });

    const report = await cleanupStaleWorktrees();

    expect(removedPaths).toContain(path);
    expect(report.orphansRemoved).toContain(ws.workspaceId);
    expect(report.pruned).toBeGreaterThanOrEqual(1);
    expect(report.gitPruned).toBe(true);
    expect(gitPruneCalled).toBe(true);
  });

  it('SAFETY: never removes a worktree mapped to a live non-terminal workspace', async () => {
    const livePath = `/tmp/recoder-worktrees/live-${randomUUID()}`;
    existingPaths.add(livePath);
    // A running workspace whose worktree very much exists on disk.
    await seedWorkspace({ state: 'running', worktreePath: livePath });

    await cleanupStaleWorktrees();

    // The live worktree is untouched even though its path exists.
    expect(removedPaths).not.toContain(livePath);
    expect(existingPaths.has(livePath)).toBe(true);
  });

  it('removes only the terminal worktree when a live and a terminal one coexist', async () => {
    const livePath = `/tmp/recoder-worktrees/live-${randomUUID()}`;
    const deadPath = `/tmp/recoder-worktrees/dead-${randomUUID()}`;
    existingPaths.add(livePath);
    existingPaths.add(deadPath);
    await seedWorkspace({ state: 'awaiting_review', worktreePath: livePath }); // non-terminal
    await seedWorkspace({ state: 'merged', worktreePath: deadPath }); // terminal

    await cleanupStaleWorktrees();

    expect(removedPaths).toContain(deadPath);
    expect(removedPaths).not.toContain(livePath);
  });

  it('skips terminal workspaces whose worktree no longer exists on disk', async () => {
    const gonePath = `/tmp/recoder-worktrees/gone-${randomUUID()}`;
    // NOT added to existingPaths -> existsSync false -> filtered out of `terminal`.
    await seedWorkspace({ state: 'cancelled', worktreePath: gonePath });

    const report = await cleanupStaleWorktrees();

    expect(removedPaths).not.toContain(gonePath);
    expect(report.orphansRemoved).not.toContain(gonePath);
  });

  it('SAFETY: kills only orphaned recoder-* sessions, never a known live session', async () => {
    const liveSession = `recoder-live-${randomUUID()}`;
    const orphanSession = `recoder-orphan-${randomUUID()}`;
    const foreignSession = `someone-else-${randomUUID()}`; // not recoder-* -> ignored
    liveTmuxSessions = [liveSession, orphanSession, foreignSession];

    // A NON-terminal workspace owns the live session -> it must survive.
    await seedWorkspace({ state: 'running', sessionName: liveSession });

    await cleanupStaleWorktrees();

    // Orphan (no matching workspace) is reaped.
    expect(killedSessions).toContain(orphanSession);
    // Known live session is NOT killed.
    expect(killedSessions).not.toContain(liveSession);
    // Non-recoder sessions are never touched.
    expect(killedSessions).not.toContain(foreignSession);
  });

  it('does not kill a recoder-* session that belongs to a TERMINAL workspace either', async () => {
    // A terminal workspace can still own a session name in the record; the reaper
    // matches against ALL workspace sessionNames (terminal included), so it is a
    // "known" session and must not be killed by the orphan-session sweep.
    const knownSession = `recoder-known-${randomUUID()}`;
    liveTmuxSessions = [knownSession];
    await seedWorkspace({ state: 'merged', sessionName: knownSession });

    await cleanupStaleWorktrees();

    expect(killedSessions).not.toContain(knownSession);
  });

  it('degrades safely when the tmux server is unreachable (no kills, still reports)', async () => {
    tmuxDown = true;
    const path = `/tmp/recoder-worktrees/term-${randomUUID()}`;
    existingPaths.add(path);
    await seedWorkspace({ state: 'failed', worktreePath: path });

    const report = await cleanupStaleWorktrees();

    // Worktree removal still happens; the tmux failure is swallowed.
    expect(removedPaths).toContain(path);
    expect(killedSessions).toHaveLength(0);
    expect(report.gitPruned).toBe(true);
  });
});
