/**
 * `createIssueGraphTracker` — the conductor adapter that tracks a workspace/run
 * as a node in the beads (bd) issue graph, so agent work is a recallable,
 * auditable graph rather than an opaque terminal session.
 *
 * It depends ONLY on the narrow {@link IssueGraphWriter} slice of the
 * memory-owned issue-graph module facet (`memory.issueGraph()`), injected by
 * bootstrap at the composition root — never on the engines module, never on
 * `bd` directly (the memory facet composes typed verbs over the ONE engine
 * transport). Every write carries an `actor` (`conductor:<workspaceId>` on
 * launch, `conductor` on completion) so bd's audit trail is attributable.
 *
 * SEAM LAW (degrade-safe, truthful): every call folds an absent slice, a
 * refused write (`false`), a slow write (bounded at {@link BEADS_TIMEOUT_MS}),
 * or a (contract-violating) throw into a LOGGED SKIP. It never throws across
 * the boundary and never fabricates issue state. A missing `bd` binary or an
 * absent `taskId` simply means the run is not graph-tracked — the workspace
 * launch and the terminal-event path proceed unaffected.
 */
import type { Logger } from '../../../shared/logger.js';
import type { IssueGraphPort, IssueRead } from '../ports/code-intel.port.js';

/**
 * The injected module slice — the three issue-graph WRITE verbs the conductor
 * run flow consumes. `memory.issueGraph()` satisfies it structurally (per its
 * DEGRADE LAW writes resolve `false` and never throw); bootstrap passes the
 * facet directly. Declared here (consumer-owned port) so the conductor never
 * imports the memory domain.
 */
export interface IssueGraphWriter {
  /** Append evidence text to the bd issue. Resolves `false` when nothing was written. */
  note(id: string, text: string, actor: string): Promise<boolean>;
  /** Patch the bd issue (status). Resolves `false` when nothing was written. */
  update(id: string, patch: { status?: string }, actor: string): Promise<boolean>;
  /** Close the bd issue with a reason. Resolves `false` when nothing was written. */
  close(id: string, reason: string, actor: string): Promise<boolean>;
  /**
   * READ a bd issue (`bd show`). Resolves `null` when the issue is unknown or the
   * engine is down. The memory facet's `show(id, {long})` satisfies this
   * structurally (its richer `IssueDetail` is assignable to the read shape).
   */
  show(id: string, opts?: { long?: boolean }): Promise<{ id: string; title: string; description?: string } | null>;
  /**
   * List issues UNDER a parent that have open blockers (`bd blocked --parent`).
   * The memory facet's `blocked({parent})` satisfies this structurally (its
   * `BlockedIssue[]` is assignable to this narrowed read shape). OPTIONAL so
   * pre-existing writers stay valid; resolves `[]` when the engine is down.
   */
  blocked?(opts?: { parent?: string }): Promise<readonly { id: string; title: string; status: string }[]>;
  /**
   * Flat dependency/dependent records for an issue (`bd dep list`). `direction:'up'`
   * lists DEPENDENTS — issues discovered-from / depending on the task, i.e. its open
   * linked work. Returns raw bd records (narrowed defensively at the call site); the
   * memory facet's `depList` (which returns `unknown | null`) satisfies it.
   */
  depList?(id: string, opts?: { direction?: 'down' | 'up'; type?: string }): Promise<unknown>;
}

export interface IssueGraphTrackerDeps {
  /**
   * The issue-graph write slice (`memory.issueGraph()`). `null`/`undefined`
   * when the module is not wired ⇒ every call is a truthful logged skip.
   */
  readonly beads: IssueGraphWriter | null | undefined;
  readonly logger: Logger;
}

/** Per-call deadline for a `bd` write (bounded so a slow CLI never stalls). */
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
        logger.debug({ taskId: id, workspaceId }, 'issue-graph: seam not wired — track skipped');
        return;
      }
      const actor = `conductor:${workspaceId}`;
      // 1) Attach the workspace as evidence on the issue (note), then 2) move it
      //    to in-progress (update). Both best-effort + independently degrade-safe.
      await run(
        () => beads.note(id, `Recoder workspace ${workspaceId} claimed this issue (agent run started)`, actor),
        logger, { taskId: id, workspaceId }, 'note claim evidence',
      );
      await run(
        () => beads.update(id, { status: 'in_progress' }, actor),
        logger, { taskId: id, workspaceId }, 'mark in_progress',
      );
    },

    async completeWork(taskId: string, outcome: 'completed' | 'failed'): Promise<void> {
      const id = taskId?.trim();
      if (!id) {
        logger.debug({ outcome }, 'issue-graph: no taskId on run — completeWork skipped');
        return;
      }
      if (!beads) {
        logger.debug({ taskId: id, outcome }, 'issue-graph: seam not wired — completeWork skipped');
        return;
      }
      // The frozen `IssueGraphPort.completeWork` carries no workspaceId, so the
      // completion actor is the bare subsystem subject.
      const actor = 'conductor';
      // Always note the terminal outcome as evidence.
      await run(
        () => beads.note(id, `Recoder workspace run ${outcome}`, actor),
        logger, { taskId: id, outcome }, 'note run outcome',
      );
      // Close only on success — a failed run keeps the issue open for follow-up.
      if (outcome === 'completed') {
        await run(
          () => beads.close(id, 'Completed via Recoder workspace run', actor),
          logger, { taskId: id }, 'close issue',
        );
      }
    },

    async readIssue(id: string): Promise<IssueRead | null> {
      const issueId = id?.trim();
      if (!issueId) {
        logger.debug({}, 'issue-graph: no id — readIssue skipped');
        return null;
      }
      if (!beads) {
        logger.debug({ issueId }, 'issue-graph: seam not wired — readIssue skipped');
        return null;
      }
      // Bounded + degrade-safe: a slow/down engine, a miss, or a (contract-
      // violating) throw folds to `null` — never a fabricated issue, never a stall.
      try {
        const detail = await Promise.race([
          beads.show(issueId, { long: true }),
          new Promise<'timeout'>((resolve) => {
            const timer = setTimeout(() => resolve('timeout'), BEADS_TIMEOUT_MS);
            timer.unref?.();
          }),
        ]);
        if (detail === 'timeout') {
          logger.warn({ issueId, timeoutMs: BEADS_TIMEOUT_MS }, 'issue-graph: readIssue timed out — skipped');
          return null;
        }
        if (!detail || !detail.id || !detail.title) {
          logger.debug({ issueId }, 'issue-graph: readIssue found no issue — skipped');
          return null;
        }
        return {
          id: detail.id,
          title: detail.title,
          ...(detail.description ? { description: detail.description } : {}),
        };
      } catch (err) {
        logger.warn({ issueId, err }, 'issue-graph: readIssue errored — skipped');
        return null;
      }
    },

    async openLinkedWork(taskId: string): Promise<readonly { id: string; title: string }[] | null> {
      const id = taskId?.trim();
      if (!id) {
        logger.debug({}, 'issue-graph: no taskId — openLinkedWork skipped');
        return null;
      }
      // Prefer `dep list --direction up` (DEPENDENTS — the work discovered-from /
      // depending on the task, i.e. ALL its open linked work). Fall back to the
      // narrower `blocked({parent})` (open blocked children) when the richer verb
      // is unwired. `null` (not `[]`) when neither can be probed, so the open-work
      // fold treats it as UNAVAILABLE rather than a fabricated "no linked work".
      const bounded = <T>(p: Promise<T>): Promise<T | 'timeout'> =>
        Promise.race([
          p,
          new Promise<'timeout'>((resolve) => {
            const timer = setTimeout(() => resolve('timeout'), BEADS_TIMEOUT_MS);
            timer.unref?.();
          }),
        ]);
      try {
        if (beads && typeof beads.depList === 'function') {
          const raw = await bounded(beads.depList(id, { direction: 'up' }));
          if (raw === 'timeout') {
            logger.warn({ taskId: id, timeoutMs: BEADS_TIMEOUT_MS }, 'issue-graph: openLinkedWork(deps) timed out — skipped');
            return null;
          }
          return parseOpenLinkedIssues(raw, id);
        }
        if (beads && typeof beads.blocked === 'function') {
          const raw = await bounded(beads.blocked({ parent: id }));
          if (raw === 'timeout') {
            logger.warn({ taskId: id, timeoutMs: BEADS_TIMEOUT_MS }, 'issue-graph: openLinkedWork(blocked) timed out — skipped');
            return null;
          }
          return parseOpenLinkedIssues(raw, id);
        }
        logger.debug({ taskId: id }, 'issue-graph: no linked-work verb wired — openLinkedWork skipped');
        return null;
      } catch (err) {
        logger.warn({ taskId: id, err }, 'issue-graph: openLinkedWork errored — skipped');
        return null;
      }
    },
  };
}

/**
 * Defensively narrow a raw `bd dep list` / `bd blocked` result into the open linked
 * work `{id,title}[]`: keep only well-formed records with a non-empty id, DROP the
 * task itself and any CLOSED issue, dedupe by id, and cap the count. Never throws,
 * never fabricates — a non-array or unrecognized shape yields `[]`.
 */
function parseOpenLinkedIssues(raw: unknown, taskId: string): readonly { id: string; title: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: { id: string; title: string }[] = [];
  for (const rec of raw) {
    if (!rec || typeof rec !== 'object') continue;
    const r = rec as Record<string, unknown>;
    const id = typeof r.id === 'string' ? r.id.trim() : '';
    if (!id || id === taskId || seen.has(id)) continue;
    if (isClosedStatus(r.status)) continue;
    seen.add(id);
    out.push({ id, title: typeof r.title === 'string' ? r.title : '' });
    if (out.length >= MAX_LINKED_ISSUES) break;
  }
  return out;
}

/** Cap linked issues so a pathological dep graph can't flood the open-work signal. */
const MAX_LINKED_ISSUES = 25;

/** bd terminal statuses that are NOT open work (case-insensitive). */
const CLOSED_STATUSES = new Set(['closed', 'done', 'completed', 'resolved', 'cancelled', 'canceled']);

/** True when a bd status string names a terminal (not-open) state. */
function isClosedStatus(status: unknown): boolean {
  return typeof status === 'string' && CLOSED_STATUSES.has(status.trim().toLowerCase());
}

/**
 * Run a single issue-graph write and fold every non-success outcome into a
 * logged skip. The memory facet NEVER throws across the seam (its writes
 * resolve `false`), but we still guard defensively and bound the wait at
 * {@link BEADS_TIMEOUT_MS} so an adapter bug or a hung CLI can never escape
 * into (or stall) the run flow.
 */
async function run(
  write: () => Promise<boolean>,
  logger: Logger,
  ctx: Record<string, unknown>,
  what: string,
): Promise<void> {
  try {
    const outcome = await Promise.race([
      write(),
      new Promise<'timeout'>((resolve) => {
        const timer = setTimeout(() => resolve('timeout'), BEADS_TIMEOUT_MS);
        timer.unref?.();
      }),
    ]);
    if (outcome === 'timeout') {
      logger.warn({ ...ctx, timeoutMs: BEADS_TIMEOUT_MS }, `issue-graph: ${what} timed out — skipped`);
    } else if (!outcome) {
      // The facet already warned with the truthful transport reason.
      logger.warn(ctx, `issue-graph: ${what} skipped (issue graph unavailable)`);
    } else {
      logger.debug(ctx, `issue-graph: ${what} ok`);
    }
  } catch (err) {
    // Defensive: the facet should not throw, but a skip must never become a crash.
    logger.warn({ ...ctx, err }, `issue-graph: ${what} errored — skipped`);
  }
}
