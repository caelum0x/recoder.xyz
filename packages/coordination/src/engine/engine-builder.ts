/**
 * engine-builder — functional-options DI for the CoordinationEngine.
 *
 * It takes the full set of ports + the config and assembles the module shells
 * (LockManager, DispatchManager, HandoffService, Reconciler), the command/query
 * buses, and returns a ready `CoordinationEngine`. This is the ONLY place the
 * concrete wiring lives; the engine itself stays a thin facade.
 *
 * All store/transport/clock/id/fencer/metrics dependencies are injected as
 * ports so the same engine runs against the in-memory adapters (tests,
 * single-process) or the Postgres/NATS adapters (wave-2) with no engine change.
 */

import type { CoordinationConfig } from '../config/coordination-config';
import { Reconciler } from '../coherence';
import type { CoherenceEffectPorts } from '../coherence/coherence-effects';
import type {
  ClaimSnapshotPort,
  RunProjectionPort,
  SnapshotLoaderDeps,
  SquadMemberViewPort,
} from '../coherence/snapshot-loader';
import { DispatchManager } from '../dispatch';
import { HandoffService } from '../handoff/handoff-service';
import type { ContextTransferPort } from '../handoff/context-transfer';
import { LockManager } from '../locks';
import type {
  AgentDirectoryPort,
  ApprovalGatePort,
  ClaimStorePort,
  ClockPort,
  DependencyStorePort,
  EventBusPort,
  HandoffStorePort,
  IdGeneratorPort,
  LeaseFencerPort,
  LockStorePort,
  MetricsPort,
  PolicyGatePort,
  PresenceStorePort,
  SignalSinkPort,
  SquadStorePort,
} from '../ports';
import { CommandBus } from './command-bus';
import { CoordinationEngine } from './coordination-engine';
import { QueryBus } from './query-bus';

/**
 * The full port set the engine needs. The store/event ports come from
 * `persistence/*` + `transport/*`; the clock/ids/fencer/metrics come from the
 * supporting in-process adapters (or production equivalents).
 */
export type CoordinationEngineOptions = {
  config: CoordinationConfig;
  ports: {
    lockStore: LockStorePort;
    claimStore: ClaimStorePort;
    /** Bulk claim read for ready-set + reconcile snapshot (memory store provides both). */
    claimSnapshot: ClaimSnapshotPort;
    dependencyStore: DependencyStorePort;
    handoffStore: HandoffStorePort;
    /** Reserved for squad-dispatch wiring (wave-2); accepted but not yet consumed. */
    squadStore?: SquadStorePort;
    presenceStore: PresenceStorePort;
    signalSink: SignalSinkPort;
    eventBus: EventBusPort;
    agentDirectory: AgentDirectoryPort;
    policyGate: PolicyGatePort;
    approvalGate: ApprovalGatePort;
    clock: ClockPort;
    ids: IdGeneratorPort;
    fencer: LeaseFencerPort;
    metrics: MetricsPort;
    /** Optional coherence liveness projections (empty when omitted). */
    runProjection?: RunProjectionPort;
    squadProjection?: SquadMemberViewPort;
    /** Optional handoff context-transfer port (skipped when omitted). */
    contextTransfer?: ContextTransferPort;
  };
  /** Optional override for which spaces the reconciler scans each tick. */
  reconcileSpaceIds?: () => string[] | undefined;
};

/** Assemble a CoordinationEngine from ports + config. */
export function buildCoordinationEngine(
  options: CoordinationEngineOptions,
): CoordinationEngine {
  const { config, ports } = options;

  // ── locks ────────────────────────────────────────────────────────────────────
  const lockManager = new LockManager({
    store: ports.lockStore,
    fencer: ports.fencer,
    ids: ports.ids,
    clock: ports.clock,
    events: ports.eventBus,
    metrics: ports.metrics,
  });

  // ── dispatch ───────────────────────────────────────────────────────────────────
  const dispatchManager = new DispatchManager({
    agentDirectory: ports.agentDirectory,
    claimStore: ports.claimStore,
    lockStore: ports.lockStore,
    dependencyStore: ports.dependencyStore,
    presenceStore: ports.presenceStore,
    policyGate: ports.policyGate,
    clock: ports.clock,
    ids: ports.ids,
    fencer: ports.fencer,
    metrics: ports.metrics,
    config: {
      leaseMs: config.dispatch.leaseMs,
      recoveryWindowMs: config.claim.recoveryWindowMs,
      maxConcurrency: config.dispatch.maxConcurrency,
      dispatchDryRun: config.flags.dispatchDryRun,
    },
  });

  // ── handoff ────────────────────────────────────────────────────────────────────
  const handoffService = new HandoffService({
    directory: ports.agentDirectory,
    approvals: ports.approvalGate,
    store: ports.handoffStore,
    ids: ports.ids,
    clock: ports.clock,
    ...(ports.contextTransfer ? { context: ports.contextTransfer } : {}),
    spaceApprovalRequired: config.flags.handoffApprovalGate,
  });

  // ── coherence ──────────────────────────────────────────────────────────────────
  const loader: SnapshotLoaderDeps = {
    clock: ports.clock,
    lockStore: ports.lockStore,
    claimStore: ports.claimSnapshot,
    dependencyStore: ports.dependencyStore,
    presenceStore: ports.presenceStore,
    signalSink: ports.signalSink,
    config,
    ...(ports.runProjection ? { runProjection: ports.runProjection } : {}),
    ...(ports.squadProjection ? { squadProjection: ports.squadProjection } : {}),
  };
  const coherenceEffects: CoherenceEffectPorts = {
    lockStore: ports.lockStore,
    presenceStore: ports.presenceStore,
    signalSink: ports.signalSink,
    eventBus: ports.eventBus,
    clock: ports.clock,
  };
  const reconciler = new Reconciler({
    loader,
    effects: coherenceEffects,
    ids: ports.ids,
    config,
    ...(options.reconcileSpaceIds ? { spaceIds: options.reconcileSpaceIds } : {}),
  });

  // ── buses ────────────────────────────────────────────────────────────────────
  const commandBus = new CommandBus({
    lockManager,
    dispatchManager,
    handoffService,
    reconciler,
    handoffMaxDepth: config.handoff.maxDepth,
  });
  const queryBus = new QueryBus({
    lockManager,
    dependencyStore: ports.dependencyStore,
    claimStore: ports.claimStore,
    claimSnapshot: ports.claimSnapshot,
    signalSink: ports.signalSink,
  });

  return new CoordinationEngine({
    commandBus,
    queryBus,
    lockManager,
    dispatchManager,
    handoffService,
    reconciler,
  });
}
