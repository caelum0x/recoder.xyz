/**
 * The conductor run-event pipeline, assembled for the `ConductorComposer` ctor:
 * local durable+live sink → external state-of-record fan-out → completion hook
 * (memory harvest / beads close / metering / metrics) → sibling awareness →
 * the live run tailer. Moved VERBATIM from the composer ctor; the late-bound
 * reads (`getMeter`/`getRunSignalPush`/`getMetrics`, the steer/siblings seams)
 * stay closures so bootstrap setters bind after construction, unchanged.
 */
import { systemClock, uuidId } from '@recoder/substrate';
import type { Logger } from '../../../shared/logger.js';
import type { Principal } from '../../identity/types.js';
import type { MetricsPort } from '../../observability/ports/metrics.port.js';
import type { UsageMeterPort } from '../ports/usage-meter.port.js';
import type { RunSignalPushPort } from '../ports/run-signal-push.port.js';
import type { RunEventSinkPort } from '../ports/run-event-sink.port.js';
import type { WorkspaceRepositoryPort } from '../ports/workspace-repository.port.js';
import type { SteerInput, SubstrateKind } from '../types.js';
import type { CompareView } from '../services/compare.service.js';
import type { ConductorConfig } from '../config.js';
import type { ConductorBrainMemory } from '../adapters/brain-memory.adapter.js';
import type { CodeIntelPort } from '../ports/code-intel.port.js';
import type { ConductorRegistry } from '../adapters/substrate-registry.adapter.js';
import { toLoggerPort } from '../adapters/logger.adapter.js';
import { createRunEventSink } from '../adapters/run-event-sink.adapter.js';
import { createCompletionHookSink } from '../adapters/completion-hook.adapter.js';
import { createSiblingAwarenessSink } from '../adapters/sibling-awareness.adapter.js';
import {
  createRunTailer,
  type ConductorRunTailer,
} from '../adapters/run-tailer.adapter.js';
import type { TerminalStreamService } from '../terminal/terminal-stream.js';
import type { ConductorWriteResult } from './shared.js';

/**
 * The fixed internal identity sibling-awareness steers run under (recoder-i499).
 * A service principal (never a request credential) so the mid-run note delivery
 * clears the SAME governed `workspace.steer` path an operator uses — every
 * delivery is gated + audited, and a policy deny is a truthful skip.
 */
const SIBLING_AWARENESS_PRINCIPAL: Principal = {
  userId: 'internal-service',
  scopes: ['internal', 'read', 'write'],
  kind: 'internal',
  isAnonymous: false,
  raw: { kind: 'conductor-sibling-awareness' },
};

export interface RunEventPipelineArgs {
  readonly log: Logger;
  readonly cfg: ConductorConfig;
  readonly registry: ConductorRegistry;
  readonly repository: WorkspaceRepositoryPort;
  readonly terminalService: TerminalStreamService;
  /** The optional external state-of-record sink (the agent-os RunEvent bus). */
  readonly externalSink: RunEventSinkPort | undefined;
  readonly brain?: ConductorBrainMemory;
  readonly codeIntel?: CodeIntelPort;
  /** Late-bound bootstrap seams — read per terminal event, never snapshotted. */
  readonly getMeter: () => UsageMeterPort | undefined;
  readonly getRunSignalPush: () => RunSignalPushPort | undefined;
  readonly getMetrics: () => MetricsPort | undefined;
  /** The facade's governed cross-group seams (sibling awareness delivery). */
  readonly siblings: (workspaceId: string) => Promise<CompareView | null>;
  readonly steer: (
    input: SteerInput,
    principal: Principal
  ) => Promise<ConductorWriteResult<void>>;
}

/** Assemble the decorated run-event sink chain + the live run tailer. */
export function buildRunEventPipeline(
  args: RunEventPipelineArgs
): ConductorRunTailer {
  const { log, cfg, registry, repository, terminalService, externalSink } =
    args;
  // Durable + live run-event sink; the tailer emits through it. When an external
  // state-of-record sink is injected (the agent-os RunEvent bus, adapted at the
  // composition root), fan out to it FIRST so the control plane sees every event,
  // then to the conductor-local live sink. A failing external ingest is
  // isolated (logged, swallowed) so the live terminal stream never stalls.
  //
  // DURABILITY OWNERSHIP (P1 #8): the local sink durably appends ONLY when there
  // is NO external durable sink. With the bus wired, the bus IS the durable
  // state-of-record writer (`repository.appendEvent` now delegates to the SAME
  // agent-os store); a second local durable append would duplicate every event.
  const localSink = createRunEventSink({
    repository,
    persistDurably: !externalSink,
    publish: event => terminalService.publishSync(event),
    publishRun: (workspaceId, event) =>
      terminalService.publishRunEvent(workspaceId, event),
    logger: log,
  });
  const fannedSink = composeRunEventSink(localSink, externalSink, log, repository);
  // Terminal-event hook (h + i): on a `completed`/`failed` RunEvent the run flow
  // HARVESTS an evidence-backed memory candidate (brain) and CLOSES/NOTES the bd
  // issue (code-intel). Both are fire-and-forget + degrade-safe — a memory/beads
  // fault NEVER rethrows into the terminal-event path or stalls the live stream.
  const completionSink = createCompletionHookSink({
    inner: fannedSink,
    ...(args.brain ? { brain: args.brain } : {}),
    ...(args.codeIntel ? { codeIntel: args.codeIntel } : {}),
    // Late-bound meter: the sink reads it per terminal event, so bootstrap can
    // inject the billing meter AFTER this module is constructed (setUsageMeter).
    getMeter: args.getMeter,
    // Late-bound reverse-push (§8.2 b): the sink reads it per terminal event, so
    // bootstrap can inject the ops-recorder push port AFTER this module is
    // constructed (setRunSignalPush). Unwired ⇒ a truthful no-op (no push).
    getRunSignalPush: args.getRunSignalPush,
    // Late-bound metrics (BE-7.3): the sink reads the frozen MetricsPort per
    // terminal event, so bootstrap can inject it AFTER observability is
    // composed (setMetrics). Unwired ⇒ a truthful no-op (no series recorded).
    getMetrics: args.getMetrics,
    getWorkspace: id => repository.getWorkspace(id),
    logger: log,
  });
  // Sibling awareness (recoder-i499): the OUTERMOST decorator. v1: when one
  // taskGroup sibling finishes, every still-RUNNING sibling gets a terse
  // paths+stats note steered into its live session through the SAME governed
  // steer path (internal principal ⇒ gated + audited), plus a `log` evidence
  // event (`data.kind: sibling_context_delivered`) on the receiver. v2: mid-run
  // MILESTONE broadcasts — the sink treats every mid-run event as a throttled
  // tick over the same `siblings` read model (first nonzero diff, then +N
  // files/+lines steps) and steers a one-line progress note, rate-capped and
  // deduped per receiver, evidence reused with a `milestone` marker. Everything
  // is fire-and-forget + per-sibling degrade-safe — a failed delivery NEVER
  // touches the event path. Late-bound reads: the closures resolve the facade's
  // engine/steerTransport per event, after construction.
  const sink = createSiblingAwarenessSink({
    inner: completionSink,
    getWorkspace: id => repository.getWorkspace(id),
    // Principal-less ⇒ the FULL group (an internal read, like merge evidence).
    siblings: id => args.siblings(id),
    steer: input => args.steer(input, SIBLING_AWARENESS_PRINCIPAL),
    logger: log,
  });
  // Path (b) token accounting: late-bind the completion-hook sink into the
  // native openfang (`in_process`) substrate so its terminal event (workspaceId
  // + real input/outputTokens) meters REAL `token` usage (the sink does not exist
  // when the substrate is built in bootstrap). Degrade-safe: the substrate absent
  // / not shaped ⇒ a truthful no-op (tokens stay unmetered).
  try {
    const inProc = registry.getFull('in_process' as SubstrateKind) as Partial<{
      setRunSink(s: typeof sink): void;
    }>;
    inProc.setRunSink?.(sink);
  } catch {
    /* in_process not registered in this composition — nothing to wire */
  }
  // Live streaming driver: the tailer drives `@recoder/substrate`
  // `startRunTail` against the REGISTERED substrate's capture/alive/exitCode,
  // and — when `tmuxControlMode` is on, the run is on `tmux_worktree`, and the
  // injected tmux binary provably speaks control mode — `selectControlModeTail`
  // wraps that substrate so real-time `%output` streams into `log` RunEvents
  // (the poller stays the liveness/exit-code authority). Any gate failing ⇒
  // the plain poll tailer, the truthful degrade. Substrate resolution is
  // truthful: an unregistered id returns `undefined` (attach marker only, no
  // fabricated stream).
  return createRunTailer({
    sink,
    logger: log,
    live: {
      resolveSubstrate: id => {
        try {
          return registry.getFull(id as SubstrateKind);
        } catch {
          return undefined;
        }
      },
      config: cfg,
      clock: systemClock,
      id: uuidId,
      logger: toLoggerPort(log),
    },
  });
}

/**
 * Fan a `RunEvent` out to the injected external state-of-record sink (agent-os)
 * AND the conductor-local durable+live sink. The external ingest runs first but is
 * isolated: a rejection is logged and swallowed so the local durable append + live
 * `/sync` publish always run (a state-plane hiccup never stalls the terminal). When
 * no external sink is injected, the local sink is returned unchanged.
 */
export function composeRunEventSink(
  local: RunEventSinkPort,
  external: RunEventSinkPort | undefined,
  logger: Logger,
  repository: WorkspaceRepositoryPort
): RunEventSinkPort {
  if (!external) return local;
  return {
    async append(event): Promise<void> {
      try {
        await external.append(event);
      } catch (err) {
        logger.error(
          { err, eventId: event.eventId },
          'conductor run-event state-of-record ingest failed'
        );
        // DURABILITY FALLBACK (recoder-iq2c): the external bus is the SOLE durable
        // writer here (the local sink is live-only when a bus is wired), so a
        // swallowed external failure would DROP the event from the state-of-record
        // while it still published live — the durable log/audit trail would
        // permanently diverge (a completed/failed run could vanish after restart).
        // Persist it durably here instead. appendEvent is idempotent by eventId,
        // so a later external replay is a no-op.
        try {
          await repository.appendEvent(event);
        } catch (durErr) {
          logger.error(
            { err: durErr, eventId: event.eventId },
            'conductor run-event durable FALLBACK append failed — event may be lost'
          );
        }
      }
      await local.append(event);
    },
  };
}
