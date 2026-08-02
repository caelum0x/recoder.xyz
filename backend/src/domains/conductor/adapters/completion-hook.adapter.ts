/**
 * `createCompletionHookSink` — the run-flow COMPLETION seam (hooks h + i).
 *
 * The run-tailer emits every `RunEvent` through ONE `RunEventSinkPort`. This
 * decorator wraps the durable+live sink so that on a TERMINAL event
 * (`completed` / `failed`) the conductor run flow fires the two completion
 * capabilities the AGENTS policy describes:
 *  - (h) memory HARVEST — an evidence-backed candidate wisp distilled from the
 *    finished run (`ConductorBrainMemory.harvestOnCompletion`),
 *  - (i) issue-graph CLOSE/NOTE — the bd issue the workspace served is noted and,
 *    on success, closed (`CodeIntelPort.completeWork`), and
 *  - (k) code-graph REINDEX — the recodergit code-knowledge-graph is refreshed for
 *    the workspace's repo (`CodeIntelPort.reindexRepo`) so the graph the next
 *    agent queries reflects the code THIS run just committed, instead of the
 *    launch-time snapshot that goes stale as the workspace advances, and
 *  - (§4c) EVENT-BUS publish — a `workspace.completed` lifecycle event is pushed
 *    onto the native openfang kernel bus (`AgentEventPort.publish`) so kernel
 *    triggers can fire background Hands off the finished run.
 *
 * SEAM LAW (degrade-safe, truthful): the wrapped `inner.append` (durable audit +
 * live `/sync`) runs FIRST and is always awaited — the terminal event is never
 * delayed or dropped by a capability. The two hooks are fire-and-forget and NEVER
 * rethrow into the terminal-event path (a memory/beads fault is logged, swallowed).
 * With neither brain nor code-intel wired the decorator is the identity sink.
 */
import type { RunEvent, Workspace } from '@recoder/agent-os';
import type { Logger } from '../../../shared/logger.js';
import type { RunEventSinkPort } from '../ports/run-event-sink.port.js';
import type { CodeIntelPort } from '../ports/code-intel.port.js';
import type { UsageMeterPort } from '../ports/usage-meter.port.js';
import type { AgentEventPort } from '../ports/agent-event.port.js';
import type { RunSignalPushPort } from '../ports/run-signal-push.port.js';
// TYPE-ONLY: the frozen Phase-11 metrics seam (the contract every domain injects
// to record RED/USE without coupling to the concrete registry). Erased at build.
import type { MetricSpec, MetricsPort } from '../../observability/ports/metrics.port.js';
import type { ConductorBrainMemory } from './brain-memory.adapter.js';

/** RED rate+errors for conductor runs: one increment per emitted terminal event. */
const RUNS_TOTAL: MetricSpec = {
  name: 'conductor_runs_total',
  help: 'Terminal conductor run events by outcome (RED rate + errors).',
  labelNames: ['outcome', 'engine'],
};
/** Real engine-reported token consumption (USE utilization), by direction. */
const RUN_TOKENS_TOTAL: MetricSpec = {
  name: 'conductor_run_tokens_total',
  help: 'Engine-reported tokens consumed by terminal conductor runs.',
  labelNames: ['engine', 'direction'],
};

export interface CompletionHookDeps {
  /** The durable+live sink the tailer writes through (fanned agent-os + local). */
  readonly inner: RunEventSinkPort;
  /** OPTIONAL memory brain (harvest). Absent ⇒ no harvest. */
  readonly brain?: ConductorBrainMemory;
  /** OPTIONAL code-intel (beads close/note). Absent ⇒ no issue-graph update. */
  readonly codeIntel?: CodeIntelPort;
  /**
   * OPTIONAL billing usage-meter resolver (j: per-run metering). A thunk (not a
   * value) because the meter is injected post-construction by bootstrap
   * (`ConductorModule.setUsageMeter`), AFTER this sink is built. Returns
   * `undefined` until wired ⇒ a truthful no-op (no metering).
   */
  readonly getMeter?: () => UsageMeterPort | undefined;
  /**
   * OPTIONAL outbound kernel event-bus seam (§4c: event-bus ↔ RunEvents bridge).
   * On a terminal event the completion path ALSO publishes a `workspace.completed`
   * lifecycle event onto the native openfang kernel bus so kernel triggers can fire
   * background Hands. Absent ⇒ no publish (a truthful no-op). Fire-and-forget +
   * degrade-safe — a publish fault NEVER stalls or rejects the terminal-event path.
   */
  readonly agentEvent?: AgentEventPort;
  /**
   * OPTIONAL ops-recorder REVERSE-PUSH resolver (§8.2 b: terminal run → stuck-work
   * board). A thunk (not a value) because the port is injected post-construction by
   * bootstrap (`ConductorModule.setRunSignalPush`), AFTER this sink is built, and
   * satisfied STRUCTURALLY by observability so neither domain imports the other.
   * Returns `undefined` until wired ⇒ a truthful no-op (no push). On a terminal
   * event the completion path reverse-pushes a failed/stuck outcome so a broken run
   * lands on the SAME board a stale PR does; a `completed` outcome calls through but
   * is a truthful far-side SKIP (a finished run is not stuck work). Fire-and-forget +
   * degrade-safe — a push fault NEVER stalls or rejects the terminal-event path.
   */
  readonly getRunSignalPush?: () => RunSignalPushPort | undefined;
  /**
   * OPTIONAL metrics resolver (BE-7.3: feed the frozen MetricsPort from conductor
   * runs). A thunk (not a value) because observability is composed AFTER the
   * conductor — bootstrap injects the seam via `ConductorModule.setMetrics`.
   * Returns `undefined` until wired ⇒ a truthful no-op (no series recorded — never
   * a fabricated 0). On a terminal event it increments `conductor_runs_total
   * {outcome,engine}` and, when the event carries REAL engine-reported usage,
   * `conductor_run_tokens_total{engine,direction}`. Recording is synchronous and
   * fault-isolated — a metrics fault NEVER stalls the terminal-event path.
   */
  readonly getMetrics?: () => MetricsPort | undefined;
  /** Resolve the owning workspace (for userId/taskId provenance) — may return null. */
  readonly getWorkspace: (workspaceId: string) => Promise<Workspace | null>;
  readonly logger: Logger;
}

/** True for the two terminal RunEvent types the completion hooks fire on. */
function isTerminal(type: RunEvent['type']): type is 'completed' | 'failed' {
  return type === 'completed' || type === 'failed';
}

/**
 * Sum the REAL token usage a terminal RunEvent carries (`data.inputTokens` +
 * `data.outputTokens`), each counted only when a finite non-negative number.
 * Returns 0 when the event carries no usage (⇒ no `token` meter, just `agent_run`).
 */
function totalTokens(event: RunEvent): number {
  const read = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
  return read(event.data?.inputTokens) + read(event.data?.outputTokens);
}

/**
 * Derive the deterministic, path-safe recodergit repoId from a repo full-name or
 * absolute path (lowercase; every non `[a-z0-9_-]` run → `__`). MUST stay in sync
 * with `conductor-module.ts` `repoIdFromRepoRef`, which derives the SAME id at
 * launch-time index; matching ids let this completion-time reindex refresh the
 * exact graph that launch built. Returns '' for an empty ref (⇒ reindex skipped).
 */
function repoIdFromRepoRef(ref: string | undefined): string {
  return (ref ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '__');
}

/**
 * Wrap `inner` so terminal events fire memory harvest + beads completion. Returns
 * `inner` unchanged when neither capability is wired (zero overhead).
 */
export function createCompletionHookSink(
  deps: CompletionHookDeps
): RunEventSinkPort {
  const { inner, brain, codeIntel, getMeter, agentEvent, getRunSignalPush, getMetrics, getWorkspace, logger } = deps;
  if (!brain && !codeIntel && !getMeter && !agentEvent && !getRunSignalPush && !getMetrics) return inner;

  return {
    async append(event: RunEvent): Promise<void> {
      // Durable audit + live stream FIRST — never delayed by a capability hook.
      await inner.append(event);
      if (!isTerminal(event.type)) return;
      const outcome = event.type;

      try {
        const workspaceId =
          typeof event.data?.workspaceId === 'string'
            ? event.data.workspaceId
            : undefined;
        const workspace = workspaceId ? await getWorkspace(workspaceId) : null;
        const taskId = workspace?.taskId ?? event.taskId;
        const userId = workspace?.createdBy;

        // (BE-7.3) RED/USE feed — one truthful increment per emitted terminal
        // event through the frozen MetricsPort (late-bound; unwired ⇒ no-op).
        // Label cardinality is bounded: outcome ∈ {completed,failed}; engine is
        // the event's engine id, else the workspace runtime id, else 'unknown'.
        // Fault-isolated: a registry fault never reaches the other hooks.
        const metrics = getMetrics?.();
        if (metrics) {
          try {
            const engine =
              typeof event.data?.engine === 'string' && event.data.engine !== ''
                ? event.data.engine
                : (workspace?.runtimeId ?? 'unknown');
            metrics.counter(RUNS_TOTAL).inc({ outcome, engine });
            const tokens = metrics.counter(RUN_TOKENS_TOTAL);
            const read = (v: unknown): number =>
              typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
            const inputTokens = read(event.data?.inputTokens);
            const outputTokens = read(event.data?.outputTokens);
            if (inputTokens > 0) tokens.inc({ engine, direction: 'input' }, inputTokens);
            if (outputTokens > 0) tokens.inc({ engine, direction: 'output' }, outputTokens);
          } catch (err) {
            logger.warn({ err, taskId }, 'conductor run-metrics hook faulted');
          }
        }

        // (h) memory harvest — needs a tenant + evidence anchor; else truthful skip.
        if (brain && userId && taskId) {
          void brain
            .harvestOnCompletion({
              userId,
              taskId,
              artifactId: event.artifactId ?? `run_${workspaceId ?? taskId}`,
              ...(event.runId ? { runId: event.runId } : {}),
              outcome,
              scope: 'task-type',
              proposedBy: 'conductor',
            })
            .catch(err =>
              logger.warn({ err, taskId }, 'conductor harvest hook faulted')
            );
        }

        // (i) issue-graph close/note — best-effort; a failed run keeps the issue open.
        if (codeIntel && taskId) {
          void codeIntel
            .completeWork(taskId, outcome)
            .catch(err =>
              logger.warn(
                { err, taskId },
                'conductor beads completeWork hook faulted'
              )
            );
        }

        // (k) code-graph reindex — refresh the recodergit graph for the repo the
        // agent just committed into, keyed by the SAME deterministic repoId the
        // launch-time index used (derived from projectId, worktreePath fallback).
        // Fires on BOTH terminal outcomes (a failed run may still have committed
        // code, and the engine truthfully skips when nothing was indexed). Fire-
        // and-forget + degrade-safe: a reindex fault NEVER stalls the terminal event.
        if (codeIntel && workspace) {
          const repoId = repoIdFromRepoRef(
            workspace.projectId || workspace.worktreePath
          );
          if (repoId) {
            void codeIntel
              .reindexRepo(repoId)
              .catch(err =>
                logger.warn(
                  { err, repoId },
                  'conductor recodergit reindex hook faulted'
                )
              );
          }
        }

        // (§4c) event-bus ↔ RunEvents bridge — publish a `workspace.completed`
        // lifecycle event onto the native openfang kernel bus so kernel triggers can
        // fire background Hands off a finished run. Fire-and-forget + degrade-safe: an
        // absent engine resolves an empty fired list and a fault is swallowed — the
        // terminal event is NEVER stalled or rejected by a publish. Only the outbound
        // hook is wired here; the inbound side (fired-trigger `run_agent` messages →
        // new RunEvents) reuses the existing sink.
        if (agentEvent) {
          void agentEvent
            .publish({
              type: 'workspace.completed',
              ...(workspaceId ? { workspaceId } : {}),
              ...(taskId ? { taskId } : {}),
              outcome,
            })
            .catch(err =>
              logger.warn(
                { err, workspaceId, taskId },
                'conductor kernel event publish hook faulted'
              )
            );
        }

        // (j) billing metering — the run consumed one `agent_run`; meter it durably
        // so the pre-dispatch quota gate actually decrements (idempotent by the
        // workspace/run anchor, so a re-emitted terminal event is a no-op). Needs a
        // resolvable owning subject (`createdBy`) — else a truthful skip. Fire-and-
        // forget + degrade-safe: a metering fault NEVER stalls the terminal event.
        //
        // When the terminal event carries the engine's REAL token usage
        // (`data.inputTokens`/`data.outputTokens` — the native openfang path
        // forwards its token-carrying terminal event here), ALSO meter the real
        // `token` usage. The `agent_run` count stays (the pre-dispatch entitlement
        // gate reads `agent_run`); the `token` meter adds real usage on top of the
        // flat run count. Both are idempotent by anchor, so a re-emit is a no-op.
        const meter = getMeter?.();
        if (meter && userId) {
          // Per-EMISSION anchor: `event.eventId` is unique per emitted terminal
          // event, so a genuine RE-EMIT of the SAME event still dedupes (the meter
          // is `ON CONFLICT DO NOTHING`), while each distinct turn of a continued
          // workspace (turns 1..N, each its own terminal event) gets a distinct key
          // and is metered. The runId is deterministic (`run_${workspaceId}`) and
          // REUSED across continues, and workspaceId is identical for every turn —
          // anchoring on either collapses turns 2..N onto turn 1 and drops their
          // usage. eventId is the only per-turn discriminator, so it anchors here.
          const anchor = event.eventId ?? workspaceId ?? event.runId ?? taskId;
          void meter
            .record({
              subjectId: userId,
              kind: 'agent_run',
              quantity: 1,
              ...(event.runId ? { runId: event.runId } : {}),
              idempotencyKey: `agent_run:${anchor}`,
            })
            .catch(err =>
              logger.warn(
                { err, taskId },
                'conductor agent_run meter hook faulted'
              )
            );

          const tokens = totalTokens(event);
          if (tokens > 0) {
            void meter
              .record({
                subjectId: userId,
                kind: 'token',
                quantity: tokens,
                engine:
                  typeof event.data?.engine === 'string'
                    ? event.data.engine
                    : null,
                ...(event.runId ? { runId: event.runId } : {}),
                idempotencyKey: `token:${anchor}`,
              })
              .catch(err =>
                logger.warn(
                  { err, taskId },
                  'conductor token meter hook faulted'
                )
              );
          }
        }

        // (§8.2 b) ops-recorder REVERSE-PUSH — a terminal run is pushed onto the
        // stuck-work board so a `failed`/`stuck` run surfaces on the SAME board a
        // stale PR does (a human sees a broken run without opening the terminal). A
        // `completed` outcome calls through but is a truthful far-side SKIP (a
        // finished run is not stuck work), so the hook needs no special-casing. The
        // port is late-bound (bootstrap injects it AFTER this sink is built) and
        // satisfied structurally by observability. Fire-and-forget + degrade-safe: an
        // unwired/down port is a truthful no-op and a push fault NEVER stalls or
        // rejects the terminal-event path (`inner.append` already ran + was awaited).
        const push = getRunSignalPush?.();
        if (push) {
          void push
            .forwardRunSignal({
              outcome,
              title: workspace?.projectId ?? `run ${outcome}`,
              reason:
                typeof event.data?.reason === 'string'
                  ? event.data.reason
                  : `run ${outcome}`,
              // The run's PR URL when the terminal event carries one; else null and
              // the far side synthesizes a `recoder://run/<id>` anchor.
              sourceUrl:
                typeof event.data?.prUrl === 'string' ? event.data.prUrl : null,
              ...(event.runId ? { runId: event.runId } : {}),
              ...(workspaceId ? { workspaceId } : {}),
              ...(taskId ? { taskId } : {}),
            })
            .catch(err =>
              logger.warn(
                { err, workspaceId, taskId },
                'conductor run-signal push hook faulted'
              )
            );
        }
      } catch (err) {
        logger.warn(
          { err, eventId: event.eventId },
          'conductor completion hook faulted — terminal event unaffected'
        );
      }
    },
  };
}
