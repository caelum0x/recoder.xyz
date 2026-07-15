/**
 * CodeIntelPort — the conductor's "code-intel + issue-graph" write seam.
 *
 * When a user creates a workspace and runs an agent, the conductor run flow (the
 * BACKEND, not the agent) uses two engines to make the workspace intelligent:
 *  - recodergit indexes the repo so the agent has a live code-knowledge-graph,
 *  - beads (bd) tracks the workspace/run as a node in the shared issue graph so
 *    work is auditable and recallable.
 *
 * This port is the narrow contract the composer calls; the concrete adapters
 * (`adapters/code-intel.adapter.ts` over the recodergit engine client and
 * `adapters/issue-graph.adapter.ts` over the beads engine client) reach the LIVE
 * engine domain. Every method is DEGRADE-SAFE and returns `void`: an absent /
 * disabled / failed engine is a logged skip, NEVER a throw and NEVER a fabricated
 * success. A slow or down engine must never block or fail a workspace launch.
 */

/** The issue-graph subset (beads): claim on launch, note + close on completion. */
export interface IssueGraphPort {
  /**
   * Mark the bd issue `taskId` claimed / in-progress with `workspaceId` as
   * evidence (a note + a status update). No-op + log when `taskId` is absent or
   * the beads engine is down. Never throws.
   */
  trackWork(taskId: string, workspaceId: string): Promise<void>;
  /**
   * Note the terminal `outcome` on the bd issue `taskId`, and close it on
   * `'completed'`. Best-effort: a failure is logged, never rethrown into the
   * terminal-event path. No-op + log when `taskId` is absent.
   */
  completeWork(taskId: string, outcome: 'completed' | 'failed'): Promise<void>;
}

/** The full code-intel seam: recodergit index + the beads issue-graph subset. */
export interface CodeIntelPort extends IssueGraphPort {
  /**
   * Build/refresh the recodergit code-knowledge-graph for `repoPath` under the
   * deterministic `repoId` (derive via `repoIdFromFullName` at the call site).
   * No-op + log when the code-graph engine is disabled/absent or the inputs are
   * empty. Never throws.
   */
  indexRepo(repoPath: string, repoId: string): Promise<void>;
}
