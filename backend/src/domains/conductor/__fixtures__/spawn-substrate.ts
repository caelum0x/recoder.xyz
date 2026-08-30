/**
 * A DETERMINISTIC, real-SPAWN test substrate for the end-to-end LAUNCH proof.
 *
 * Where {@link RealGitSubstrate} applies a *declared* mutation (the agent's work
 * is handed in on the env), this substrate proves the SPAWN PLUMBING itself: it
 * cuts a real `git worktree`, then genuinely SPAWNS the resolved runtime command
 * line (`claude -p … / codex exec … / opencode run … / cursor-agent -p …`) as a
 * child process inside that worktree — exactly what the production tmux substrate
 * does, minus tmux. No LLM is involved: a FAKE agent binary (a tiny shell script
 * on the child's PATH, named for the runtime's real bin) stands in for the CLI,
 * records the argv it actually received, writes a deterministic marker file, and
 * exits. So the test can assert the RIGHT binary ran with the RIGHT composed args
 * in the RIGHT worktree, agent-agnostically.
 *
 * The child PATH is fully hermetic (only the dirs the test supplies) so a runtime
 * whose fake bin is absent fails truthfully (`sh: <bin>: not found`, exit 127) —
 * a launch is NEVER faked as running. This file carries no `*.test.ts` name, so
 * vitest ignores it.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, mkdirSync, writeFileSync } from 'node:fs';
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

/** Marker file a fake agent writes into its worktree cwd (proves it RAN there). */
export const AGENT_RAN_FILE = '.recoder-agent-ran';
/** File a fake agent writes its received argv into, one arg per line. */
export const AGENT_ARGV_FILE = '.recoder-agent-argv';

/**
 * Write a fake agent binary for each `name` into `dir` (executable). Each one
 * records `binary=<name>` + its argv into the cwd, then exits 0 — a deterministic
 * stand-in for a real coding-agent CLI. Uses only POSIX-sh builtins so the child
 * needs nothing but `/bin/sh` (node's shell spawn) on any host.
 */
export function writeFakeAgentBins(dir: string, names: readonly string[]): void {
  mkdirSync(dir, { recursive: true });
  for (const name of names) {
    const script = `#!/bin/sh
printf 'binary=%s\\n' '${name}' > ${AGENT_RAN_FILE}
: > ${AGENT_ARGV_FILE}
for arg in "$@"; do printf '%s\\n' "$arg" >> ${AGENT_ARGV_FILE}; done
exit 0
`;
    const file = path.join(dir, name);
    writeFileSync(file, script);
    chmodSync(file, 0o755);
  }
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

interface SpawnRun {
  alive: boolean;
  exitCode: number | null;
  worktreePath: string;
  output: string;
  child: ChildProcess;
}

export interface SpawningSubstrateOptions {
  readonly id?: WorkspaceSubstrate;
  /** Directory the sibling worktrees are created under (a test temp dir). */
  readonly worktreesDir: string;
  /**
   * The EXACT PATH the spawned agent sees (hermetic — no host PATH leaks). Put the
   * fake-agent-bin dir here to make a runtime "present"; omit it to make the
   * runtime's real bin unresolvable so the launch degrades truthfully (exit 127).
   */
  readonly pathDirs: readonly string[];
  /** Preserve host credentials/config for an explicitly requested live-CLI proof. */
  readonly inheritEnv?: boolean;
  /** Additional fixed environment for every spawned run (for example an isolated runtime home). */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * A real, spawning `ConductorSubstrate` backed by genuine git worktrees. `launch`
 * cuts the worktree and SPAWNS `input.command` inside it; `alive`/`exitCode`
 * reflect the true child-process state (never a fabricated 0 while running). The
 * run-tailer polls these to drive the `started → log → completed/failed` stream.
 */
export class SpawningSubstrate implements ConductorSubstrate {
  readonly id: WorkspaceSubstrate;
  readonly #worktreesDir: string;
  readonly #path: string;
  readonly #inheritEnv: boolean;
  readonly #env: Readonly<Record<string, string>>;
  readonly #runs = new Map<string, SpawnRun>();

  constructor(options: SpawningSubstrateOptions) {
    this.id = options.id ?? 'tmux_worktree';
    this.#worktreesDir = options.worktreesDir;
    this.#path = options.pathDirs.join(path.delimiter);
    this.#inheritEnv = options.inheritEnv ?? false;
    this.#env = options.env ?? {};
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

  #spawnRun(
    workspaceId: string,
    worktreePath: string,
    command: string,
    extraEnv: Readonly<Record<string, string>> = {},
  ): SpawnRun {
    const child = spawn(command, {
      cwd: worktreePath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...(this.#inheritEnv ? process.env : {}),
        ...this.#env,
        ...extraEnv,
        PATH: this.#path,
      },
    });
    const run: SpawnRun = { alive: true, exitCode: null, worktreePath, output: '', child };
    child.stdout?.on('data', (d: Buffer) => {
      run.output += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      run.output += d.toString();
    });
    child.on('exit', (code) => {
      run.alive = false;
      // A signal-only exit is failure/termination, never a fabricated success.
      run.exitCode = code ?? 1;
    });
    child.on('error', (err) => {
      run.alive = false;
      run.exitCode = 127;
      run.output += `spawn error: ${err.message}\n`;
    });
    this.#runs.set(workspaceId, run);
    return run;
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

    // Genuinely SPAWN the resolved runtime command inside the worktree. The child
    // PATH is hermetic (only the supplied dirs) so an absent fake bin fails
    // truthfully; node's `shell:true` invokes `/bin/sh -c` via an absolute path,
    // so the shell runs regardless of PATH and reports "not found" for a missing bin.
    const run = this.#spawnRun(input.workspaceId, wt, input.command, input.env);

    return {
      ref: input.workspaceId,
      worktreePath: wt,
      sessionName: `sess-${input.workspaceId}`,
    };
  }

  async capture(handle: SubstrateHandle): Promise<string | null> {
    const run = this.#runs.get(handle.ref);
    if (!run) return null;
    // Return the real accumulated output; fall back to a lifecycle line before any
    // output is captured so the tailer still emits a truthful `log` marker.
    return run.output.length > 0 ? run.output : `$ run ${handle.ref}\n`;
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

  async diff(handle: SubstrateHandle, baseRef?: string): Promise<SubstrateDiff> {
    const wt = handle.worktreePath;
    if (!wt) return { stat: '', patch: '', untracked: [], changedFiles: 0 };
    const base = baseRef || 'HEAD';
    const stat = git(wt, ['diff', '--stat', base]);
    const patch = git(wt, ['diff', base]);
    const numstat = git(wt, ['diff', '--numstat', base]);
    const changedFiles = numstat.split('\n').filter((l) => l.trim().length > 0).length;
    return { stat, patch, untracked: [], changedFiles };
  }

  async teardown(handle: SubstrateHandle): Promise<void> {
    const run = this.#runs.get(handle.ref);
    if (run?.alive) run.child.kill('SIGTERM');
    // Keep the worktree for assertions/evidence (the launch proof reads it).
  }

  async continueRun(
    handle: SubstrateHandle,
    input: ContinueRunInput,
  ): Promise<SubstrateHandle> {
    if (!input.command) throw new Error('process-worktree continuation requires a command');
    this.#spawnRun(input.workspaceId, input.worktreePath, input.command);
    return {
      ref: handle.ref,
      worktreePath: input.worktreePath,
      sessionName: handle.sessionName ?? handle.ref,
    };
  }

  /** Test-only: has the spawned run for a workspace exited yet? */
  hasExited(workspaceId: string): boolean {
    const run = this.#runs.get(workspaceId);
    return Boolean(run && !run.alive);
  }
}
