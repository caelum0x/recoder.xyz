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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  /**
   * Operator-configured fallback checks. Usually EMPTY — the checks are normally
   * declared PER-REPO in `<worktree>/.recoder/checks.json` (the repo owns its own
   * check allowlist, explicit argv, opt-in). Empty here + no repo config ⇒ inert.
   */
  readonly checks: readonly CheckSpec[];
  readonly logger: Logger;
  readonly exec?: CheckRunnerExec;
  /**
   * Read the per-repo check config from a worktree; `null` when absent/unreadable.
   * Defaults to reading `<worktree>/.recoder/checks.json`. Injectable for tests.
   */
  readonly readWorktreeChecks?: (worktreePath: string) => Promise<string | null>;
  /** Per-command deadline (default 120s). */
  readonly timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 4 * 1024 * 1024;
/** Cap repo-declared checks so a pathological config can't run unbounded commands. */
const MAX_CHECKS = 20;

/**
 * Parse `.recoder/checks.json` into check specs. PURE + defensive: a check needs a
 * non-empty name + command and an args array of strings; malformed entries are dropped,
 * the list is capped, and any parse error yields `[]` (never throws). This is the
 * security boundary — only the EXPLICIT argv a repo commits runs, never a shell string.
 */
export function parseCheckSpecs(json: string | null): readonly CheckSpec[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const arr = Array.isArray(parsed) ? parsed : Array.isArray((parsed as { checks?: unknown })?.checks) ? (parsed as { checks: unknown[] }).checks : [];
  const out: CheckSpec[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const name = typeof o.name === 'string' ? o.name.trim() : '';
    const command = typeof o.command === 'string' ? o.command.trim() : '';
    if (!name || !command) continue;
    const args = Array.isArray(o.args) ? o.args.filter((a): a is string => typeof a === 'string') : [];
    out.push({ name, command, args });
    if (out.length >= MAX_CHECKS) break;
  }
  return out;
}

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

/** Build the worktree check runner. Inert (`[]`) until a repo declares checks (or an operator default is set). */
export function createWorktreeCheckRunner(deps: CheckRunnerDeps): CheckRunnerPort {
  const exec: CheckRunnerExec = deps.exec ?? { execFile: (bin, args, options) => execFileSafe(bin, args, options) };
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const readWorktreeChecks =
    deps.readWorktreeChecks ??
    (async (worktreePath: string) =>
      readFile(join(worktreePath, '.recoder', 'checks.json'), 'utf8').catch(() => null));

  return {
    async run(workspaceId: string): Promise<readonly LocalCheckRun[]> {
      let workspace: Workspace | null = null;
      try {
        workspace = await deps.getWorkspace(workspaceId);
      } catch (err) {
        deps.logger.debug({ workspaceId, err }, 'check-runner: workspace lookup failed — skipped');
        return [];
      }
      if (!workspace?.worktreePath) return [];
      // PER-REPO checks (`.recoder/checks.json` in the worktree) win — the repo owns its
      // allowlist; the operator-configured `checks` is the fallback. Absent both ⇒ inert.
      const repoChecks = parseCheckSpecs(await readWorktreeChecks(workspace.worktreePath));
      const checks = repoChecks.length > 0 ? repoChecks : deps.checks;
      if (checks.length === 0) return [];
      const runs: LocalCheckRun[] = [];
      for (const spec of checks) {
        runs.push(await runOneCheck(spec, workspace.worktreePath, exec, timeoutMs));
      }
      return runs;
    },
  };
}
