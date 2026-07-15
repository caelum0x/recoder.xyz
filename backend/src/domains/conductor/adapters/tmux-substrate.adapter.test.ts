/**
 * tmux_worktree substrate adapter — config-injected, fake-exec driven.
 *
 * Proves (no real tmux/git on the box): a launch produces a truthful session
 * record (ref = workspaceId, deterministic session name + worktree under the
 * INJECTED worktreeRoot) and issues the `git worktree add` + `tmux new-session`
 * calls; a missing tmux binary reports `available:false` truthfully and makes
 * `launch()` refuse rather than fabricate a session; capture strips the dead-pane
 * banner; exitCode stays `undefined` (unknown) while the pane is alive and NEVER a
 * fabricated `0`.
 */
import { describe, it, expect } from 'vitest';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import { createTmuxSubstrate, type ExecFn } from './tmux-substrate.adapter.js';

interface Recorded {
  bin: string;
  args: string[];
  options?: ExecOptions;
}

interface FakeExecOptions {
  /** Return true to make the given invocation reject (missing binary / error). */
  readonly fail?: (bin: string, args: readonly string[]) => boolean;
  /** Provide stdout for a matching invocation (default empty). */
  readonly stdout?: (bin: string, args: readonly string[]) => string | undefined;
}

function makeExec(opts: FakeExecOptions = {}): { exec: ExecFn; calls: Recorded[] } {
  const calls: Recorded[] = [];
  const exec: ExecFn = async (bin, args, options) => {
    calls.push({ bin, args: [...args], ...(options ? { options } : {}) });
    if (opts.fail?.(bin, args)) throw new Error(`${bin} ${args.join(' ')} failed`);
    const stdout = opts.stdout?.(bin, args) ?? '';
    return { stdout, stderr: '', code: 0 } satisfies ExecResult;
  };
  return { exec, calls };
}

const CONFIG = { tmuxBin: null, worktreeRoot: '/tmp/recoder-worktrees-test' } as const;

const LAUNCH_INPUT = {
  workspaceId: 'ws_abc123',
  command: 'claude --headless',
  repoPath: '/repos/demo',
  branch: '',
  baseRef: 'HEAD',
};

describe('tmux_worktree substrate adapter', () => {
  it('reports available:true when git + tmux probes both succeed', async () => {
    const { exec } = makeExec();
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const avail = await sub.available();
    expect(avail.available).toBe(true);
    expect(avail.reason).toBeUndefined();
  });

  it('reports available:false with a truthful reason when tmux is missing', async () => {
    const { exec } = makeExec({ fail: (bin, args) => bin === 'tmux' && args[0] === '-V' });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const avail = await sub.available();
    expect(avail.available).toBe(false);
    expect(avail.reason).toMatch(/tmux/);
  });

  it('launch produces a truthful session record and issues worktree + new-session', async () => {
    const { exec, calls } = makeExec();
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    const handle = await sub.launch({ ...LAUNCH_INPUT, env: { RECODER_A2A_URL: 'http://x' } });

    // Session record: ref = workspaceId; deterministic name + worktree under the
    // INJECTED worktreeRoot (never process.env).
    expect(handle.ref).toBe('ws_abc123');
    expect(handle.sessionName).toBe('recoder-ws_abc123');
    expect(handle.worktreePath).toBe('/tmp/recoder-worktrees-test/recoder-ws_abc123');

    // The real isolation + session calls were issued.
    const worktreeAdd = calls.find((c) => c.bin === 'git' && c.args.includes('worktree') && c.args.includes('add'));
    expect(worktreeAdd?.args).toContain('/tmp/recoder-worktrees-test/recoder-ws_abc123');

    const newSession = calls.find((c) => c.bin === 'tmux' && c.args[0] === 'new-session');
    expect(newSession?.args).toContain('recoder-ws_abc123');
    expect(newSession?.args).toContain('claude --headless');
    // Injected env is forwarded on the new-session exec (never read from process.env).
    expect(newSession?.options?.env).toEqual({ RECODER_A2A_URL: 'http://x' });
  });

  it('launch refuses (throws) when the substrate is unavailable — never fabricates a session', async () => {
    const { exec, calls } = makeExec({ fail: (bin, args) => bin === 'tmux' && args[0] === '-V' });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    await expect(sub.launch(LAUNCH_INPUT)).rejects.toThrow(/unavailable/);
    // No new-session was ever issued for the refused launch.
    expect(calls.some((c) => c.bin === 'tmux' && c.args[0] === 'new-session')).toBe(false);
  });

  it('capture strips the dead-pane banner; returns null when the handle is gone', async () => {
    const banner = 'work output\nPane is dead (status 0, Tue Jun 30 01:23:01 2026)\n';
    const { exec } = makeExec({
      stdout: (bin, args) => (bin === 'tmux' && args[0] === 'capture-pane' ? banner : ''),
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const out = await sub.capture({ ref: 'ws_abc123', sessionName: 'recoder-ws_abc123' });
    expect(out).toBe('work output\n');

    const gone = createTmuxSubstrate({
      config: CONFIG,
      exec: makeExec({ fail: (bin, args) => bin === 'tmux' && args[0] === 'capture-pane' }).exec,
    });
    expect(await gone.capture({ ref: 'ws_gone' })).toBeNull();
  });

  it('exitCode is undefined (unknown) while the pane is alive, the code once dead', async () => {
    const paneDead = { value: '0' };
    const { exec } = makeExec({
      stdout: (bin, args) => {
        if (args.includes('#{pane_dead}')) return paneDead.value;
        if (args.includes('#{pane_dead_status}')) return '3';
        return '';
      },
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const handle = { ref: 'ws_abc123', sessionName: 'recoder-ws_abc123' };

    expect(await sub.exitCode!(handle)).toBeUndefined(); // alive → unknown, never 0
    paneDead.value = '1';
    expect(await sub.exitCode!(handle)).toBe(3); // dead → truthful code
  });
});
