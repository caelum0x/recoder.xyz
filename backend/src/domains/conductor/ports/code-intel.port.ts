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
  /**
   * Incrementally REFRESH the recodergit code-knowledge-graph after the agent has
   * committed new code (fired on run completion, so the graph does not go stale
   * as the workspace advances). Keyed by the SAME deterministic `repoId` the
   * launch-time `indexRepo` used; the engine re-analyzes that repo's recorded
   * root at current HEAD (`RecoderGitService.reindexOnPush`). No-op + log when the
   * code-graph engine is disabled/absent, the repo was never indexed, or `repoId`
   * is empty. Best-effort + degrade-safe: NEVER throws into the terminal-event
   * path and NEVER fabricates an index.
   */
  reindexRepo(repoId: string): Promise<void>;
  /**
   * Compose a CODE-AWARE launch context over the already-indexed recodergit
   * graph for `repoId` (DomainMap overview + `symbol_search` + `definition` for
   * the given prompt-derived `seedTerms`) and render it as a compact prompt block
   * the conductor folds into the agent's launch prompt. Returns `null` — a
   * TRUTHFUL SKIP — when the code-graph is disabled/absent, the repo is not
   * indexed, or the graph carried nothing for the seeds. Best-effort +
   * degrade-safe: NEVER throws into the launch path and NEVER fabricates context.
   *
   * OPTIONAL on the port so pre-existing implementors stay valid; the composer
   * probes `codeIntel.queryContext` before calling and skips truthfully when
   * absent.
   */
  queryContext?(repoId: string, seedTerms: string[]): Promise<string | null>;
}
