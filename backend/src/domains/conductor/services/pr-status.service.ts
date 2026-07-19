/**
 * PrStatusService — the workspace's pull-request status, read through the same
 * `gh` CLI seam the conductor already trusts (see `github-status.adapter.ts`).
 *
 * For a workspace's branch it runs `gh pr view <branch> --json …` inside the
 * worktree (so `gh` infers the repo), and projects the answer into a truthful
 * {@link PrStatusView}: the open PR number, its state, draft flag, mergeability,
 * URL, and a checks rollup. Degrade-truthful throughout — it NEVER throws:
 *
 *  - no worktree / no `gh` on PATH / a gh auth-or-network error ⇒ `available:false`
 *    with a truthful reason (we could not consult GitHub — never a fabricated
 *    "no PR");
 *  - `gh` says the branch has no PR ⇒ `available:true, hasPr:false`;
 *  - a PR is found ⇒ `available:true, hasPr:true` with the projected fields.
 *
 * Probes are bounded so a hung `gh` can never stall the status edge.
 */
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';

/** `gh pr view` talks to the GitHub API — allow it longer than a local probe. */
const PR_VIEW_TIMEOUT_MS = 6_000;
const PR_VIEW_MAX_BUFFER = 4 * 1024 * 1024;

/** The JSON fields requested from `gh pr view`. */
const PR_VIEW_FIELDS = 'number,state,isDraft,mergeable,url,statusCheckRollup';

/** Aggregate rollup of the PR's status checks. */
export interface PrCheckSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly pending: number;
  /** `'none'` when there are no checks; else the truthful worst-wins rollup. */
  readonly rollup: 'passing' | 'failing' | 'pending' | 'none';
}

/** The `GET /workspaces/:id/pr-status` payload. */
export interface PrStatusView {
  /** Whether `gh` could be consulted at all (false ⇒ no gh / no worktree / gh error). */
  readonly available: boolean;
  /** Whether a pull request exists for the workspace branch. */
  readonly hasPr: boolean;
  readonly number?: number;
  readonly state?: 'open' | 'closed' | 'merged';
  readonly draft?: boolean;
  readonly mergeable?: 'mergeable' | 'conflicting' | 'unknown';
  readonly url?: string;
  readonly checks?: PrCheckSummary;
  /** Truthful reason when unavailable / no PR (never a fabricated success). */
  readonly reason?: string;
}

/** The exec surface the service probes with — injectable for tests. */
export interface PrStatusExec {
  execFile: (
    bin: string,
    args: readonly string[],
    options: ExecOptions
  ) => Promise<ExecResult>;
  which: (bin: string) => Promise<string | undefined>;
}

export interface PrStatusServiceDeps {
  readonly logger: Logger;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: PrStatusExec;
}

const defaultExec: PrStatusExec = {
  execFile: (bin, args, options) => execFileSafe(bin, args, options),
  which,
};

/** Does a gh failure mean "this branch has no PR" (vs. an auth/network error)? */
function isNoPrError(err: ExecError): boolean {
  const text = `${err.message}\n${err.stderr}`.toLowerCase();
  return (
    /no (open )?pull requests? found/.test(text) ||
    /could not resolve to a pullrequest/.test(text) ||
    /no pull requests found for branch/.test(text)
  );
}

/** Normalize gh's UPPERCASE state to the view's lowercase union (unknown ⇒ open). */
function normalizeState(value: unknown): PrStatusView['state'] {
  switch (String(value).toUpperCase()) {
    case 'CLOSED':
      return 'closed';
    case 'MERGED':
      return 'merged';
    default:
      return 'open';
  }
}

/** Normalize gh's mergeable enum to the view's lowercase union. */
function normalizeMergeable(value: unknown): PrStatusView['mergeable'] {
  switch (String(value).toUpperCase()) {
    case 'MERGEABLE':
      return 'mergeable';
    case 'CONFLICTING':
      return 'conflicting';
    default:
      return 'unknown';
  }
}

/**
 * Summarize a `statusCheckRollup` array into pass/fail/pending counts + a
 * worst-wins rollup. Handles both shapes gh returns: CheckRun entries
 * (`status`+`conclusion`) and StatusContext entries (`state`). Anything
 * unrecognized counts as pending — a truthful "not yet known", never a pass.
 */
export function summarizeChecks(rollup: unknown): PrCheckSummary {
  if (!Array.isArray(rollup) || rollup.length === 0) {
    return { total: 0, passed: 0, failed: 0, pending: 0, rollup: 'none' };
  }
  let passed = 0;
  let failed = 0;
  let pending = 0;
  for (const entry of rollup) {
    if (entry === null || typeof entry !== 'object') {
      pending += 1;
      continue;
    }
    const e = entry as Record<string, unknown>;
    // CheckRun: judged by `conclusion` once `status` is COMPLETED; else pending.
    if (typeof e.conclusion === 'string' || typeof e.status === 'string') {
      const status = String(e.status ?? '').toUpperCase();
      if (status && status !== 'COMPLETED') {
        pending += 1;
        continue;
      }
      const conclusion = String(e.conclusion ?? '').toUpperCase();
      if (
        conclusion === 'SUCCESS' ||
        conclusion === 'NEUTRAL' ||
        conclusion === 'SKIPPED'
      ) {
        passed += 1;
      } else if (conclusion === '') {
        pending += 1;
      } else {
        failed += 1;
      }
      continue;
    }
    // StatusContext: judged by `state`.
    const state = String(e.state ?? '').toUpperCase();
    if (state === 'SUCCESS') passed += 1;
    else if (state === 'FAILURE' || state === 'ERROR') failed += 1;
    else pending += 1;
  }
  const total = passed + failed + pending;
  const rollupState: PrCheckSummary['rollup'] =
    failed > 0 ? 'failing' : pending > 0 ? 'pending' : 'passing';
  return { total, passed, failed, pending, rollup: rollupState };
}

/**
 * Parse `gh pr view --json …` output into the PR fields of a {@link PrStatusView}
 * (everything except `available`/`hasPr`, which the caller stamps). Returns null
 * when the output is not a JSON object with a numeric `number` — a truthful
 * "unparseable", never a fabricated PR.
 */
export function parseGhPrView(
  output: string
): Omit<PrStatusView, 'available' | 'hasPr'> | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
    return null;
  const p = parsed as Record<string, unknown>;
  if (typeof p.number !== 'number') return null;
  return {
    number: p.number,
    state: normalizeState(p.state),
    draft: p.isDraft === true,
    mergeable: normalizeMergeable(p.mergeable),
    ...(typeof p.url === 'string' && p.url ? { url: p.url } : {}),
    checks: summarizeChecks(p.statusCheckRollup),
  };
}

export class PrStatusService {
  private readonly log: Logger;
  private readonly exec: PrStatusExec;

  constructor(deps: PrStatusServiceDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? defaultExec;
  }

  /** Resolve the workspace's PR status. Never throws. */
  async status(workspace: Workspace): Promise<PrStatusView> {
    if (!workspace.worktreePath) {
      return {
        available: false,
        hasPr: false,
        reason: 'workspace has no worktree',
      };
    }
    if (!workspace.branch) {
      return {
        available: false,
        hasPr: false,
        reason: 'workspace has no branch',
      };
    }

    let ghBin: string | undefined;
    try {
      ghBin = await this.exec.which('gh');
    } catch {
      ghBin = undefined;
    }
    if (!ghBin) {
      return { available: false, hasPr: false, reason: 'gh CLI not found' };
    }

    try {
      const { stdout } = await this.exec.execFile(
        ghBin,
        ['pr', 'view', workspace.branch, '--json', PR_VIEW_FIELDS],
        {
          cwd: workspace.worktreePath,
          timeoutMs: PR_VIEW_TIMEOUT_MS,
          maxBuffer: PR_VIEW_MAX_BUFFER,
        }
      );
      const fields = parseGhPrView(stdout);
      if (!fields) {
        return {
          available: false,
          hasPr: false,
          reason: 'could not parse gh pr view output',
        };
      }
      return { available: true, hasPr: true, ...fields };
    } catch (err) {
      if (err instanceof ExecError && isNoPrError(err)) {
        return {
          available: true,
          hasPr: false,
          reason: 'no pull request for branch',
        };
      }
      // Prefer the CLI's stderr (the actionable detail: auth/network) over the
      // generic ExecError message.
      const reason =
        err instanceof ExecError && err.stderr.trim()
          ? err.stderr.trim()
          : err instanceof Error
            ? err.message
            : 'gh pr view failed';
      this.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'conductor pr-status probe failed — reporting unavailable'
      );
      return { available: false, hasPr: false, reason };
    }
  }
}
