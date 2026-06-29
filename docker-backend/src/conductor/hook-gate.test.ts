/**
 * Tests for the conductor hook gate — the in-process fusion of
 * @recoder/agent-hooks into the runtime launch path.
 *
 * These exercise the REAL in-process hook helpers (evaluatePreToolUse /
 * evaluatePostToolUse via gateLaunch / captureLaunchArtifact). Nothing is
 * stubbed — the secret scanner, path policy, and artifact capture are the
 * real package code.
 *
 * It also drives launchRuntime end-to-end to prove a secret-bearing launch is
 * gated (blocked) BEFORE any substrate is touched — no real agent spawns.
 */
import { describe, it, expect } from 'vitest';
import { gateLaunch, captureLaunchArtifact } from './hook-gate.js';
import { launchRuntime } from './runtime-driver.js';

const BASE = {
  workspaceId: 'ws_hookgate_test',
  taskId: 'task_hookgate',
  runId: 'run_hookgate',
  repoPath: '/tmp/recoder-hookgate-repo',
  branch: 'recoder/hookgate',
  runtimeId: 'claude_code',
  createdBy: 'tester',
};

describe('hook-gate gateLaunch (real in-process @recoder/agent-hooks)', () => {
  it('allows a benign launch', () => {
    const result = gateLaunch({
      ...BASE,
      commandLine: 'claude -p "implement the feature"',
      prompt: 'Implement the requested feature and add tests.',
    });
    expect(result.allowed).toBe(true);
    expect(result.blockedReason).toBeUndefined();
  });

  it('BLOCKS a secret-bearing write (prompt carries an API key)', () => {
    const result = gateLaunch({
      ...BASE,
      commandLine: 'claude -p "write config"',
      // A realistic OpenAI-style key embedded in the agent-controlled prompt.
      prompt: 'Write this into .env: OPENAI_API_KEY=sk-abcdEFGH1234567890abcdEFGH',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toMatch(/secret/i);
    expect(result.decision?.decision).toBe('block');
    // The redacted finding must NOT leak the raw key.
    const serialized = JSON.stringify(result.decision?.findings ?? []);
    expect(serialized).not.toContain('sk-abcdEFGH1234567890abcdEFGH');
  });

  it('BLOCKS a forbidden path target (.env)', () => {
    const result = gateLaunch({
      ...BASE,
      repoPath: '.env',
      commandLine: 'claude -p "edit env"',
      prompt: 'edit the env file',
    });
    expect(result.allowed).toBe(false);
    expect(result.blockedReason).toMatch(/forbidden/i);
  });

  it('degrades safe: a needs_approval command still allows the launch', () => {
    const result = gateLaunch({
      ...BASE,
      commandLine: 'git push origin main',
      prompt: 'push the branch',
    });
    // Dangerous command → needs_approval, but a sandboxed launch proceeds.
    expect(result.allowed).toBe(true);
  });
});

describe('hook-gate captureLaunchArtifact (real in-process artifact capture)', () => {
  it('captures a post-launch audit artifact with a stable key', () => {
    const artifact = captureLaunchArtifact({
      taskId: BASE.taskId,
      runId: BASE.runId,
      commandLine: 'claude -p "do work"',
      changedFiles: ['/tmp/recoder-hookgate-repo'],
    });
    expect(artifact).toBeDefined();
    expect(artifact?.key).toContain('post-tool-use');
    expect(artifact?.key).toContain(BASE.taskId);
  });
});

describe('launchRuntime is gated by the in-process hook (no spawn on block)', () => {
  it('returns blockedByPolicy for a secret-bearing prompt and never launches', async () => {
    const result = await launchRuntime({
      workspaceId: BASE.workspaceId,
      taskId: BASE.taskId,
      runId: BASE.runId,
      spaceId: 'space_test',
      projectId: 'project_test',
      runtimeId: 'claude_code',
      prompt: 'Save OPENAI_API_KEY=sk-abcdEFGH1234567890abcdEFGH to the repo',
      repoPath: BASE.repoPath,
      branch: BASE.branch,
      baseRef: 'HEAD',
      substrate: 'tmux_worktree',
      createdBy: BASE.createdBy,
    });

    // The launch must be blocked. Two valid truthful outcomes:
    //  - the runtime CLI is available → the hook gate blocks (blockedByPolicy)
    //  - the runtime CLI is NOT available on this host → availability fails first
    // In both cases the launch did NOT succeed and no agent spawned.
    expect(result.success).toBe(false);
    expect(result.handle).toBeUndefined();
    if (!/not available/i.test(result.error ?? '')) {
      // When availability passed, the block MUST be the policy gate.
      expect(result.blockedByPolicy).toBe(true);
      expect(result.error).toMatch(/hook policy/i);
    }
  });
});
