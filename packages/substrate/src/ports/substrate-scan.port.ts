/**
 * SubstrateScanPort — reconcile's direct-substrate-query seam (design §4.6 / §7).
 *
 * The whole point of reconcile is restart survivability: after a backend restart
 * the in-memory session map is empty, so reconcile must query the REAL execution
 * substrate directly (live tmux session names + conductor worktrees on disk) and
 * join the result against persisted workspaces. The engine reaches those direct
 * queries through this port so it performs no process/filesystem IO itself.
 *
 * The backend injects an adapter that shells out to `tmux list-sessions` and
 * `git worktree list` (the proven queries from workspace-service); tests inject
 * a fake returning a fixed snapshot. Each query is best-effort by contract: an
 * adapter that cannot reach the substrate returns an empty list rather than
 * throwing, so a probe failure degrades reconcile instead of crashing it.
 * Interface only.
 */
export interface SubstrateScanPort {
  /** Live conductor session names (e.g. `recoder-*` tmux sessions), queried directly. */
  listLiveSessions(): Promise<string[]>;
  /** Conductor worktree workspace-ids derived from `git worktree list` paths. */
  listConductorWorktrees(): Promise<string[]>;
}
