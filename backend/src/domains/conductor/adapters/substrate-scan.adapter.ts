/**
 * `createSubstrateScan` — reconcile's direct-substrate-query seam
 * ({@link SubstrateScanPort}). Restart survivability depends on querying the REAL
 * substrate (live tmux sessions + conductor worktrees on disk) directly, since
 * the in-memory session map is empty after a backend restart.
 *
 * Each query is BEST-EFFORT by contract: a probe that cannot reach the substrate
 * returns an empty list rather than throwing, so a scan failure DEGRADES reconcile
 * (fewer findings) instead of crashing it. The concrete host queries (`tmux
 * list-sessions`, `git worktree list`) are injected by the composition root once a
 * live substrate is wired; the default reports nothing (truthful "cannot see the
 * substrate") rather than fabricating live work.
 */
import type { SubstrateScanPort } from '@recoder/substrate';

export interface SubstrateScanDeps {
  /** Injected live-session probe (host `tmux list-sessions`); default: none visible. */
  readonly listLiveSessions?: () => Promise<readonly string[]>;
  /** Injected worktree probe (host `git worktree list`); default: none visible. */
  readonly listConductorWorktrees?: () => Promise<readonly string[]>;
}

/** Build the degrade-safe substrate scan adapter. */
export function createSubstrateScan(deps: SubstrateScanDeps = {}): SubstrateScanPort {
  return {
    async listLiveSessions(): Promise<string[]> {
      try {
        return [...((await deps.listLiveSessions?.()) ?? [])];
      } catch {
        return [];
      }
    },
    async listConductorWorktrees(): Promise<string[]> {
      try {
        return [...((await deps.listConductorWorktrees?.()) ?? [])];
      } catch {
        return [];
      }
    },
  };
}
