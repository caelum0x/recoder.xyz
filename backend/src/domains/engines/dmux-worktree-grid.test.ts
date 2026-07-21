/**
 * Tests for the additive `buildWorktreeGrid` verb on the dmux layout brain — the
 * critic's no-hollow-grid lock: EACH pane must be cwd'd to its OWN distinct sibling
 * worktree (via `new-session -c` + one `split-window -h -c <that worktree>` per
 * remaining sibling), NEVER a single shared cwd and NEVER empty panes. The tmux
 * exec surface is faked via a `node:child_process` mock so the exact command
 * sequence (and the per-split `-c` path) is asserted deterministically.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Shared, hoisted recorder + controllable tmux behaviour for the execFile mock.
const h = vi.hoisted(() => {
  const calls: { bin: string; args: readonly string[] }[] = [];
  const state = { hasSession: false, failEvery: false, listPanesStdout: '' };
  return { calls, state };
});

vi.mock('node:child_process', () => ({
  // Callback-style so `promisify(execFile)` wraps it into the awaited surface the
  // dmux adapter uses. The trailing arg is always the promisify callback.
  execFile: (bin: string, args: readonly string[], ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as (err: Error | null, out?: { stdout: string; stderr: string }) => void;
    h.calls.push({ bin, args });
    if (h.state.failEvery) {
      cb(new Error('tmux not found'));
      return;
    }
    const verb = args[0];
    if (verb === 'has-session') {
      if (h.state.hasSession) cb(null, { stdout: '', stderr: '' });
      else cb(new Error("can't find session"));
      return;
    }
    if (verb === 'list-panes') {
      cb(null, { stdout: h.state.listPanesStdout, stderr: '' });
      return;
    }
    if (verb === 'split-window') {
      cb(null, { stdout: '%9\n', stderr: '' });
      return;
    }
    cb(null, { stdout: '', stderr: '' });
  },
  spawn: () => ({ on() {}, unref() {}, pid: 1 }),
}));

// Import AFTER the mock is registered so the module binds the faked execFile.
const { dmuxBuildWorktreeGrid, createDmuxLayoutPort } = await import('./dmux-adapter.js');

const SESSION = 'recoder-group-g1';
const WORKTREES = [
  { workspaceId: 'ws-a', worktreePath: '/wt/a' },
  { workspaceId: 'ws-b', worktreePath: '/wt/b' },
  { workspaceId: 'ws-c', worktreePath: '/wt/c' },
];

/** The `-c` cwd immediately following the given verb in a recorded call. */
function cwdOf(call: { args: readonly string[] } | undefined): string | undefined {
  if (!call) return undefined;
  const idx = call.args.indexOf('-c');
  return idx >= 0 ? call.args[idx + 1] : undefined;
}

beforeEach(() => {
  h.calls.length = 0;
  h.state.hasSession = false;
  h.state.failEvery = false;
  h.state.listPanesStdout = '';
});

describe('dmuxBuildWorktreeGrid — worktree-bound (non-hollow) grid', () => {
  it('binds each pane to its OWN sibling worktree in order (never one shared cwd)', async () => {
    const result = await dmuxBuildWorktreeGrid({ session: SESSION, worktrees: WORKTREES });

    // 1. `new-session -d -s <session> -c <worktrees[0]>` — pane 0 bound to the FIRST worktree.
    const newSession = h.calls.find((c) => c.args[0] === 'new-session');
    expect(newSession).toBeDefined();
    expect(newSession!.args).toEqual(['new-session', '-d', '-s', SESSION, '-c', '/wt/a']);

    // 2. one `split-window -h -c <that worktree>` per REMAINING sibling, distinct cwds.
    const splits = h.calls.filter((c) => c.args[0] === 'split-window');
    expect(splits).toHaveLength(2);
    expect(cwdOf(splits[0])).toBe('/wt/b');
    expect(cwdOf(splits[1])).toBe('/wt/c');
    // The critic lock: the per-split cwds are DISTINCT worktrees, not one shared repoPath.
    expect(new Set(splits.map(cwdOf)).size).toBe(2);

    // `select-layout tiled` rebalances between splits.
    expect(h.calls.some((c) => c.args[0] === 'select-layout' && c.args.at(-1) === 'tiled')).toBe(true);

    // 3. the agent-grid layout is applied last (main-pane-width pin + main-vertical).
    expect(h.calls.some((c) => c.args[0] === 'set-window-option' && c.args.includes('main-pane-width'))).toBe(true);
    expect(h.calls.some((c) => c.args[0] === 'select-layout' && c.args.at(-1) === 'main-vertical')).toBe(true);

    // The audit surface proves the binding: worktreePaths == the ordered inputs.
    expect(result.worktreePaths).toEqual(['/wt/a', '/wt/b', '/wt/c']);
    expect(result.created).toBe(true);
    expect(result.layout).toBe('agent-grid');
    expect(result.session).toBe(SESSION);
  });

  it('is idempotent-ish: an existing session already holding N panes creates nothing', async () => {
    h.state.hasSession = true;
    // Three existing panes (>= 3 worktrees) — the session is already the full grid.
    h.state.listPanesStdout = ['%1|0|1|80|24|0|0|zsh|a', '%2|1|0|80|24|0|0|zsh|b', '%3|2|0|80|24|0|0|zsh|c'].join('\n');

    const result = await dmuxBuildWorktreeGrid({ session: SESSION, worktrees: WORKTREES });

    expect(h.calls.some((c) => c.args[0] === 'new-session')).toBe(false);
    expect(h.calls.some((c) => c.args[0] === 'split-window')).toBe(false);
    expect(result.created).toBe(false);
    // The binding proof is still the ordered inputs.
    expect(result.worktreePaths).toEqual(['/wt/a', '/wt/b', '/wt/c']);
  });
});

describe('DmuxLayoutPort.buildWorktreeGrid — truthful degrade', () => {
  it('maps a rejected tmux call to { ok:false } (never a throw across the seam)', async () => {
    h.state.failEvery = true;
    const port = createDmuxLayoutPort();
    const res = await port.buildWorktreeGrid({ session: SESSION, worktrees: WORKTREES });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('tmux_error');
  });

  it('rejects an empty worktree set (bad_input) — no hollow grid, no tmux call', async () => {
    const port = createDmuxLayoutPort();
    const res = await port.buildWorktreeGrid({ session: SESSION, worktrees: [] });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.code).toBe('bad_input');
    expect(h.calls).toHaveLength(0);
  });

  it('filters out siblings without a real worktreePath before binding', async () => {
    const port = createDmuxLayoutPort();
    const res = await port.buildWorktreeGrid({
      session: SESSION,
      worktrees: [
        { workspaceId: 'ws-a', worktreePath: '/wt/a' },
        { workspaceId: 'ws-x', worktreePath: '   ' },
        { workspaceId: 'ws-b', worktreePath: '/wt/b' },
      ],
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.value.worktreePaths).toEqual(['/wt/a', '/wt/b']);
  });
});
