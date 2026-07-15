/**
 * `createIssueGraphTracker` — the conductor adapter that tracks a workspace/run
 * as a node in the beads (bd) issue graph, so agent work is a recallable,
 * auditable graph rather than an opaque terminal session.
 *
 * It depends ONLY on the engines domain's FROZEN `EngineClientPort` for the
 * `beads` engine (injected by bootstrap as `engines.client('beads')`) — never on
 * the whole engines module, never on `bd` directly (mirrors how the inference
 * domain consumes `engines.tensorzero()`). The beads adapter maps ops onto real
 * `bd` subcommands (`note`, `update`, `close`).
 *
 * SEAM LAW (degrade-safe, truthful): every call swallows an absent client, a
 * disabled engine, or an `{ ok:false }` invoke into a LOGGED SKIP. It never
 * throws across the boundary and never fabricates issue state. A missing `bd`
 * binary or an absent `taskId` simply means the run is not graph-tracked — the
 * workspace launch and the terminal-event path proceed unaffected.
 */
import type { Logger } from '../../../shared/logger.js';
import type { EngineClientPort } from '../../engines/ports/engine-client.port.js';
import type { IssueGraphPort } from '../ports/code-intel.port.js';

export interface IssueGraphTrackerDeps {
  /**
   * The beads `EngineClientPort` (`engines.client('beads')`). `null`/`undefined`
   * when the engine is not declared/wired ⇒ every call is a truthful logged skip.
   */
  readonly beads: EngineClientPort | null | undefined;
  readonly logger: Logger;
}

/** Per-call deadline for a `bd` subcommand (bounded so a slow CLI never stalls). */
const BEADS_TIMEOUT_MS = 15_000;

export function createIssueGraphTracker(deps: IssueGraphTrackerDeps): IssueGraphPort {
  const { beads, logger } = deps;

  return {
    async trackWork(taskId: string, workspaceId: string): Promise<void> {
      const id = taskId?.trim();
      if (!id) {
        // No bd issue backs this workspace — nothing to graph-track. Truthful skip.
        logger.debug({ workspaceId }, 'issue-graph: no taskId on workspace — track skipped');
        return;
      }
      if (!beads) {
        logger.debug({ taskId: id, workspaceId }, 'issue-graph: beads engine not wired — track skipped');
        return;
      }
      // 1) Attach the workspace as evidence on the issue (note), then 2) move it
      //    to in-progress (update). Both best-effort + independently degrade-safe.
      await run(beads, logger, {
        op: 'note',
        input: { id, text: `Recoder workspace ${workspaceId} claimed this issue (agent run started)` },
      }, { taskId: id, workspaceId }, 'note claim evidence');
      await run(beads, logger, {
        op: 'update',
        input: { id, status: 'in_progress' },
      }, { taskId: id, workspaceId }, 'mark in_progress');
    },

    async completeWork(taskId: string, outcome: 'completed' | 'failed'): Promise<void> {
      const id = taskId?.trim();
      if (!id) {
        logger.debug({ outcome }, 'issue-graph: no taskId on run — completeWork skipped');
        return;
      }
      if (!beads) {
        logger.debug({ taskId: id, outcome }, 'issue-graph: beads engine not wired — completeWork skipped');
        return;
      }
      // Always note the terminal outcome as evidence.
      await run(beads, logger, {
        op: 'note',
        input: { id, text: `Recoder workspace run ${outcome}` },
      }, { taskId: id, outcome }, 'note run outcome');
      // Close only on success — a failed run keeps the issue open for follow-up.
      if (outcome === 'completed') {
        await run(beads, logger, {
          op: 'close',
          input: { id, reason: 'Completed via Recoder workspace run' },
        }, { taskId: id }, 'close issue');
      }
    },
  };
}

/**
 * Invoke a single `bd` op and fold every non-`ok` outcome into a logged skip.
 * The engines `EngineClientPort.invoke` NEVER throws across the seam, but we still
 * guard defensively so an adapter bug can never escape into the run flow.
 */
async function run(
  beads: EngineClientPort,
  logger: Logger,
  call: { op: string; input: Record<string, unknown> },
  ctx: Record<string, unknown>,
  what: string,
): Promise<void> {
  try {
    const result = await beads.invoke({ op: call.op, input: call.input, timeoutMs: BEADS_TIMEOUT_MS });
    if (!result.ok) {
      logger.warn({ ...ctx, op: call.op, reason: result.reason }, `issue-graph: ${what} skipped (beads unavailable)`);
    } else {
      logger.debug({ ...ctx, op: call.op }, `issue-graph: ${what} ok`);
    }
  } catch (err) {
    // Defensive: the seam should not throw, but a skip must never become a crash.
    logger.warn({ ...ctx, op: call.op, err }, `issue-graph: ${what} errored — skipped`);
  }
}
