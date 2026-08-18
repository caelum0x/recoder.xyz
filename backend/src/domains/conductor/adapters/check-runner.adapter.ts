/**
 * `createWorktreeCheckRunner` — the concrete {@link CheckRunnerPort} (recoder-fxee) that
 * actually RUNS Recoder's own checks (tests / typecheck / lint / build) for a workspace,
 * so the readiness `checks` signal reflects THIS change's real result instead of only
 * mirroring GitHub's rollup. It runs an OPT-IN, explicit allowlist of commands inside the
 * workspace worktree through the same bounded exec seam the conductor already trusts
 * (mirroring MergeabilityService / WorktreeStatusService).
 *
 * Degrade-truthful throughout — it NEVER throws and NEVER fabricates a pass:
 *  - no configured checks ⇒ `[]` (the readiness fold stays GitHub-only);
 *  - no worktree / a failed workspace lookup ⇒ `[]`;
 *  - a command that exits 0 ⇒ `pass`; a command that ran but exited non-zero ⇒ `fail`
 *    (a real failing check → a hard readiness block); a command that could not run at all
 *    (missing bin, timeout) ⇒ `error` (still not a pass).
 * Each command is bounded so a hung check can never stall the readiness edge, and the
 * allowlist is EXPLICIT (no shell, argv only) so the runner cannot execute arbitrary
 * agent-controlled input.
 */
import { execFileSafe } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { CheckRunnerPort, LocalCheckRun } from '../services/check-run.service.js';

/** A single check to run: a display name + an explicit argv (no shell). */
export interface CheckSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
}

/** The injected exec surface — defaults to the real substrate helper; a test seam. */
export interface CheckRunnerExec {
  execFile: (bin: string, args: readonly string[], options: ExecOptions) => Promise<ExecResult>;
}

export interface CheckRunnerDeps {
  readonly getWorkspace: (id: string) => Promise<Workspace | null>;
  /** The checks to run. EMPTY ⇒ the runner is inert (opt-in). */
  readonly checks: readonly CheckSpec[];
  readonly logger: Logger;
  readonly exec?: CheckRunnerExec;
  /** Per-command deadline (default 120s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 4 * 1024 * 1024;

/** First non-empty line of some output, truncated — a compact, safe detail. */
export function detailFrom(text: unknown): string {
  if (typeof text !== 'string') return '';
  const line = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0) ?? '';
  return line.slice(0, 200);
}

/**
 * Run ONE check in the worktree and map its outcome. PURE given the injected exec:
 * exit 0 ⇒ pass; a non-zero exit (the command carries an `exitCode`/`code`) ⇒ fail;
 * anything else (could not spawn) ⇒ error. Never throws.
 */
export async function runOneCheck(
  spec: CheckSpec,
  worktreePath: string,
  exec: CheckRunnerExec,
  timeoutMs: number,
): Promise<LocalCheckRun> {
  const options: ExecOptions = { cwd: worktreePath, timeoutMs, maxBuffer: MAX_BUFFER };
  try {
    const { stdout } = await exec.execFile(spec.command, [...spec.args], options);
    const detail = detailFrom(stdout);
    return { name: spec.name, status: 'pass', ...(detail ? { detail } : {}) };
  } catch (err) {
    const e = err as { exitCode?: number; code?: number; stderr?: string; stdout?: string; message?: string };
    // A numeric exit code means the command RAN and exited non-zero ⇒ a failing check.
    if (typeof e.exitCode === 'number' || typeof e.code === 'number') {
      const detail = detailFrom(e.stderr) || detailFrom(e.stdout) || detailFrom(e.message);
      return { name: spec.name, status: 'fail', ...(detail ? { detail } : {}) };
    }
    // Could not run at all (missing binary, timeout) ⇒ error (never a pass).
    return { name: spec.name, status: 'error', detail: detailFrom(e.message) || 'check could not run' };
  }
}

/** Build the worktree check runner. Inert (`[]`) until checks are configured. */
export function createWorktreeCheckRunner(deps: CheckRunnerDeps): CheckRunnerPort {
  const exec: CheckRunnerExec = deps.exec ?? { execFile: (bin, args, options) => execFileSafe(bin, args, options) };
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return {
    async run(workspaceId: string): Promise<readonly LocalCheckRun[]> {
      if (deps.checks.length === 0) return [];
      let workspace: Workspace | null = null;
      try {
        workspace = await deps.getWorkspace(workspaceId);
      } catch (err) {
        deps.logger.debug({ workspaceId, err }, 'check-runner: workspace lookup failed — skipped');
        return [];
      }
      if (!workspace?.worktreePath) return [];
      const runs: LocalCheckRun[] = [];
      for (const spec of deps.checks) {
        runs.push(await runOneCheck(spec, workspace.worktreePath, exec, timeoutMs));
      }
      return runs;
    },
  };
}
