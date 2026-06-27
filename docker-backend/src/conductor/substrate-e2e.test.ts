/**
 * End-to-end substrate lifecycle test.
 *
 * Exercises the real substrate contract against a throwaway git repo + the
 * vendored tmux binary (skipped if tmux or git are not available on the box):
 *   launch → capture → alive → exitCode → diff → teardown
 *
 * This proves the full flow that a workspace goes through, minus only the
 * control-plane persistence (tested separately via the workspace-service tests).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const exec = promisify(execFile);

// Import the real substrate contract + the tmux substrate registration.
import { TMUX_BIN } from './tmux-path.js';
import { registerTmuxSubstrate } from './substrate-tmux.js';
import { getSubstrate, type SubstrateHandle } from './substrate.js';

// Ensure the tmux substrate is registered (idempotent).
registerTmuxSubstrate();

const hasTmux = existsSync(TMUX_BIN) || (await exec('command', ['-v', 'tmux'], { shell: '/bin/sh' }).then(() => true).catch(() => false));
const hasGit = (await exec('git', ['--version']).then(() => true).catch(() => false));

const shouldRun = hasTmux && hasGit;

describe.skipIf(!shouldRun)('substrate end-to-end lifecycle', { timeout: 30_000 }, () => {
  let repoDir: string;
  let worktreeRoot: string;
  let handle: SubstrateHandle;

  beforeAll(async () => {
    // Create a throwaway git repo with one commit.
    repoDir = mkdtempSync(path.join(tmpdir(), 'recoder-e2e-repo-'));
    worktreeRoot = mkdtempSync(path.join(tmpdir(), 'recoder-e2e-wt-'));
    process.env.CONDUCTOR_WORKTREE_ROOT = worktreeRoot;

    await exec('git', ['init', '-b', 'main'], { cwd: repoDir });
    await exec('git', ['config', 'user.email', 'test@recoder.xyz'], { cwd: repoDir });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    writeFileSync(path.join(repoDir, 'README.md'), '# test\n');
    await exec('git', ['add', '.'], { cwd: repoDir });
    await exec('git', ['commit', '-m', 'init'], { cwd: repoDir });
  });

  afterAll(() => {
    // Clean up worktrees + temp dirs.
    try { rmSync(worktreeRoot, { recursive: true, force: true }); } catch { /* */ }
    try { rmSync(repoDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('launches an agent session in an isolated worktree', async () => {
    const substrate = getSubstrate('tmux_worktree');
    handle = await substrate.launch({
      workspaceId: `e2e_test_${Date.now()}`,
      command: 'echo "hello from agent" && sleep 1 && exit 0',
      repoPath: repoDir,
      branch: 'e2e-test-branch',
      baseRef: 'HEAD',
    });
    expect(handle.sessionName).toBeTruthy();
    expect(handle.worktreePath).toBeTruthy();
    expect(existsSync(handle.worktreePath!)).toBe(true);
  });

  it('reports the session as alive while running', async () => {
    const substrate = getSubstrate('tmux_worktree');
    const alive = await substrate.alive(handle);
    expect(alive).toBe(true);
  });

  it('captures agent terminal output', async () => {
    const substrate = getSubstrate('tmux_worktree');
    // Wait for output to appear.
    await new Promise((r) => setTimeout(r, 500));
    const output = await substrate.capture(handle, 50);
    // Output may be null briefly; retry once.
    const text = output ?? (await new Promise<string | null>(async (resolve) => {
      await new Promise((r) => setTimeout(r, 500));
      resolve(await substrate.capture(handle, 50));
    }));
    expect(text).toBeTruthy();
  });

  it('detects exit code 0 (success) after the agent finishes', async () => {
    const substrate = getSubstrate('tmux_worktree');
    // Wait for the agent to finish (sleep 1 + exit 0).
    let alive = true;
    let code: number | null | undefined = undefined;
    for (let i = 0; i < 10 && alive; i++) {
      await new Promise((r) => setTimeout(r, 500));
      alive = await substrate.alive(handle);
      if (!alive && substrate.exitCode) {
        code = await substrate.exitCode(handle);
        break;
      }
    }
    expect(alive).toBe(false);
    // Exit code should be 0 (the agent exited cleanly).
    expect(code).toBe(0);
  });

  it('produces a diff against the base ref', async () => {
    const substrate = getSubstrate('tmux_worktree');
    // Write a file in the worktree to produce a diff.
    writeFileSync(path.join(handle.worktreePath!, 'new-file.txt'), 'new content\n');
    const diff = await substrate.diff(handle, 'HEAD');
    expect(diff.changedFiles).toBeGreaterThanOrEqual(1);
    expect(diff.untracked).toContain('new-file.txt');
  });

  it('tears down cleanly (kills session + removes worktree)', async () => {
    const substrate = getSubstrate('tmux_worktree');
    await substrate.teardown(handle, { removeIsolation: true });
    // Session should be gone.
    const alive = await substrate.alive(handle);
    expect(alive).toBe(false);
    // Worktree dir should be removed.
    expect(existsSync(handle.worktreePath!)).toBe(false);
  });
});

describe.skipIf(!shouldRun)('substrate exit-code detection (crash)', { timeout: 15_000 }, () => {
  let repoDir: string;

  beforeAll(() => {
    repoDir = mkdtempSync(path.join(tmpdir(), 'recoder-e2e-crash-'));
  });

  afterAll(() => {
    try { rmSync(repoDir, { recursive: true, force: true }); } catch { /* */ }
  });

  it('detects non-zero exit code when the agent crashes', async () => {
    // Reuse the main repo's worktree setup.
    await exec('git', ['init', '-b', 'main'], { cwd: repoDir });
    await exec('git', ['config', 'user.email', 'test@recoder.xyz'], { cwd: repoDir });
    await exec('git', ['config', 'user.name', 'Test'], { cwd: repoDir });
    writeFileSync(path.join(repoDir, 'README.md'), '# crash test\n');
    await exec('git', ['add', '.'], { cwd: repoDir });
    await exec('git', ['commit', '-m', 'init'], { cwd: repoDir });

    const substrate = getSubstrate('tmux_worktree');
    const handle = await substrate.launch({
      workspaceId: `e2e_crash_${Date.now()}`,
      command: 'echo "crashing now" && sleep 1 && exit 42',
      repoPath: repoDir,
      branch: 'crash-test',
      baseRef: 'HEAD',
    });

    // Wait for crash.
    let code: number | null | undefined = undefined;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const alive = await substrate.alive(handle);
      if (!alive && substrate.exitCode) {
        code = await substrate.exitCode(handle);
        break;
      }
    }
    expect(code).toBe(42);

    await substrate.teardown(handle, { removeIsolation: true });
  });
});
