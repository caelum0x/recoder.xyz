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
import type { CheckRunnerPort, LocalCheckRun, OffboxCheckExecutorPort } from '../services/check-run.service.js';

/** A single check to run: a display name + an explicit argv (no shell). */
export interface CheckSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  /** Explicit repository opt-in for the Wave "Ask agent to fix" action. */
  readonly autofix?: boolean;
  /** Optional repo-owned context appended to Recoder's bounded fix prompt. */
  readonly fixPrompt?: string;
  /** Execute in the configured remote sandbox; never silently falls back local. */
  readonly execution?: 'local' | 'offbox';
  /** Optional exact argv run in the remote checkout before this check. */
  readonly prepare?: { readonly command: string; readonly args: readonly string[] };
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
  readonly offbox?: OffboxCheckExecutorPort;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_BUFFER = 4 * 1024 * 1024;
/** Cap repo-declared checks so a pathological config can't run unbounded commands. */
const MAX_CHECKS = 20;
const MAX_FIX_PROMPT = 1_000;

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
    const autofix = o.autofix === true;
    const fixPrompt = typeof o.fixPrompt === 'string'
      ? o.fixPrompt.trim().slice(0, MAX_FIX_PROMPT)
      : '';
    const execution = o.execution === 'offbox' ? 'offbox' : 'local';
    const prepareRow = o.prepare && typeof o.prepare === 'object' && !Array.isArray(o.prepare)
      ? o.prepare as Record<string, unknown>
      : null;
    const prepareCommand = typeof prepareRow?.command === 'string' ? prepareRow.command.trim() : '';
    const prepareArgs = Array.isArray(prepareRow?.args)
      ? prepareRow.args.filter((arg): arg is string => typeof arg === 'string')
      : [];
    out.push({
      name,
      command,
      args,
      ...(autofix ? { autofix: true } : {}),
      ...(autofix && fixPrompt ? { fixPrompt } : {}),
      ...(execution === 'offbox' ? { execution } : {}),
      ...(execution === 'offbox' && prepareCommand
        ? { prepare: { command: prepareCommand, args: prepareArgs } }
        : {}),
    });
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

/** Compose the exact, operator-visible continuation instruction for one check. */
export function autofixPromptFor(spec: CheckSpec): string | undefined {
  if (spec.autofix !== true) return undefined;
  const argv = [spec.command, ...spec.args].map(value => JSON.stringify(value)).join(' ');
  return [
    `Fix the failing Recoder check "${spec.name}" in this existing workspace.`,
    `Reproduce and verify it with this exact argv (do not use a shell string): ${argv}.`,
    'Make the smallest source change that resolves the failure. Do not merge, push, publish, or change the check definition.',
    ...(spec.fixPrompt ? [spec.fixPrompt] : []),
  ].join(' ');
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
  const autofixPrompt = autofixPromptFor(spec);
  const remediation = autofixPrompt ? { autofix: { prompt: autofixPrompt } } : {};
  try {
    const { stdout } = await exec.execFile(spec.command, [...spec.args], options);
    const detail = detailFrom(stdout);
    return { name: spec.name, status: 'pass', ...(detail ? { detail } : {}), ...remediation };
  } catch (err) {
    const e = err as { exitCode?: number; code?: number; stderr?: string; stdout?: string; message?: string };
    // A numeric exit code means the command RAN and exited non-zero ⇒ a failing check.
    if (typeof e.exitCode === 'number' || typeof e.code === 'number') {
      const detail = detailFrom(e.stderr) || detailFrom(e.stdout) || detailFrom(e.message);
      return { name: spec.name, status: 'fail', ...(detail ? { detail } : {}), ...remediation };
    }
    // Could not run at all (missing binary, timeout) ⇒ error (never a pass).
    return {
      name: spec.name,
      status: 'error',
      detail: detailFrom(e.message) || 'check could not run',
      ...remediation,
    };
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

  // Wave intentionally asks for the detailed Checks view and the folded
  // readiness view together. Share that one live execution so the same repo
  // command never runs twice merely because two read models consume it.
  const inFlight = new Map<string, Promise<readonly LocalCheckRun[]>>();

  const resolveChecks = async (workspaceId: string): Promise<{
    worktreePath: string;
    checks: readonly CheckSpec[];
  } | null> => {
    let workspace: Workspace | null = null;
    try {
      workspace = await deps.getWorkspace(workspaceId);
    } catch (err) {
      deps.logger.debug({ workspaceId, err }, 'check-runner: workspace lookup failed — skipped');
      return null;
    }
    if (!workspace?.worktreePath) return null;
    const repoChecks = parseCheckSpecs(await readWorktreeChecks(workspace.worktreePath));
    const checks = repoChecks.length > 0 ? repoChecks : deps.checks;
    return { worktreePath: workspace.worktreePath, checks };
  };

  const execute = async (workspaceId: string): Promise<readonly LocalCheckRun[]> => {
    const resolved = await resolveChecks(workspaceId);
    if (!resolved || resolved.checks.length === 0) return [];
    const runs: LocalCheckRun[] = [];
    const local = resolved.checks.filter(spec => spec.execution !== 'offbox');
    const remote = resolved.checks.filter(spec => spec.execution === 'offbox');
    for (const spec of local) {
      runs.push(await runOneCheck(spec, resolved.worktreePath, exec, timeoutMs));
    }
    if (remote.length > 0) {
      const workspace = await deps.getWorkspace(workspaceId).catch(() => null);
      if (!workspace || !deps.offbox) {
        runs.push(...remote.map(spec => ({
          name: spec.name,
          status: 'error' as const,
          detail: 'off-box check execution is unavailable',
        })));
      } else {
        runs.push(...await deps.offbox.run(workspace, remote, timeoutMs));
      }
    }
    return runs;
  };

  return {
    async run(workspaceId: string): Promise<readonly LocalCheckRun[]> {
      const active = inFlight.get(workspaceId);
      if (active) return active;
      const promise = execute(workspaceId);
      inFlight.set(workspaceId, promise);
      try {
        return await promise;
      } finally {
        if (inFlight.get(workspaceId) === promise) inFlight.delete(workspaceId);
      }
    },
    async runNamed(workspaceId: string, checkName: string): Promise<LocalCheckRun | null> {
      const name = checkName.trim();
      if (!name) return null;
      const resolved = await resolveChecks(workspaceId);
      if (!resolved) return null;
      const matches = resolved.checks.filter(spec => spec.name === name);
      // Duplicate names are not a safe remediation identity.
      if (matches.length !== 1) return null;
      const spec = matches[0]!;
      if (spec.execution !== 'offbox') return runOneCheck(spec, resolved.worktreePath, exec, timeoutMs);
      const workspace = await deps.getWorkspace(workspaceId).catch(() => null);
      if (!workspace || !deps.offbox) {
        return { name: spec.name, status: 'error', detail: 'off-box check execution is unavailable' };
      }
      return (await deps.offbox.run(workspace, [spec], timeoutMs))[0] ?? {
        name: spec.name,
        status: 'error',
        detail: 'off-box check returned no result',
      };
    },
  };
}
