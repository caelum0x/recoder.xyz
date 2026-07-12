/**
 * SSH substrate tests (design §11).
 *
 * Prove the durable-SSH `ssh` substrate against an INJECTED fake SshExecPort (no
 * real socket, no network) — mirrors the Daytona substrate test's runner
 * (node:test + a fake port):
 *   - provision + launch happy path returns a re-derivable handle and runs the
 *     agent inside a durable tmux session with a log + exit sentinel;
 *   - alive()/exitCode() read the `.recoder/agent.exit` sentinel and — critically
 *     — distinguish a transient/unreachable host from a finished one (a blip must
 *     NOT finalize a live remote workspace);
 *   - the DEGRADE path: unconfigured transport / unreachable host → truthful
 *     availability:false and never-throwing probes; a provisioning failure is
 *     surfaced truthfully instead of returning a fake handle.
 *
 * Runs under both the package runner (`node --test --import tsx`) and the
 * verify command (`pnpm -C packages/substrate exec vitest run <this file>` —
 * vitest executes the assertions but reports a suite-collection warning on
 * node:test files; the package's canonical runner is node:test).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSshSubstrate,
  createSshSubstrateFromEnv,
  readSshConfig,
  registerSshSubstrate,
  SubstrateRegistry,
} from '../../src/index.js';
import type {
  SshExecOptions,
  SshExecPort,
  SshExecResult,
  SubstrateHandle,
} from '../../src/index.js';

const CONFIG = {
  host: 'user@remote.example',
  repoPath: '/srv/repo',
  worktreeRoot: '/srv/worktrees',
};

const HANDLE: SubstrateHandle = {
  ref: 'recoder-ws1',
  worktreePath: '/srv/worktrees/ws1',
  sessionName: 'recoder-ws1',
};

const launchInput = (workspaceId: string) => ({
  workspaceId,
  command: "claude -p 'do the thing' --permission-mode acceptEdits",
  repoPath: '/local/repo',
  branch: `recoder/${workspaceId}`,
  baseRef: 'HEAD',
});

interface FakeOptions {
  configured?: boolean;
  /** Custom handler; defaults to a success (exit 0, empty output). */
  run?: (command: string, options?: SshExecOptions) => Promise<SshExecResult>;
}

/** A fully-controllable SshExecPort that records every command it is asked to run. */
function fakeExec(options: FakeOptions = {}): SshExecPort & { commands: string[] } {
  const commands: string[] = [];
  return {
    commands,
    isConfigured: () => options.configured ?? true,
    run: async (command, opts) => {
      commands.push(command);
      if (options.run) return options.run(command, opts);
      return { stdout: '', stderr: '', exitCode: 0 };
    },
  };
}

const ok = (stdout = ''): SshExecResult => ({ stdout, stderr: '', exitCode: 0 });

// --- identity + capabilities ---------------------------------------------

test('exposes id "ssh" and remote/pty/diff capabilities', () => {
  const s = createSshSubstrate({ exec: fakeExec(), config: CONFIG });
  assert.equal(s.id, 'ssh');
  const caps = s.capabilities();
  assert.equal(caps.remote, true);
  assert.equal(caps.supportsPty, true);
  assert.equal(caps.supportsInteractiveKeys, false);
  assert.equal(caps.capturesByPolling, true);
  assert.equal(caps.supportsDiff, true);
  assert.equal(caps.supportsIsolationRemoval, true);
});

// --- availability (degrade-safe gate) ------------------------------------

test('available() is false when the transport is not configured', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ configured: false }), config: CONFIG });
  const a = await s.available();
  assert.equal(a.available, false);
  assert.match(a.reason ?? '', /not configured/i);
});

test('available() is false (no host/repo) when config is empty', async () => {
  const s = createSshSubstrate({
    exec: fakeExec(),
    config: { host: '', repoPath: '', worktreeRoot: '' },
  });
  const a = await s.available();
  assert.equal(a.available, false);
  assert.match(a.reason ?? '', /not configured/i);
});

test('available() is true when the reachability probe succeeds', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok() }), config: CONFIG });
  const a = await s.available();
  assert.equal(a.available, true);
});

test('available() is false when the host answers with a non-zero probe', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => ({ stdout: '', stderr: '', exitCode: 255 }) }),
    config: CONFIG,
  });
  const a = await s.available();
  assert.equal(a.available, false);
  assert.match(a.reason ?? '', /unreachable/i);
});

test('available() is false WITHOUT throwing when the transport rejects (unreachable host)', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => { throw new Error('ssh: connect to host: Connection refused'); } }),
    config: CONFIG,
  });
  const a = await s.available();
  assert.equal(a.available, false);
  assert.match(a.reason ?? '', /connection refused/i);
});

// --- launch (provision + exec happy path) --------------------------------

test('launch() provisions a worktree + durable tmux session and returns a re-derivable handle', async () => {
  const exec = fakeExec({ run: async () => ok('launched') });
  const s = createSshSubstrate({ exec, config: CONFIG });
  const handle = await s.launch(launchInput('ws1'));

  assert.equal(handle.ref, 'recoder-ws1');
  assert.equal(handle.sessionName, 'recoder-ws1');
  assert.equal(handle.worktreePath, '/srv/worktrees/ws1');

  // First command provisions the worktree from the remote base repo.
  assert.match(exec.commands[0], /git -C '\/srv\/repo' worktree add -f -B 'recoder\/ws1' '\/srv\/worktrees\/ws1'/);
  assert.match(exec.commands[0], /mkdir -p/);
  // Second command launches inside a durable tmux session with log + sentinel.
  assert.match(exec.commands[1], /tmux new-session -d -s/);
  assert.match(exec.commands[1], /\.recoder\/agent\.exit/);
  assert.match(exec.commands[1], /\.recoder\/agent\.log/);
});

test('launch() checks out an explicit base ref when one is given', async () => {
  const exec = fakeExec();
  const s = createSshSubstrate({ exec, config: CONFIG });
  await s.launch({ ...launchInput('ws2'), baseRef: 'main' });
  assert.match(exec.commands[0], /worktree add -f -B 'recoder\/ws2' '\/srv\/worktrees\/ws2' 'main'/);
});

test('launch() surfaces a provisioning failure truthfully instead of faking a handle', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({
      run: async (cmd) =>
        cmd.includes('worktree add')
          ? { stdout: '', stderr: 'fatal: not a git repository', exitCode: 128 }
          : ok(),
    }),
    config: CONFIG,
  });
  await assert.rejects(() => s.launch(launchInput('ws3')), /provision failed/i);
});

test('launch() cleans up and surfaces a tmux launch failure', async () => {
  const removed: string[] = [];
  const s = createSshSubstrate({
    exec: fakeExec({
      run: async (cmd) => {
        if (cmd.includes('worktree add')) return ok();
        if (cmd.includes('tmux new-session')) return { stdout: '', stderr: 'no server', exitCode: 1 };
        if (cmd.includes('worktree remove')) { removed.push(cmd); return ok(); }
        return ok();
      },
    }),
    config: CONFIG,
  });
  await assert.rejects(() => s.launch(launchInput('ws4')), /tmux launch failed/i);
  assert.equal(removed.length, 1);
});

// --- alive()/exitCode() marker parsing -----------------------------------

test('alive() is false when the exit marker is present (finished)', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('__FINISHED__\n') }), config: CONFIG });
  assert.equal(await s.alive(HANDLE), false);
});

test('alive() is true when the marker is absent (running)', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('__RUNNING__\n') }), config: CONFIG });
  assert.equal(await s.alive(HANDLE), true);
});

test('alive() assumes alive (never finalizes) on a transient/unreachable probe error', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => { throw new Error('ECONNRESET'); } }),
    config: CONFIG,
  });
  assert.equal(await s.alive(HANDLE), true);
});

test('alive() assumes alive when no marker token comes back (garbled/transient)', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('') }), config: CONFIG });
  assert.equal(await s.alive(HANDLE), true);
});

test('exitCode() reads 0 from a clean-exit sentinel', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('__EXIT__0\n') }), config: CONFIG });
  assert.equal(await s.exitCode?.(HANDLE), 0);
});

test('exitCode() reads a non-zero failure code from the sentinel', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('__EXIT__137\n') }), config: CONFIG });
  assert.equal(await s.exitCode?.(HANDLE), 137);
});

test('exitCode() is undefined while still running (no sentinel yet)', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('__NONE__\n') }), config: CONFIG });
  assert.equal(await s.exitCode?.(HANDLE), undefined);
});

test('exitCode() is undefined (unknown, not fabricated 0) on a transient error', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => { throw new Error('host unreachable'); } }),
    config: CONFIG,
  });
  assert.equal(await s.exitCode?.(HANDLE), undefined);
});

// --- capture()/diff()/teardown() -----------------------------------------

test('capture() returns tailed log output', async () => {
  const s = createSshSubstrate({ exec: fakeExec({ run: async () => ok('line1\nline2\n') }), config: CONFIG });
  assert.equal(await s.capture(HANDLE), 'line1\nline2\n');
});

test('capture() returns null when the transport is gone', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => { throw new Error('gone'); } }),
    config: CONFIG,
  });
  assert.equal(await s.capture(HANDLE), null);
});

test('diff() runs git in the remote worktree and feeds the shared parser', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({
      run: async (cmd) => {
        if (cmd.includes('--stat')) return ok(' a.ts | 2 +-\n 1 file changed');
        if (cmd.includes('status --porcelain')) return ok('?? new.ts\n');
        return ok('diff --git a/a.ts b/a.ts\n');
      },
    }),
    config: CONFIG,
  });
  const diff = await s.diff(HANDLE, 'HEAD');
  assert.equal(diff.stat, 'a.ts | 2 +-\n 1 file changed');
  assert.match(diff.patch, /diff --git/);
  assert.deepEqual(diff.untracked, ['new.ts']);
  assert.ok(diff.changedFiles >= 1);
});

test('teardown() kills the tmux session and (opt) removes the worktree, never throwing', async () => {
  const exec = fakeExec();
  const s = createSshSubstrate({ exec, config: CONFIG });
  await s.teardown(HANDLE, { removeIsolation: true });
  assert.ok(exec.commands.some((c) => c.includes('tmux kill-session')));
  assert.ok(exec.commands.some((c) => c.includes('worktree remove')));
});

test('teardown() swallows transport failures (best effort)', async () => {
  const s = createSshSubstrate({
    exec: fakeExec({ run: async () => { throw new Error('already gone'); } }),
    config: CONFIG,
  });
  // Must not throw.
  await s.teardown(HANDLE, { removeIsolation: true });
});

// --- env gating (config-gated registration) ------------------------------

test('readSshConfig() returns null when host/repo env is absent', () => {
  assert.equal(readSshConfig({}), null);
  assert.equal(readSshConfig({ RECODER_SSH_HOST: 'h' }), null);
});

test('readSshConfig() derives a default worktree root from the repo path', () => {
  const cfg = readSshConfig({ RECODER_SSH_HOST: 'h', RECODER_SSH_REPO_PATH: '/srv/repo/' });
  assert.deepEqual(cfg, { host: 'h', repoPath: '/srv/repo', worktreeRoot: '/srv/repo-worktrees' });
});

test('createSshSubstrateFromEnv() returns null (never selectable) when unconfigured', () => {
  assert.equal(createSshSubstrateFromEnv({ exec: fakeExec(), env: {} }), null);
});

test('registerSshSubstrate() registers ssh ONLY when env is configured', () => {
  const registry = new SubstrateRegistry();
  assert.equal(registerSshSubstrate(registry, { exec: fakeExec(), env: {} }), null);
  assert.equal(registry.has('ssh'), false);

  const registered = registerSshSubstrate(registry, {
    exec: fakeExec(),
    env: { RECODER_SSH_HOST: 'user@h', RECODER_SSH_REPO_PATH: '/srv/repo' },
  });
  assert.equal(registered?.id, 'ssh');
  assert.equal(registry.has('ssh'), true);
});
