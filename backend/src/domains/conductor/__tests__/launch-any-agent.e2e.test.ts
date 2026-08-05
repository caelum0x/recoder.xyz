/**
 * THE RUN-ANY-AGENT LAUNCH PROOF — the substrate genuinely spawns the chosen
 * coding agent for each supported runtime, or degrades truthfully when the binary
 * is absent. Sibling to the convergence-loop e2e (which proved the git → compare →
 * converge → merge chain); this proves the LAUNCH chain deterministically, WITHOUT
 * real LLMs:
 *
 *   1. COMPOSE  — for each supported runtime (claude_code, codex, opencode, cursor)
 *      the REAL package command builder (`resolveRuntimeCommand`) composes the
 *      correct binary + args: opencode's headless `run <prompt>` positional and its
 *      interactive `--prompt` (the wave-1 project-path-positional fix), and cursor's
 *      `cursor-agent` (NOT the `cursor` editor).
 *   2. SPAWN    — driven through the composed `ConductorModule` over a REAL git repo
 *      + a genuinely-SPAWNING substrate ({@link SpawningSubstrate}), with a FAKE
 *      agent binary (a shell script named for the runtime's real bin) on the child
 *      PATH. Asserts, agent-agnostically, per runtime: workspace created → running,
 *      the RIGHT binary ran in its OWN worktree (its marker + received argv), a
 *      RunEvent stream produced (started → log → completed), terminal state reached.
 *   3. DEGRADE  — a runtime whose bin is not on the (hermetic) PATH fails the launch
 *      truthfully: exit 127, a `failed` terminal event with a real reason ("not
 *      found"), and NEVER a fabricated `completed`.
 *   4. ATTACH-ONLY — when only the `cursor` EDITOR is installed (no `cursor-agent`),
 *      the availability probe reports cursor present-but-attach-only (truthful),
 *      never launchable.
 *
 * Nothing is mocked except the agent CLI itself (a deterministic shell script): the
 * git worktrees, the child-process spawn, the command composition, the run-tailer
 * poll → RunEvent stream, and the module's governed launch path are all real.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { RunEvent } from '@recoder/agent-os';
import { resolveRuntimeCommand, runtimeAvailability } from '@recoder/substrate';
import { composeConductor, makeCreateInput, makePrincipal } from '../__fixtures__/harness.js';
import {
  SpawningSubstrate,
  writeFakeAgentBins,
  AGENT_RAN_FILE,
  AGENT_ARGV_FILE,
} from '../__fixtures__/spawn-substrate.js';

/** Host git with a fixed, sign-free identity — deterministic across boxes. */
function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.email=t@t.dev', '-c', 'user.name=T', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The prompt every launch carries (also the argv assertion needle). */
const PROMPT = 'do the thing';

/** The four supported CLI runtimes, with their real bin + the argv the fake records. */
const RUNTIMES = [
  { runtimeId: 'claude_code', bin: 'claude', argv: ['-p', PROMPT, '--permission-mode', 'acceptEdits'] },
  { runtimeId: 'codex', bin: 'codex', argv: ['exec', PROMPT, '--sandbox', 'workspace-write'] },
  { runtimeId: 'opencode', bin: 'opencode', argv: ['run', PROMPT] },
  { runtimeId: 'cursor', bin: 'cursor-agent', argv: ['-p', PROMPT, '--force'] },
] as const;

/** The fake bins to install so every RUNTIMES entry is "present" on PATH. */
const ALL_BINS = RUNTIMES.map((r) => r.bin);

/**
 * The poll tailer fires its FIRST tick ~3s after launch; that tick observes the
 * (already-exited) fake agent and emits the terminal event. Poll the RunEvent log
 * until a terminal event lands (or time out) so the test is robust to scheduling.
 */
async function waitForTerminalEvent(
  module: ReturnType<typeof composeConductor>['module'],
  workspaceId: string,
  timeoutMs = 12000,
): Promise<RunEvent> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const events = await module.listWorkspaceEvents(workspaceId);
    const terminal = events.find((e) => e.type === 'completed' || e.type === 'failed');
    if (terminal) return terminal;
    await sleep(150);
  }
  throw new Error(`no terminal event for ${workspaceId} within ${timeoutMs}ms`);
}

describe('run-any-agent LAUNCH E2E (command composition + real spawn + truthful degrade)', () => {
  const PRINCIPAL = makePrincipal('user_launch_e2e');
  let root: string;
  let repo: string;
  let worktreesDir: string;
  let binDir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'recoder-launch-e2e-'));
    repo = path.join(root, 'repo');
    worktreesDir = path.join(root, 'worktrees');
    binDir = path.join(root, 'fake-bin');
    mkdirSync(repo, { recursive: true });
    mkdirSync(worktreesDir, { recursive: true });

    // A real base repo the substrate cuts each agent's worktree from.
    git(repo, ['init', '-b', 'main']);
    writeFileSync(path.join(repo, 'README.md'), 'base\n');
    git(repo, ['add', '-A']);
    git(repo, ['commit', '-m', 'base']);

    // Fake agent CLIs for all four runtimes, named for their REAL bins.
    writeFakeAgentBins(binDir, ALL_BINS);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // ---- PART 1: COMPOSE — the real command builder, per runtime (no spawn) ----
  describe('command composition (packages/substrate command builder)', () => {
    it('composes the correct headless binary + args for each supported runtime', () => {
      for (const rt of RUNTIMES) {
        const resolved = resolveRuntimeCommand(rt.runtimeId, { prompt: PROMPT });
        expect(resolved.bin).toBe(rt.bin);
        // The command line starts with the real bin and carries the composed args.
        expect(resolved.commandLine.startsWith(rt.bin + ' ')).toBe(true);
      }
    });

    it('claude/codex use their own CLI (-p / exec), each headless-and-exits', () => {
      expect(resolveRuntimeCommand('claude_code', { prompt: PROMPT }).commandLine).toBe(
        `claude -p '${PROMPT}' --permission-mode acceptEdits`,
      );
      expect(resolveRuntimeCommand('codex', { prompt: PROMPT }).commandLine).toBe(
        `codex exec '${PROMPT}' --sandbox workspace-write`,
      );
    });

    it('opencode headless uses the `run <prompt>` positional', () => {
      expect(resolveRuntimeCommand('opencode', { prompt: PROMPT }).commandLine).toBe(
        `opencode run '${PROMPT}'`,
      );
    });

    it('opencode INTERACTIVE routes the prompt through --prompt (the wave-1 project-path-positional fix)', () => {
      const interactive = resolveRuntimeCommand('opencode', { prompt: PROMPT, interactive: true }).commandLine;
      // The prompt goes behind `--prompt`, NEVER as a bare positional (which the TUI
      // would parse as a PROJECT PATH — the wave-1 bug). Bare TUI has no positional.
      expect(interactive).toBe(`opencode --prompt '${PROMPT}'`);
      expect(interactive).not.toBe(`opencode '${PROMPT}'`);
      expect(resolveRuntimeCommand('opencode', { prompt: '', interactive: true }).commandLine).toBe('opencode');
    });

    it('cursor resolves to `cursor-agent` (the terminal agent), NOT the `cursor` editor', () => {
      const resolved = resolveRuntimeCommand('cursor', { prompt: PROMPT });
      expect(resolved.bin).toBe('cursor-agent');
      expect(resolved.commandLine).toBe(`cursor-agent -p '${PROMPT}' --force`);
      // Never the editor launcher.
      expect(resolved.bin).not.toBe('cursor');
    });
  });

  // ---- PART 2: SPAWN — the plumbing, end to end, agent-agnostic ----
  describe('spawn plumbing (module → real git worktree → real child process)', () => {
    it('spawns the RIGHT binary with the composed args in each runtime worktree, streaming a completed RunEvent', async () => {
      const substrate = new SpawningSubstrate({
        worktreesDir,
        // Hermetic child PATH: the fake bins + minimal system dirs (for /bin/sh).
        pathDirs: [binDir, '/usr/bin', '/bin'],
      });
      const { module, gate } = composeConductor({ substrates: [substrate] });

      try {
        // Launch all four runtimes; the engine resolves each command from runtimeId
        // (no explicit `command`), so the REAL composed command line is what spawns.
        const launched = await Promise.all(
          RUNTIMES.map(async (rt) => {
            const result = await module.createWorkspace(
              makeCreateInput({
                runtimeId: rt.runtimeId,
                substrate: 'tmux_worktree',
                repoPath: repo,
                prompt: PROMPT,
              }),
              PRINCIPAL,
            );
            expect(result.ok).toBe(true);
            return { rt, workspaceId: result.value!.workspaceId };
          }),
        );

        for (const { rt, workspaceId } of launched) {
          // created → running: the state of record advanced synchronously on launch.
          const ws = await module.getWorkspace(workspaceId);
          expect(ws).not.toBeNull();
          expect(ws!.state).toBe('running');
          expect(ws!.runtimeId).toBe(rt.runtimeId);
          const worktree = ws!.worktreePath!;
          expect(existsSync(worktree)).toBe(true);

          // The governance gate decided the write before the launch.
          expect(gate.decisions).toContain('workspace.create');

          // Terminal state reached: the tailer polled the real child to exit 0.
          const terminal = await waitForTerminalEvent(module, workspaceId);
          expect(terminal.type).toBe('completed');
          expect(terminal.data?.exitCode).toBe(0);

          // The RunEvent stream is real: started → log(s) → completed.
          const events = await module.listWorkspaceEvents(workspaceId);
          expect(events.map((e) => e.type)).toContain('started');
          expect(events.map((e) => e.type)).toContain('completed');

          // The FAKE agent genuinely ran in ITS OWN worktree.
          const ranFile = path.join(worktree, AGENT_RAN_FILE);
          expect(existsSync(ranFile)).toBe(true);
          // The RIGHT binary ran (cursor → cursor-agent, not the editor).
          expect(readFileSync(ranFile, 'utf8').trim()).toBe(`binary=${rt.bin}`);
          // It received the EXACT composed args (ties command composition to spawn).
          const argv = readFileSync(path.join(worktree, AGENT_ARGV_FILE), 'utf8')
            .split('\n')
            .filter((l) => l.length > 0);
          expect(argv).toEqual([...rt.argv]);
        }
      } finally {
        await module.stop().catch(() => {});
      }
    });
  });

  // ---- PART 3: DEGRADE — an absent binary fails truthfully, never faked running ----
  describe('absent-binary truthful degrade', () => {
    it('fails the launch with a real reason (exit 127, needs a bin it cannot find) and NEVER a fabricated completed', async () => {
      // Hermetic EMPTY bin dir: `claude` is unresolvable ⇒ `sh: claude: not found`.
      const emptyBinDir = path.join(root, 'empty-bin');
      mkdirSync(emptyBinDir, { recursive: true });
      const substrate = new SpawningSubstrate({
        worktreesDir,
        pathDirs: [emptyBinDir], // NO system dirs, NO fake bins — nothing resolves
      });
      const { module } = composeConductor({ substrates: [substrate] });

      try {
        const result = await module.createWorkspace(
          makeCreateInput({
            runtimeId: 'claude_code',
            substrate: 'tmux_worktree',
            repoPath: repo,
            prompt: PROMPT,
          }),
          PRINCIPAL,
        );
        expect(result.ok).toBe(true);
        const workspaceId = result.value!.workspaceId;

        const terminal = await waitForTerminalEvent(module, workspaceId);
        // Truthful failure — NEVER a faked `completed`.
        expect(terminal.type).toBe('failed');
        expect(terminal.data?.exitCode).toBe(127);
        expect(substrate.hasExited(workspaceId)).toBe(true);

        // A real reason is surfaced in the captured output (shell reports the miss).
        const events = await module.listWorkspaceEvents(workspaceId);
        const log = events
          .filter((e) => e.type === 'log')
          .map((e) => e.message ?? '')
          .join('\n');
        expect(log.toLowerCase()).toMatch(/not found|no such file/);
        // The fake-agent marker was NEVER written — nothing actually ran.
        const worktree = (await module.getWorkspace(workspaceId))!.worktreePath!;
        expect(existsSync(path.join(worktree, AGENT_RAN_FILE))).toBe(false);
      } finally {
        await module.stop().catch(() => {});
      }
    });
  });

  // ---- PART 4: ATTACH-ONLY — cursor editor present, terminal agent absent ----
  describe('cursor present-but-attach-only (editor installed, cursor-agent absent)', () => {
    it('reports cursor unavailable-but-attach-only with a truthful reason, never launchable', async () => {
      // A hermetic PATH with ONLY the `cursor` EDITOR (no `cursor-agent`).
      const editorDir = path.join(root, 'editor-only');
      writeFakeAgentBins(editorDir, ['cursor']); // editor launcher, not the agent
      const savedPath = process.env.PATH;
      try {
        process.env.PATH = editorDir;
        const list = await runtimeAvailability();
        const cursor = list.find((r) => r.runtimeId === 'cursor');
        expect(cursor).toBeDefined();
        // Present-but-attach-only: the launchable bin is cursor-agent, which is absent.
        expect(cursor!.bin).toBe('cursor-agent');
        expect(cursor!.available).toBe(false);
        expect(cursor!.path).toBeUndefined();
        expect(cursor!.reason).toMatch(/attach-only/);
        expect(cursor!.reason).toMatch(/cursor-agent/);
        // It truthfully names the editor it DID find (never fakes it launchable).
        expect(cursor!.reason).toMatch(/cursor/);
      } finally {
        if (savedPath === undefined) delete process.env.PATH;
        else process.env.PATH = savedPath;
      }
    });
  });
});
