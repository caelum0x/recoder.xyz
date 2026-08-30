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
import { describe, it, expect, vi } from 'vitest';
import os from 'node:os';
import nodePath from 'node:path';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  existsSync as fsExistsSync,
  rmSync as fsRmSync,
} from 'node:fs';
import type { ExecOptions, ExecResult, LoggerPort } from '@recoder/substrate';
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
  readonly stdout?: (
    bin: string,
    args: readonly string[]
  ) => string | undefined;
}

function makeExec(opts: FakeExecOptions = {}): {
  exec: ExecFn;
  calls: Recorded[];
} {
  const calls: Recorded[] = [];
  const exec: ExecFn = async (bin, args, options) => {
    calls.push({ bin, args: [...args], ...(options ? { options } : {}) });
    if (opts.fail?.(bin, args))
      throw new Error(`${bin} ${args.join(' ')} failed`);
    const stdout = opts.stdout?.(bin, args) ?? '';
    return { stdout, stderr: '', code: 0 } satisfies ExecResult;
  };
  return { exec, calls };
}

const CONFIG = {
  tmuxBin: null,
  worktreeRoot: '/tmp/recoder-worktrees-test',
} as const;

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
    const { exec } = makeExec({
      fail: (bin, args) => bin === 'tmux' && args[0] === '-V',
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const avail = await sub.available();
    expect(avail.available).toBe(false);
    expect(avail.reason).toMatch(/tmux/);
  });

  it('launch produces a truthful session record and issues worktree + new-session', async () => {
    const { exec, calls } = makeExec();
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    const handle = await sub.launch({
      ...LAUNCH_INPUT,
      env: { RECODER_A2A_URL: 'http://x' },
    });

    // Session record: ref = workspaceId; deterministic name + worktree under the
    // INJECTED worktreeRoot (never process.env).
    expect(handle.ref).toBe('ws_abc123');
    expect(handle.sessionName).toBe('recoder-ws_abc123');
    expect(handle.worktreePath).toBe(
      '/tmp/recoder-worktrees-test/recoder-ws_abc123'
    );

    // The real isolation + session calls were issued.
    const worktreeAdd = calls.find(
      c =>
        c.bin === 'git' && c.args.includes('worktree') && c.args.includes('add')
    );
    expect(worktreeAdd?.args).toContain(
      '/tmp/recoder-worktrees-test/recoder-ws_abc123'
    );

    const newSession = calls.find(
      c => c.bin === 'tmux' && c.args[0] === 'new-session'
    );
    expect(newSession?.args).toContain('recoder-ws_abc123');
    const launchedCommand = newSession?.args.at(-1) ?? '';
    expect(launchedCommand).toContain('( claude --headless )');
    expect(launchedCommand).toContain('.run-state/recoder-ws_abc123.exit');
    expect(launchedCommand).toContain('exit "$__recoder_exit_code"');
    // Injected env is forwarded on the new-session exec (never read from process.env).
    expect(newSession?.options?.env).toEqual({ RECODER_A2A_URL: 'http://x' });
  });

  it('launch refuses (throws) when the substrate is unavailable — never fabricates a session', async () => {
    const { exec, calls } = makeExec({
      fail: (bin, args) => bin === 'tmux' && args[0] === '-V',
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    await expect(sub.launch(LAUNCH_INPUT)).rejects.toThrow(/unavailable/);
    // No new-session was ever issued for the refused launch.
    expect(
      calls.some(c => c.bin === 'tmux' && c.args[0] === 'new-session')
    ).toBe(false);
  });

  it('refuses a false-zero new-session when the named tmux session never materializes', async () => {
    const { exec, calls } = makeExec({
      // macOS tmux can return zero from new-session after a denied socket create;
      // the authoritative follow-up probe then cannot find the session.
      fail: (bin, args) => bin === 'tmux' && args[0] === 'has-session',
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    await expect(sub.launch(LAUNCH_INPUT)).rejects.toThrow(
      /did not materialize after launch/
    );
    expect(
      calls.some(c => c.bin === 'tmux' && c.args[0] === 'new-session')
    ).toBe(true);
    expect(
      calls.some(
        c =>
          c.bin === 'git' &&
          c.args.includes('worktree') &&
          c.args.includes('remove') &&
          c.args.includes('--force')
      )
    ).toBe(true);
  });

  it('capture strips the dead-pane banner; returns null when the handle is gone', async () => {
    const banner =
      'work output\nPane is dead (status 0, Tue Jun 30 01:23:01 2026)\n';
    const { exec } = makeExec({
      stdout: (bin, args) =>
        bin === 'tmux' && args[0] === 'capture-pane' ? banner : '',
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    const out = await sub.capture({
      ref: 'ws_abc123',
      sessionName: 'recoder-ws_abc123',
    });
    expect(out).toBe('work output\n');

    const gone = createTmuxSubstrate({
      config: CONFIG,
      exec: makeExec({
        fail: (bin, args) => bin === 'tmux' && args[0] === 'capture-pane',
      }).exec,
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

  it('recovers the real exit code from the durable marker after tmux already vanished', async () => {
    const root = mkdtempSync(nodePath.join(os.tmpdir(), 'recoder-tmux-exit-'));
    try {
      const stateDir = nodePath.join(root, '.run-state');
      mkdirSync(stateDir, { recursive: true });
      writeFileSync(
        nodePath.join(stateDir, 'recoder-ws_fast.exit'),
        '17\n'
      );
      const { exec } = makeExec({
        fail: (bin, args) => bin === 'tmux' && args[0] === 'has-session',
      });
      const sub = createTmuxSubstrate({
        config: { tmuxBin: null, worktreeRoot: root },
        exec,
      });
      const handle = {
        ref: 'ws_fast',
        sessionName: 'recoder-ws_fast',
      };

      expect(await sub.alive(handle)).toBe(false);
      expect(await sub.exitCode!(handle)).toBe(17);
    } finally {
      fsRmSync(root, { recursive: true, force: true });
    }
  });

  it('never fabricates zero when tmux returns an invalid dead-pane status', async () => {
    const { exec } = makeExec({
      stdout: (bin, args) => {
        if (args.includes('#{pane_dead}')) return '1';
        if (args.includes('#{pane_dead_status}')) return 'not-a-status';
        return '';
      },
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });
    expect(
      await sub.exitCode!({
        ref: 'ws_invalid',
        sessionName: 'recoder-ws_invalid',
      })
    ).toBeUndefined();
  });

  // --- Git-hygiene safety (absorb herdr #6, clean-room) -------------------------

  it('launch checks out an EXISTING branch AS-IS (no -b/-B, no ref reset)', async () => {
    // Default fake exec resolves every call ⇒ the show-ref probe reports "exists".
    const { exec, calls } = makeExec();
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    await sub.launch({ ...LAUNCH_INPUT, branch: 'feat/keep-my-commits' });

    // A show-ref existence probe was issued for the fully-qualified ref.
    expect(
      calls.some(
        c =>
          c.bin === 'git' &&
          c.args.includes('show-ref') &&
          c.args.includes('refs/heads/feat/keep-my-commits')
      )
    ).toBe(true);

    const add = calls.find(
      c =>
        c.bin === 'git' && c.args.includes('worktree') && c.args.includes('add')
    );
    // NEVER a force-reset (`-B`) and NEVER a fresh-branch create (`-b`); the
    // existing branch is checked out with no base ref (no reset to a start point).
    expect(add?.args).not.toContain('-B');
    expect(add?.args).not.toContain('-b');
    expect(add?.args).toEqual([
      '-C',
      '/repos/demo',
      'worktree',
      'add',
      '/tmp/recoder-worktrees-test/recoder-ws_abc123',
      'feat/keep-my-commits',
    ]);
  });

  it('launch creates a FRESH branch with -b when it does not exist (never -B)', async () => {
    // Fail only the show-ref probe ⇒ "branch absent" (availability probes still pass).
    const { exec, calls } = makeExec({
      fail: (bin, args) => bin === 'git' && args.includes('show-ref'),
    });
    const sub = createTmuxSubstrate({ config: CONFIG, exec });

    await sub.launch({
      ...LAUNCH_INPUT,
      branch: 'feat/brand-new',
      baseRef: 'main',
    });

    const add = calls.find(
      c =>
        c.bin === 'git' && c.args.includes('worktree') && c.args.includes('add')
    );
    expect(add?.args).not.toContain('-B');
    expect(add?.args).toEqual([
      '-C',
      '/repos/demo',
      'worktree',
      'add',
      '-b',
      'feat/brand-new',
      '/tmp/recoder-worktrees-test/recoder-ws_abc123',
      'main',
    ]);
  });

  it('teardown (post-restart) removes a VERIFIED git worktree checkout', async () => {
    const root = mkdtempSync(
      nodePath.join(os.tmpdir(), 'recoder-wt-verified-')
    );
    try {
      const commonDir = nodePath.join(root, 'repo', '.git');
      const admin = nodePath.join(commonDir, 'worktrees', 'recoder-ws_v');
      const wtPath = nodePath.join(root, 'recoder-ws_v');
      mkdirSync(admin, { recursive: true });
      mkdirSync(wtPath, { recursive: true });
      // A genuine worktree checkout: `.git` FILE pointing INTO `<common>/worktrees/`.
      writeFileSync(nodePath.join(wtPath, '.git'), `gitdir: ${admin}\n`);

      // rev-parse --git-common-dir resolves to the shared common dir.
      const { exec } = makeExec({
        stdout: (bin, args) =>
          args.includes('--git-common-dir') ? commonDir : '',
      });
      const warn = vi.fn();
      const logger: LoggerPort = { info() {}, warn, error() {} };
      // Fresh substrate ⇒ empty repoByRef ⇒ the post-restart rm fallback path.
      const sub = createTmuxSubstrate({
        config: { tmuxBin: null, worktreeRoot: root },
        exec,
        logger,
      });

      await sub.teardown({
        ref: 'ws_v',
        worktreePath: wtPath,
        sessionName: 'recoder-ws_v',
      });

      expect(fsExistsSync(wtPath)).toBe(false); // verified → deleted
      expect(warn).not.toHaveBeenCalled();
    } finally {
      fsRmSync(root, { recursive: true, force: true });
    }
  });

  it('teardown (post-restart) SKIPS + logs when the path is not a verified worktree', async () => {
    const root = mkdtempSync(nodePath.join(os.tmpdir(), 'recoder-wt-user-'));
    try {
      const wtPath = nodePath.join(root, 'recoder-ws_u');
      mkdirSync(wtPath, { recursive: true });
      // A plain USER directory — NO `.git` gitdir pointer. Must never be rm'd.
      writeFileSync(nodePath.join(wtPath, 'important.txt'), 'do not delete');

      const { exec } = makeExec();
      const warn = vi.fn();
      const logger: LoggerPort = { info() {}, warn, error() {} };
      const sub = createTmuxSubstrate({
        config: { tmuxBin: null, worktreeRoot: root },
        exec,
        logger,
      });

      await sub.teardown({ ref: 'ws_u', worktreePath: wtPath });

      expect(fsExistsSync(wtPath)).toBe(true); // unverified → preserved
      expect(fsExistsSync(nodePath.join(wtPath, 'important.txt'))).toBe(true);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('not a verified git worktree checkout'),
        expect.objectContaining({ ref: 'ws_u', wtPath })
      );
    } finally {
      fsRmSync(root, { recursive: true, force: true });
    }
  });

  it('teardown (post-restart) SKIPS a checkout whose gitdir escapes the worktrees admin', async () => {
    const root = mkdtempSync(nodePath.join(os.tmpdir(), 'recoder-wt-escape-'));
    try {
      const commonDir = nodePath.join(root, 'repo', '.git');
      const wtPath = nodePath.join(root, 'recoder-ws_e');
      mkdirSync(commonDir, { recursive: true });
      mkdirSync(wtPath, { recursive: true });
      // `.git` points OUTSIDE `<common>/worktrees/` — a spoofed / unrelated pointer.
      writeFileSync(
        nodePath.join(wtPath, '.git'),
        `gitdir: ${nodePath.join(root, 'elsewhere', 'not-worktrees')}\n`
      );

      const { exec } = makeExec({
        stdout: (bin, args) =>
          args.includes('--git-common-dir') ? commonDir : '',
      });
      const warn = vi.fn();
      const logger: LoggerPort = { info() {}, warn, error() {} };
      const sub = createTmuxSubstrate({
        config: { tmuxBin: null, worktreeRoot: root },
        exec,
        logger,
      });

      await sub.teardown({ ref: 'ws_e', worktreePath: wtPath });

      expect(fsExistsSync(wtPath)).toBe(true); // gitdir escapes admin → preserved
      expect(warn).toHaveBeenCalled();
    } finally {
      fsRmSync(root, { recursive: true, force: true });
    }
  });
});
