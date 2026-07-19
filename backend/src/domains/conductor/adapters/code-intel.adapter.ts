/**
 * `createConductorCodeIntel` — the conductor adapter that gives a freshly created
 * workspace CODE INTELLIGENCE: on launch it indexes the repo through the LIVE
 * recodergit code-knowledge-graph engine, so the coding agent (external CLI in the
 * tmux worktree, or the native openfang runtime) queries a real graph instead of
 * grepping blind. It composes the beads issue-graph tracker
 * (`adapters/issue-graph.adapter.ts`) so the ONE `CodeIntelPort` the composer
 * consumes covers both index (recodergit) and track/complete (beads).
 *
 * It depends ONLY on the engines domain's FROZEN `EngineClientPort` for the
 * `recodergit` engine (`engines.client('recodergit')`) — never on the engines
 * module, never on `recodergit-service` internals (mirrors the inference domain
 * consuming `engines.tensorzero()`). The recodergit adapter maps `op:'index'`
 * onto the flag-gated, fail-safe `RecoderGitService.indexRepo` (launch-time build)
 * and `op:'reindex'` onto `RecoderGitService.reindexOnPush` (completion-time
 * refresh, so the graph does not go stale as the agent commits).
 *
 * SEAM LAW (degrade-safe, truthful): `RECODER_CODE_GRAPH_ENABLED` off, an unbuilt
 * engine, empty inputs, or an `{ ok:false }` invoke all fold into a LOGGED SKIP —
 * the run proceeds with the capability simply absent. It never throws across the
 * boundary and never fabricates an index.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { CodeIntelPort, IssueGraphPort } from '../ports/code-intel.port.js';
import { createIssueGraphTracker } from './issue-graph.adapter.js';

export interface ConductorCodeIntelDeps {
  /**
   * The recodergit `EngineClientPort` (`engines.client('recodergit')`).
   * `null`/`undefined` when the code-graph engine is not declared/wired ⇒ every
   * `indexRepo` is a truthful logged skip.
   */
  readonly recodergit: EngineClientPort | null | undefined;
  /** The beads `EngineClientPort` (`engines.client('beads')`) for the issue graph. */
  readonly beads: EngineClientPort | null | undefined;
  readonly logger: Logger;
  /**
   * Inject a pre-built issue-graph tracker (tests / custom composition). Defaults
   * to `createIssueGraphTracker` over the injected `beads` client.
   */
  readonly issueGraph?: IssueGraphPort;
}

/** Bounded deadline for a repo index (never let a slow index stall a launch). */
const INDEX_TIMEOUT_MS = 120_000;
/** Bounded deadline for an incremental reindex on completion. */
const REINDEX_TIMEOUT_MS = 120_000;

export function createConductorCodeIntel(deps: ConductorCodeIntelDeps): CodeIntelPort {
  const { recodergit, beads, logger } = deps;
  const issueGraph =
    deps.issueGraph ?? createIssueGraphTracker({ beads, logger });

  return {
    async indexRepo(repoPath: string, repoId: string): Promise<void> {
      const root = repoPath?.trim();
      const id = repoId?.trim();
      if (!root || !id) {
        logger.debug({ repoPath, repoId }, 'code-intel: missing repoPath/repoId — index skipped');
        return;
      }
      if (!recodergit) {
        logger.debug({ repoId: id }, 'code-intel: recodergit engine not wired — index skipped');
        return;
      }
      try {
        const result = await recodergit.invoke({
          op: 'index',
          input: { repoRoot: root, repoId: id },
          timeoutMs: INDEX_TIMEOUT_MS,
        });
        if (!result.ok) {
          // Disabled / unbuilt / bad input — truthful skip, run proceeds.
          logger.info(
            { repoId: id, reason: result.reason, code: result.code },
            'code-intel: repo index skipped (recodergit unavailable)',
          );
          return;
        }
        logger.info({ repoId: id }, 'code-intel: repo indexed via recodergit');
      } catch (err) {
        // Defensive: the seam should not throw, but an index must never crash launch.
        logger.warn({ repoId: id, err }, 'code-intel: repo index errored — skipped');
      }
    },

    async reindexRepo(repoId: string): Promise<void> {
      const id = repoId?.trim();
      if (!id) {
        logger.debug({ repoId }, 'code-intel: missing repoId — reindex skipped');
        return;
      }
      if (!recodergit) {
        logger.debug({ repoId: id }, 'code-intel: recodergit engine not wired — reindex skipped');
        return;
      }
      try {
        const result = await recodergit.invoke({
          op: 'reindex',
          input: { repoId: id },
          timeoutMs: REINDEX_TIMEOUT_MS,
        });
        if (!result.ok) {
          // Disabled / unbuilt / bad input — truthful skip, run proceeds.
          logger.info(
            { repoId: id, reason: result.reason, code: result.code },
            'code-intel: repo reindex skipped (recodergit unavailable)',
          );
          return;
        }
        // The engine returns `not_indexed` when there is no prior index to
        // refresh — a truthful skip, not a fabricated success.
        const status =
          result.value && typeof result.value === 'object'
            ? (result.value as { status?: string }).status
            : undefined;
        if (status === 'not_indexed') {
          logger.info(
            { repoId: id },
            'code-intel: repo reindex skipped (no prior index for this repoId)',
          );
          return;
        }
        logger.info({ repoId: id, status }, 'code-intel: repo reindexed via recodergit');
      } catch (err) {
        // Defensive: the seam should not throw, but a reindex must never crash
        // the terminal-event path.
        logger.warn({ repoId: id, err }, 'code-intel: repo reindex errored — skipped');
      }
    },

    // Issue-graph (beads) subset delegated to the dedicated tracker.
    trackWork: (taskId, workspaceId) => issueGraph.trackWork(taskId, workspaceId),
    completeWork: (taskId, outcome) => issueGraph.completeWork(taskId, outcome),
  };
}
