/**
 * in_process substrate — local git worktree + an agent driven IN-PROCESS by
 * `@recoder/runtime`.
 *
 * The third Conductor substrate, ADDITIVE and OPT-IN: instead of a tmux session
 * (tmux_worktree) or a remote sandbox (daytona), each workspace gets an isolated
 * git worktree and the agent runs in the backend process via the real
 * `@recoder/runtime` engine (`createRuntime().adapterFor(surface)` →
 * `AgentRuntimeAdapter.sendTask`). No tmux, no child CLI, no remote sandbox.
 *
 * Selection is solely per-workspace via `Workspace.substrate === 'in_process'`; the
 * default remains `tmux_worktree`. This substrate is NEVER selected implicitly, so
 * the proven tmux launch path is untouched.
 *
 * Truthful availability: reports available only when the runtime engine resolves an
 * adapter for the requested surface AND `git` is present (worktrees require it).
 * Run state is real: capture returns the buffered agent output, alive/exitCode are
 * derived from the actual terminal RunEvent (`completed` → 0, `failed` → 1), and
 * diff is a real `git diff` over the worktree.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import type { RunEvent } from '@recoder/agent-os';
import type { RuntimeTaskInput } from '@recoder/runtime';
import { createRuntime, type Runtime } from '@recoder/runtime';
import { createLogger } from '../logger';
import {
  registerSubstrate,
  type ConductorSubstrate,
  type SubstrateDiff,
  type SubstrateHandle,
  type SubstrateLaunchInput,
} from './substrate.js';
import { resolveOssDispatch } from './oss-dispatch.js';

const exec = promisify(execFile);
const logger = createLogger('conductor:in-process');

const WORKTREE_ROOT = process.env.CONDUCTOR_WORKTREE_ROOT || '/tmp/recoder-worktrees';
const DEFAULT_SURFACE = 'recoder_code';

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', ['-C', cwd, ...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout;
}

/** Live state of an in-process run, keyed by workspace id (handle.ref). */
type InProcessRun = {
  workspaceId: string;
  worktreePath: string;
  /** Buffered agent text/log output, newest appended (for capture). */
  output: string[];
  /** undefined while running; 0 on completed; 1 on failed/cancelled. */
  exitCode: number | undefined;
  done: boolean;
  /** AbortController so teardown can stop a still-running agent. */
  abort: AbortController;
  /** The consumer task (kept so teardown can await/settle it). */
  task: Promise<void>;
};

const runs = new Map<string, InProcessRun>();

function pushOutput(run: InProcessRun, line: string): void {
  run.output.push(line);
  // Bound the buffer so a long run cannot grow memory unbounded.
  if (run.output.length > 2000) {
    run.output.splice(0, run.output.length - 2000);
  }
}

/** Render a minimal-but-real RuntimeTaskInput from the launch input. */
function buildTaskInput(input: SubstrateLaunchInput, surface: string): RuntimeTaskInput {
  const now = new Date().toISOString();
  const prompt = input.prompt?.trim() || input.command;
  return {
    task: {
      taskId: `ws_${input.workspaceId}`,
      title: `Conductor in-process workspace ${input.workspaceId}`,
      intent: 'feature_delivery',
      goal: prompt,
      spaceId: 'conductor',
      repo: input.repoPath,
      branchPolicy: 'reuse_branch',
      targetPaths: [],
      forbiddenPaths: [],
      acceptanceCriteria: [],
      verification: { commands: [] },
      approvalRequired: [],
      artifactRequired: [],
    },
    bundle: {
      bundleId: `ws_${input.workspaceId}`,
      taskId: `ws_${input.workspaceId}`,
      agentId: surface,
      runtime: surface,
      sharedGoal: prompt,
      acceptanceCriteria: [],
      verificationCommands: [],
      forbiddenActions: [],
      approvalGateIds: [],
      memoryRefIds: [],
      sourceRefs: [],
      compilerVersion: 'conductor-in-process',
      compiledAt: now,
      renderedPrompt: prompt,
    },
    policy: {
      requireSignedEnvelope: false,
      enforceWorkLocks: false,
      allowNetwork: true,
      allowShell: true,
      approvalMode: 'auto',
    },
  };
}

/** Fold a RunEvent into the run's buffered output + terminal state. */
function consumeEvent(run: InProcessRun, event: RunEvent): void {
  if (event.message) {
    pushOutput(run, event.message);
  }
  if (event.type === 'completed') {
    run.exitCode = 0;
    run.done = true;
  } else if (event.type === 'failed') {
    run.exitCode = 1;
    run.done = true;
  }
}

/** The runtime engine is built once and reused across workspaces. */
let sharedRuntime: Runtime | undefined;
function runtime(): Runtime {
  if (!sharedRuntime) {
    sharedRuntime = createRuntime();
  }
  return sharedRuntime;
}

const inProcessSubstrate: ConductorSubstrate = {
  id: 'in_process',

  async available() {
    // git is required for the worktree; the runtime engine must resolve the surface.
    try {
      await exec('git', ['--version']);
    } catch {
      return { available: false, reason: 'git not available (in-process substrate needs worktrees)' };
    }
    try {
      const adapter = runtime().adapterFor(DEFAULT_SURFACE);
      const health = await adapter.health();
      if (health.status === 'offline' || health.status === 'error') {
        return { available: false, reason: `runtime ${DEFAULT_SURFACE} unavailable: ${health.message ?? health.status}` };
      }
      return { available: true };
    } catch (err) {
      return { available: false, reason: err instanceof Error ? err.message : 'runtime engine unavailable' };
    }
  },

  async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const surface = input.runtimeId || DEFAULT_SURFACE;
    const worktreePath = path.join(WORKTREE_ROOT, `inproc-${input.workspaceId}`);

    // Isolated worktree on its own branch — parallel agents never collide.
    await exec('git', [
      '-C', input.repoPath, 'worktree', 'add', '-B', input.branch, worktreePath, input.baseRef || 'HEAD',
    ]);

    const adapter = runtime().adapterFor(surface);
    const abort = new AbortController();
    const run: InProcessRun = {
      workspaceId: input.workspaceId,
      worktreePath,
      output: [],
      exitCode: undefined,
      done: false,
      abort,
      task: Promise.resolve(),
    };
    runs.set(input.workspaceId, run);

    // OSS DISPATCH BOUNDARY (@recoder/agent-oss): when this workspace targets an
    // OSS execution framework (runtimeId === langgraph / crewai / browser-use /
    // e2b / ...), translate the launch through the agent-oss boundary FIRST so
    // the OSS surface inherits a canonical, Recoder-owned task mapping + policy
    // decision. Recoder still owns the run record + RunEvents; the OSS engine is
    // a replaceable surface. Degrade-safe: any failure logs and falls through to
    // the proven @recoder/runtime path below — an OSS dispatch error never blocks
    // the launch.
    try {
      const prompt = input.prompt?.trim() || input.command;
      const oss = resolveOssDispatch({
        workspaceId: input.workspaceId,
        runtimeId: surface,
        repoPath: input.repoPath,
        branch: input.branch,
        prompt,
      });
      if (oss) {
        pushOutput(
          run,
          `[oss-dispatch] ${oss.profile.displayName} (${oss.profile.adapterId}) — canonical mapping ` +
            `task=${oss.mapping.taskId} ownsCanonicalState=${oss.profile.ownsCanonicalState}`,
        );
        logger.info(
          {
            workspaceId: input.workspaceId,
            ossAdapter: oss.profile.adapterId,
            provider: oss.profile.provider,
            taskId: oss.mapping.taskId,
          },
          'in-process workspace dispatched through @recoder/agent-oss boundary',
        );
      }
    } catch (err) {
      logger.warn(
        { workspaceId: input.workspaceId, surface, err: err instanceof Error ? err.message : String(err) },
        'oss-dispatch boundary failed; falling back to default in-process runtime path',
      );
    }

    const taskInput = buildTaskInput(input, surface);
    // Drive the agent in-process. The engine resolves the cwd via process.cwd by
    // default; we run the consumer in a task that pins terminal state truthfully.
    run.task = (async () => {
      try {
        for await (const event of adapter.sendTask(taskInput)) {
          if (abort.signal.aborted) break;
          consumeEvent(run, event);
        }
      } catch (err) {
        pushOutput(run, `in-process run error: ${err instanceof Error ? err.message : String(err)}`);
        if (run.exitCode === undefined) run.exitCode = 1;
        run.done = true;
      } finally {
        if (run.exitCode === undefined) {
          // Stream ended without a terminal event — treat as finished (no fake 0).
          run.exitCode = abort.signal.aborted ? 1 : 0;
        }
        run.done = true;
      }
    })();

    logger.info({ workspaceId: input.workspaceId, surface, worktreePath }, 'in-process workspace launched');
    return { ref: input.workspaceId, worktreePath, sessionName: input.workspaceId };
  },

  async capture(handle: SubstrateHandle, lines = 200): Promise<string | null> {
    const run = runs.get(handle.ref);
    if (!run) return null;
    return run.output.slice(-lines).join('\n');
  },

  async alive(handle: SubstrateHandle): Promise<boolean> {
    const run = runs.get(handle.ref);
    if (!run) return false;
    return !run.done;
  },

  async exitCode(handle: SubstrateHandle): Promise<number | null | undefined> {
    const run = runs.get(handle.ref);
    if (!run) return null; // handle entirely gone
    if (!run.done) return undefined; // still running
    return run.exitCode ?? 0;
  },

  async diff(handle: SubstrateHandle, baseRef: string): Promise<SubstrateDiff> {
    const cwd = handle.worktreePath ?? runs.get(handle.ref)?.worktreePath;
    if (!cwd) throw new Error('in_process diff requires a worktree path');
    const base = baseRef || 'HEAD';
    const [stat, patch, status] = await Promise.all([
      git(cwd, ['--no-pager', 'diff', '--stat', base]),
      git(cwd, ['--no-pager', 'diff', base]),
      git(cwd, ['status', '--porcelain']),
    ]);
    const untracked = status
      .split('\n')
      .filter((line) => line.startsWith('??'))
      .map((line) => line.slice(3).trim())
      .filter(Boolean);
    const changedFiles =
      stat.trim().split('\n').filter((l) => l.includes('|')).length + untracked.length;
    return { stat: stat.trim(), patch, untracked, changedFiles };
  },

  async teardown(handle: SubstrateHandle, options?: { removeIsolation?: boolean }): Promise<void> {
    const run = runs.get(handle.ref);
    if (run) {
      run.abort.abort();
      // Best-effort settle so we don't leak a dangling async iterator.
      await run.task.catch(() => {});
    }
    const worktreePath = handle.worktreePath ?? run?.worktreePath;
    if (worktreePath && options?.removeIsolation !== false) {
      // Remove the worktree via the repo it was attached to (git resolves the link).
      await exec('git', ['-C', worktreePath, 'worktree', 'remove', '--force', worktreePath]).catch(async () => {
        // Fallback: prune from the main repo if the in-worktree call cannot resolve.
        await exec('rm', ['-rf', worktreePath]).catch(() => {});
      });
    }
    runs.delete(handle.ref);
  },
};

/** Register the in-process substrate (call once at startup). Opt-in via Workspace.substrate. */
export function registerInProcessSubstrate(): void {
  registerSubstrate(inProcessSubstrate);
}

/** Test/inspection helper: number of live in-process runs (no live state leaks across teardown). */
export function inProcessRunCount(): number {
  return runs.size;
}
