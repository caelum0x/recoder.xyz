/**
 * A DETERMINISTIC, real-git test substrate for the end-to-end convergence proof.
 *
 * Unlike {@link FakeSubstrate} (which returns in-memory diffs), this substrate is a
 * fully-functional `ConductorSubstrate` whose `launch` cuts a REAL `git worktree`
 * off the task base, applies a caller-declared, per-sibling deterministic mutation
 * (the stand-in for an agent's work — NO LLM), and commits it on the sibling branch.
 * The compare / converge / merge edges then run their real host `git` against these
 * worktrees, so the full product loop is exercised with genuine git artifacts.
 *
 * The mutation is carried on the launch ENV (`RECODER_TEST_MUTATION`, a JSON
 * {@link SubstrateMutation}) so the substrate stays stateless and each sibling's
 * change is declared at `createWorkspace` time — exactly the seam a real launch
 * threads env through. This file carries no `*.test.ts` name, so vitest ignores it.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import type {
  ConductorSubstrate,
  ContinueRunInput,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateDiff,
  SubstrateHandle,
  SubstrateLaunchInput,
} from '@recoder/substrate';
import type { WorkspaceSubstrate } from '@recoder/agent-os';

/** The launch-env key the substrate reads its per-sibling mutation from. */
export const MUTATION_ENV = 'RECODER_TEST_MUTATION';

/** A deterministic sibling change: files to (over)write + files to delete. */
export interface SubstrateMutation {
  /** repo-relative path → full file content (created or overwritten). */
  readonly write?: Readonly<Record<string, string>>;
  /** repo-relative paths to delete (models a sibling that removed a base file). */
  readonly delete?: readonly string[];
}

/** Serialize a mutation for the launch env (the value must be a plain string). */
export function encodeMutation(mutation: SubstrateMutation): string {
  return JSON.stringify(mutation);
}

/** Run host git with a fixed identity, no signing — deterministic across boxes. */
function git(cwd: string, args: string[]): string {
  return execFileSync(
    'git',
    [
      '-c',
      'user.email=agent@recoder.dev',
      '-c',
      'user.name=Recoder Test Agent',
      '-c',
      'commit.gpgsign=false',
      ...args,
    ],
    { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
}

interface RealRun {
  alive: boolean;
  exitCode: number | null;
  worktreePath: string;
}

export interface RealGitSubstrateOptions {
  readonly id?: WorkspaceSubstrate;
  /** Directory the sibling worktrees are created under (a test temp dir). */
  readonly worktreesDir: string;
}

/**
 * A real, fully-functional in-memory-run-tracking `ConductorSubstrate` backed by
 * genuine git worktrees. Runs are keyed by `workspaceId` (the ref the engine + run
 * tailer poll with), and stay ALIVE until {@link finish} is called — so a test
 * controls exactly when a run completes (compare/converge run while runs are live).
 */
export class RealGitSubstrate implements ConductorSubstrate {
  readonly id: WorkspaceSubstrate;
  readonly #worktreesDir: string;
  readonly #runs = new Map<string, RealRun>();

  constructor(options: RealGitSubstrateOptions) {
    this.id = options.id ?? 'tmux_worktree';
    this.#worktreesDir = options.worktreesDir;
  }

  capabilities(): SubstrateCapabilities {
    return {
      remote: false,
      supportsPty: true,
      supportsInteractiveKeys: true,
      capturesByPolling: true,
      supportsDiff: true,
      supportsIsolationRemoval: true,
    };
  }

  async available(): Promise<SubstrateAvailability> {
    return { available: true };
  }

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const wt = path.join(this.#worktreesDir, input.workspaceId);
    // Cut a real worktree off the resolved base (branch is engine-assigned + unique).
    git(input.repoPath, [
      'worktree',
      'add',
      '-b',
      input.branch,
      wt,
      input.baseRef || 'HEAD',
    ]);

    // Apply the sibling's declared deterministic change (the "agent's work"), then
    // COMMIT it on the branch so `git diff <base>` sees added/modified/deleted files
    // (untracked-only would be invisible to the review diff the compare edge uses).
    const raw = input.env?.[MUTATION_ENV];
    if (raw) {
      const mutation = JSON.parse(raw) as SubstrateMutation;
      for (const [rel, content] of Object.entries(mutation.write ?? {})) {
        const abs = path.join(wt, rel);
        mkdirSync(path.dirname(abs), { recursive: true });
        writeFileSync(abs, content);
      }
      for (const rel of mutation.delete ?? []) {
        rmSync(path.join(wt, rel), { force: true });
      }
      git(wt, ['add', '-A']);
      const status = git(wt, ['status', '--porcelain']).trim();
      if (status.length > 0) {
        git(wt, ['commit', '-m', `agent work: ${input.workspaceId}`]);
      }
    }

    // Ref = workspaceId so the engine + poll tailer's handle (keyed on workspaceId)
    // resolves the SAME run; the run stays alive until finish() flips it.
    this.#runs.set(input.workspaceId, {
      alive: true,
      exitCode: null,
      worktreePath: wt,
    });
    return {
      ref: input.workspaceId,
      worktreePath: wt,
      sessionName: `sess-${input.workspaceId}`,
    };
  }

  /** Test-only: finish a run with a truthful exit code (drives tailer completion). */
  finish(workspaceId: string, exitCode = 0): void {
    const run = this.#runs.get(workspaceId);
    if (!run) throw new Error(`real-git run not found: ${workspaceId}`);
    run.alive = false;
    run.exitCode = exitCode;
  }

  /** Test-only: finish every live run (cleanup so the poll tailer self-stops). */
  finishAll(exitCode = 0): void {
    for (const run of this.#runs.values()) {
      run.alive = false;
      run.exitCode = exitCode;
    }
  }

  async capture(handle: SubstrateHandle): Promise<string | null> {
    return this.#runs.has(handle.ref) ? `$ run ${handle.ref}\n` : null;
  }

  async alive(handle: SubstrateHandle): Promise<boolean> {
    return this.#runs.get(handle.ref)?.alive ?? false;
  }

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = this.#runs.get(handle.ref);
    if (!run) return null; // gone
    if (run.alive) return undefined; // NEVER a fabricated 0 while running
    return run.exitCode;
  }

  async diff(
    handle: SubstrateHandle,
    baseRef?: string,
  ): Promise<SubstrateDiff> {
    const wt = handle.worktreePath;
    if (!wt) return { stat: '', patch: '', untracked: [], changedFiles: 0 };
    const base = baseRef || 'HEAD';
    const stat = git(wt, ['diff', '--stat', base]);
    const patch = git(wt, ['diff', base]);
    const numstat = git(wt, ['diff', '--numstat', base]);
    const changedFiles = numstat.split('\n').filter(l => l.trim().length > 0).length;
    return { stat, patch, untracked: [], changedFiles };
  }

  async teardown(): Promise<void> {
    // Keep the worktree for review (the merge edge reads it). No isolation removal.
  }

  async continueRun(
    handle: SubstrateHandle,
    input: ContinueRunInput,
  ): Promise<SubstrateHandle> {
    const run = this.#runs.get(handle.ref);
    if (run) run.alive = true;
    return {
      ref: handle.ref,
      worktreePath: input.worktreePath,
      sessionName: handle.sessionName ?? handle.ref,
    };
  }
}
