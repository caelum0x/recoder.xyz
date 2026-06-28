/**
 * Reconcile types — restart survivability (design §4.6).
 *
 * After a backend restart the in-memory session map is empty; reconcile queries
 * tmux + git + Daytona directly and joins them against persisted workspaces,
 * classifying each into one of four buckets. It FLAGS orphans; it never silently
 * kills work.
 */
export type OrphanKind =
  | 'live'
  | 'orphanedWorkspace'
  | 'orphanedSession'
  | 'orphanedWorktree';

export interface ReconcileFinding {
  kind: OrphanKind;
  workspaceId?: string;
  /** Live session name or worktree path the finding concerns. */
  ref?: string;
  detail?: string;
}

/**
 * Findings-grouped reconcile report (design §4.6 vocabulary). The wired engine
 * reports the proven string-id `ReconcileReport` (see engine/types.ts); this
 * richer findings shape is retained for the future operator surface and is named
 * distinctly to avoid colliding with the engine report.
 */
export interface SubstrateReconcileReport {
  /** ISO-8601 timestamp the reconcile ran. */
  at: string;
  live: ReconcileFinding[];
  orphanedWorkspaces: ReconcileFinding[];
  orphanedSessions: ReconcileFinding[];
  orphanedWorktrees: ReconcileFinding[];
}
