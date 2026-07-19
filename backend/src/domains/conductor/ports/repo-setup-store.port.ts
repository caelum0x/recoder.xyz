/**
 * RepoSetupStorePort — the persistence seam for per-repo setup scripts.
 *
 * A "setup script" is the shell the user configures ONCE per repo (install
 * dependencies, seed env, warm caches) that the conductor runs inside every
 * fresh worktree right after it is created — so an agent starts in a ready
 * project instead of a bare checkout. The config is keyed by a stable repo key
 * (the workspace's `projectId`, falling back to a normalized `repoPath`) so all
 * of that repo's workspaces share one script.
 *
 * Degrade-safe by contract: the default adapter is a bounded in-process store
 * (survives the process, not a restart). A durable executor-backed store can be
 * injected at the composition root without touching callers — the service only
 * depends on this narrow interface, never on a driver.
 */

/** One repo's persisted setup-script config. */
export interface RepoSetupConfig {
  /** Stable repo key: the workspace `projectId`, else a normalized `repoPath`. */
  readonly repoKey: string;
  /** The shell script run in every fresh worktree (may be empty = "no script"). */
  readonly script: string;
  /** The principal userId that last wrote this config (audit/display). */
  readonly updatedBy: string;
  /** ISO timestamp of the last write. */
  readonly updatedAt: string;
}

export interface RepoSetupStorePort {
  /** Fetch one repo's setup config, or null when none is configured. */
  get(repoKey: string): Promise<RepoSetupConfig | null>;
  /** Persist (upsert) one repo's setup config; returns the stored record. */
  set(config: RepoSetupConfig): Promise<RepoSetupConfig>;
}
