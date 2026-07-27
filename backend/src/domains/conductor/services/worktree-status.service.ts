/**
 * WorktreeStatusService — a read-only probe of a workspace worktree's UNCOMMITTED
 * state, run git-native through the same exec seam the conductor already trusts
 * (mirroring {@link MergeabilityService}). Inside the worktree it runs:
 *
 *   - `git status --porcelain` — one line per changed path (staged, unstaged, or
 *     untracked). Zero lines ⇒ clean; any line ⇒ open work.
 *
 * Why this matters for merge-readiness: the mergeability preflight and the merge
 * itself operate on COMMITTED state, so uncommitted work in the worktree is
 * INVISIBLE to them — an agent that left changes unstaged would merge a branch
 * that silently omits them. This probe surfaces that "open work" so the readiness
 * fold can DISCOURAGE (not hard-block) a merge until the work is committed.
 *
 * Degrade-truthful throughout — it NEVER throws and NEVER fabricates a clean pass:
 *
 *  - no worktree ⇒ `available:false` with a truthful reason (before any exec);
 *  - no `git` on PATH ⇒ `available:false` with `reason:'git CLI not found'`;
 *  - any git fault ⇒ `available:false` + reason (NEVER `dirty:false` as a pass —
 *    an unavailable probe is `'unknown'`, judged nowhere as clean).
 *
 * The probe is bounded so a hung git can never stall the readiness edge.
 */
import { execFileSafe, which, ExecError } from '@recoder/substrate';
import type { ExecOptions, ExecResult } from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';

/** `status --porcelain` is local — allow it the same bound as the merge preflight. */
const WORKTREE_STATUS_TIMEOUT_MS = 6_000;
const WORKTREE_STATUS_MAX_BUFFER = 4 * 1024 * 1024;

/** The worktree open-work read-model folded into readiness. */
export interface WorktreeStatusView {
  /** Whether git could judge the worktree at all (false ⇒ no git / no worktree / git error). */
  readonly available: boolean;
  /** `true` ⇒ uncommitted changes present (staged, unstaged, or untracked). `false` when clean OR unavailable. */
  readonly dirty: boolean;
  /** Number of changed paths (`git status --porcelain` lines); 0 when clean or unavailable. */
  readonly changedCount: number;
  /** Truthful reason when unavailable (never a fabricated clean). */
  readonly reason?: string;
}

/** The exec surface the service probes with — injectable for tests. */
export interface WorktreeStatusExec {
  execFile: (
    bin: string,
    args: readonly string[],
    options: ExecOptions
  ) => Promise<ExecResult>;
  which: (bin: string) => Promise<string | undefined>;
}

export interface WorktreeStatusServiceDeps {
  readonly logger: Logger;
  /** Test seam; defaults to the real substrate exec helpers. */
  readonly exec?: WorktreeStatusExec;
}

const defaultExec: WorktreeStatusExec = {
  execFile: (bin, args, options) => execFileSafe(bin, args, options),
  which,
};

/**
 * Count changed paths in `git status --porcelain` output. Every porcelain line is
 * exactly one path entry (`XY <path>`), so the count is the number of non-empty
 * lines. Robust to a trailing newline; a wholly blank output is clean (0).
 */
export function countPorcelainEntries(stdout: string): number {
  let count = 0;
  for (const line of stdout.split('\n')) {
    if (line.trim() !== '') count += 1;
  }
  return count;
}

export class WorktreeStatusService {
  private readonly log: Logger;
  private readonly exec: WorktreeStatusExec;

  constructor(deps: WorktreeStatusServiceDeps) {
    this.log = deps.logger;
    this.exec = deps.exec ?? defaultExec;
  }

  /** Resolve the workspace worktree's uncommitted state. Never throws. */
  async probe(workspace: Workspace): Promise<WorktreeStatusView> {
    if (!workspace.worktreePath) {
      return { available: false, dirty: false, changedCount: 0, reason: 'workspace has no worktree' };
    }
    const worktreePath = workspace.worktreePath;

    let gitBin: string | undefined;
    try {
      gitBin = await this.exec.which('git');
    } catch {
      gitBin = undefined;
    }
    if (!gitBin) {
      return { available: false, dirty: false, changedCount: 0, reason: 'git CLI not found' };
    }

    const options: ExecOptions = {
      timeoutMs: WORKTREE_STATUS_TIMEOUT_MS,
      maxBuffer: WORKTREE_STATUS_MAX_BUFFER,
    };
    try {
      const { stdout } = await this.exec.execFile(
        gitBin,
        ['-C', worktreePath, 'status', '--porcelain'],
        options,
      );
      const changedCount = countPorcelainEntries(stdout);
      return { available: true, dirty: changedCount > 0, changedCount };
    } catch (err) {
      const reason =
        err instanceof ExecError
          ? err.stderr.trim() || err.message
          : err instanceof Error
            ? err.message
            : 'worktree status probe failed';
      this.log.warn(
        { err, workspaceId: workspace.workspaceId },
        'conductor worktree-status probe failed — reporting unavailable',
      );
      return { available: false, dirty: false, changedCount: 0, reason };
    }
  }
}
