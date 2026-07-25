/**
 * PrChecksService — the workspace's per-check PR rollup (`GET
 * /workspaces/:id/checks`), a SIBLING of `pr-status.service.ts` on the same
 * injected `gh` exec seam (see `github-status.adapter.ts` for the pattern).
 *
 * Where pr-status folds `statusCheckRollup` into aggregate counts, this edge
 * surfaces the INDIVIDUAL checks (`name`/`status`/`conclusion`) plus the PR's
 * `mergeable` + `reviewDecision`, by running — inside the workspace worktree so
 * `gh` resolves the current branch's PR itself —
 *
 *   gh pr view --json statusCheckRollup,mergeable,reviewDecision
 *
 * Degrade-truthful throughout — it NEVER throws and NEVER fabricates:
 *  - no worktree / no `gh` on PATH ⇒ `available:false` with a truthful reason;
 *  - the worktree's `origin` remote is not github.com ⇒ `available:false`
 *    ("gh cannot resolve a PR for a non-GitHub remote");
 *  - `gh` is installed but not authenticated ⇒ `available:false` naming auth;
 *  - the branch has no PR ⇒ `available:false, reason: 'no pull request …'`.
 * Probes are bounded so a hung `gh` can never stall the edge.
 */
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import { isNoPrError } from './pr-status.service.js';

/** Local probe (`git remote get-url`) — short. */
const REMOTE_PROBE_TIMEOUT_MS = 3_000;
/** `gh pr view` talks to the GitHub API — allow it longer than a local probe. */
const PR_VIEW_TIMEOUT_MS = 6_000;
const PR_VIEW_MAX_BUFFER = 4 * 1024 * 1024;

/** The JSON fields requested from `gh pr view` (the fixed API contract). */
const CHECKS_FIELDS = 'statusCheckRollup,mergeable,reviewDecision';

/** One status check, as reported by gh (strings kept verbatim, '' when absent). */
export interface WorkspaceCheckRow {
  readonly name: string;
  readonly status: string;
  readonly conclusion: string;
}

/** The `GET /workspaces/:id/checks` payload. */
export interface WorkspaceChecksView {
  /** Whether gh could resolve a PR for the branch at all. */
  readonly available: boolean;
  /** Truthful reason when unavailable (never a fabricated success). */
  readonly reason?: string;
  readonly mergeable?: string;
  readonly reviewDecision?: string;
  readonly checks?: readonly WorkspaceCheckRow[];
}

/** The exec surface the service probes with — injectable for tests. */
export interface PrChecksExec {
  execFile: (
    bin: string,
    args: readonly string[],
    options: ExecOptions
  ) => Promise<ExecResult>;
  which: (bin: string) => Promise<string | undefined>;
}

export interface PrChecksServiceDeps {
  readonly logger: Logger;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: PrChecksExec;
}

const defaultExec: PrChecksExec = {
  execFile: (bin, args, options) => execFileSafe(bin, args, options),
  which,
};

/** Does the gh failure mean "not authenticated" (vs. no PR / network)? */
function isAuthError(err: ExecError): boolean {
  const text = `${err.message}\n${err.stderr}`.toLowerCase();
  return (
    text.includes('gh auth login') ||
    text.includes('not logged in') ||
    text.includes('authentication')
  );
}

/** Map one `statusCheckRollup` entry (CheckRun OR StatusContext) to a row. */
function toCheckRow(entry: unknown): WorkspaceCheckRow | null {
  if (entry === null || typeof entry !== 'object') return null;
  const e = entry as Record<string, unknown>;
  // CheckRun shape: name + status + conclusion.
  if (typeof e.name === 'string') {
    return {
      name: e.name,
      status: typeof e.status === 'string' ? e.status : '',
      conclusion: typeof e.conclusion === 'string' ? e.conclusion : '',
    };
  }
  // StatusContext shape: context + state (always a settled commit status).
  if (typeof e.context === 'string') {
    return {
      name: e.context,
      status: 'COMPLETED',
      conclusion: typeof e.state === 'string' ? e.state : '',
    };
  }
  return null;
}

/**
 * Parse `gh pr view --json statusCheckRollup,mergeable,reviewDecision` output
 * into the available-view fields. Returns null when the output is not a JSON
 * object — a truthful "unparseable", never a fabricated PR.
 */
export function parseGhChecks(
  output: string
): Omit<WorkspaceChecksView, 'available' | 'reason'> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return null;
  const p = parsed as Record<string, unknown>;
  const rollup = Array.isArray(p.statusCheckRollup) ? p.statusCheckRollup : [];
  const checks = rollup.flatMap((entry) => {
    const row = toCheckRow(entry);
    return row ? [row] : [];
  });
  return {
    ...(typeof p.mergeable === 'string' && p.mergeable
      ? { mergeable: p.mergeable }
      : {}),
    ...(typeof p.reviewDecision === 'string' && p.reviewDecision
      ? { reviewDecision: p.reviewDecision }
      : {}),
    checks,
  };
}

export class PrChecksService {
  private readonly log: Logger;
  private readonly exec: PrChecksExec;

  constructor(deps: PrChecksServiceDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? defaultExec;
  }

  /** Resolve the workspace's PR checks. Never throws. */
  async checks(workspace: Workspace): Promise<WorkspaceChecksView> {
    if (!workspace.worktreePath) {
      return { available: false, reason: 'workspace has no worktree' };
    }

    let ghBin: string | undefined;
    try {
      ghBin = await this.exec.which('gh');
    } catch {
      ghBin = undefined;
    }
    if (!ghBin) {
      return { available: false, reason: 'gh CLI not found' };
    }

    // A non-GitHub `origin` can never resolve a PR through gh — report that
    // truthfully instead of surfacing gh's opaque failure. A failed probe (no
    // remote / no git) falls through: gh's own error is then the truth-teller.
    const remote = await this.originRemote(workspace.worktreePath);
    if (remote !== undefined && !remote.includes('github.com')) {
      return {
        available: false,
        reason: 'origin remote is not a GitHub repository',
      };
    }

    try {
      const { stdout } = await this.exec.execFile(
        ghBin,
        ['pr', 'view', '--json', CHECKS_FIELDS],
        {
          cwd: workspace.worktreePath,
          timeoutMs: PR_VIEW_TIMEOUT_MS,
          maxBuffer: PR_VIEW_MAX_BUFFER,
        }
      );
      const fields = parseGhChecks(stdout);
      if (!fields) {
        return {
          available: false,
          reason: 'could not parse gh pr view output',
        };
      }
      return { available: true, ...fields };
    } catch (err) {
      if (err instanceof ExecError && isNoPrError(err)) {
        return {
          available: false,
          reason: 'no pull request for the current branch',
        };
      }
      if (err instanceof ExecError && isAuthError(err)) {
        return {
          available: false,
          reason: 'gh is not authenticated (run `gh auth login`)',
        };
      }
      const reason =
        err instanceof ExecError && err.stderr.trim()
          ? err.stderr.trim()
          : err instanceof Error
            ? err.message
            : 'gh pr view failed';
      this.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'conductor pr-checks probe failed — reporting unavailable'
      );
      return { available: false, reason };
    }
  }

  /** The worktree's `origin` url, or undefined when the probe cannot answer. */
  private async originRemote(worktreePath: string): Promise<string | undefined> {
    try {
      const { stdout } = await this.exec.execFile(
        'git',
        ['remote', 'get-url', 'origin'],
        { cwd: worktreePath, timeoutMs: REMOTE_PROBE_TIMEOUT_MS }
      );
      const url = stdout.trim();
      return url || undefined;
    } catch {
      return undefined;
    }
  }
}
