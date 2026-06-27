/**
 * @recoder/coordination — public API barrel.
 *
 * This is the ONLY entry consumers import. It exposes the composed engine, the
 * validated command/query boundary, the pure standalone services, the domain
 * types, the ports (for adapter authors), the built-in adapters, and the
 * errors/result/config surface — exactly per design §8.
 */

// ── Domain types (owned, fused from agent-os + a2a, extended here) ───────────
export type {
  // ids
  LockId,
  ClaimId,
  HandoffId,
  DelegationId,
  SquadId,
  RunId,
  TaskId,
  SpaceId,
  AgentId,
  EventId,
  SignalId,
  // clock
  Clock,
  // locks
  WorkLock,
  LockKind,
  AcquireLockRequest,
  ReleaseLockRequest,
  RenewLockRequest,
  LockConflict,
  ConflictKind,
  LockLease,
  // claims
  TaskClaim,
  ClaimStatus,
  ClaimRecoveryWindow,
  // dependency graph
  DependencyEdge,
  DepKind,
  TaskNode,
  TaskLifecycleState,
  // dispatch
  RoutingCandidate,
  RoutingDecision,
  OrchestrationPattern,
  AggregationStrategy,
  DispatchDecision,
  LockReservation,
  // handoff
  Handoff,
  HandoffStatus,
  HandoffIntent,
  ParsedHandoffIntent,
  HandoffEnvelope,
  DelegationChain,
  DelegationLink,
  // squad / presence
  Squad,
  SquadMember,
  SquadRole,
  MemberKind,
  SquadActivityEntry,
  SquadAssignment,
  SquadAssignmentStatus,
  AgentPresence,
  PresenceStatus,
  // signals / coherence / events
  WorkSignal,
  WorkSignalReason,
  WorkSignalSeverity,
  WorkSignalSource,
  WorkSignalStatus,
  CoherenceFinding,
  DriftKind,
  FindingDisposition,
  CoordinationEvent,
  CoordinationEventType,
  EventScope,
  // effects
  Effect,
  EffectType,
} from './domain';

export {
  lockCoversPath,
  locksAreCompatible,
  isTerminalTaskState,
  isWithinRecoveryWindow,
  isHeartbeatStale,
  fixedClock,
  LOCK_KINDS,
  CONFLICT_KINDS,
  CLAIM_STATUSES,
  DEP_KINDS,
  TERMINAL_TASK_STATES,
  ORCHESTRATION_PATTERNS,
  AGGREGATION_STRATEGIES,
  HANDOFF_INTENTS,
  HANDOFF_INTENT_PREFIXES,
  HANDOFF_STATUSES,
  MEMBER_KINDS,
  SQUAD_ASSIGNMENT_STATUSES,
  PRESENCE_STATUSES,
  WORK_SIGNAL_REASONS,
  WORK_SIGNAL_SEVERITIES,
  WORK_SIGNAL_SOURCES,
  WORK_SIGNAL_STATUSES,
  COORDINATION_WORK_SIGNAL_REASONS,
  DRIFT_KINDS,
  COORDINATION_EVENT_TYPES,
} from './domain';

// ── Ports (for adapter authors) ─────────────────────────────────────────────
export type {
  LockStorePort,
  LockScope,
  ClaimStorePort,
  DependencyStorePort,
  HandoffStorePort,
  SquadStorePort,
  PresenceStorePort,
  SignalSinkPort,
  EventBusPort,
  EventHandler,
  Unsubscribe,
  AgentDirectoryPort,
  DirectoryAgent,
  DirectoryAgentHealth,
  DirectoryAgentPermissions,
  PolicyGatePort,
  PolicyQuery,
  PolicyDecision,
  PolicyAction,
  ApprovalGatePort,
  ApprovalRequest,
  ApprovalRecord,
  ApprovalStatus,
  ClockPort,
  IdGeneratorPort,
  LeaseFencerPort,
  MetricsPort,
  MetricLabels,
} from './ports';

// ── Errors & Result ─────────────────────────────────────────────────────────
export {
  CoordinationError,
  CoordinationErrorCode,
  LockConflictError,
  ClaimConflictError,
  ClaimLostError,
  DependencyBlockedError,
  HandoffDepthExceededError,
  HandoffCycleError,
  FenceTokenViolationError,
  isCoordinationError,
  toCoordinationError,
  tryResult,
  tryResultAsync,
} from './errors';

export {
  ok,
  err,
  map,
  mapErr,
  andThen,
  unwrapOr,
  isOk,
  isErr,
} from './result';
export type { Result, Ok, Err } from './result';

// ── Config ──────────────────────────────────────────────────────────────────
export type { CoordinationConfig, CoordinationFeatureFlags } from './config';
export {
  loadCoordinationConfig,
  DEFAULT_COORDINATION_CONFIG,
  DEFAULT_FEATURE_FLAGS,
} from './config';

// ── Utilities (shared single-owner helpers) ─────────────────────────────────
export {
  globsOverlap,
  globMatchesPath,
  pathMatchesRule,
  normalizeGlob,
  globRoot,
  rootContains,
  hashString,
  hashHex,
  hashParts,
  invariant,
  assertNever,
  InvariantViolation,
  BoundedSet,
} from './util';

// ── Engine (the primary entry) ──────────────────────────────────────────────
export { CoordinationEngine } from './engine/coordination-engine';
export { buildCoordinationEngine } from './engine/engine-builder';
export type { CoordinationEngineOptions } from './engine/engine-builder';
export type { CommandResult, QueryResult } from './engine';
export {
  EffectRunner,
  runEffect,
  runEffects,
  commitTransaction,
} from './engine';
export type { EffectRunnerPorts, TransactionPorts } from './engine';

// ── Commands & queries (validated boundary) ─────────────────────────────────
export type {
  CoordinationCommand,
  AcquireLockCommand,
  ReleaseLockCommand,
  RenewLockCommand,
  DispatchTaskCommand,
  InitiateHandoffCommand,
  ReconcileCommand,
} from './engine/commands';
export type {
  CoordinationQuery,
  ActiveLocksQuery,
  ReadySetQuery,
  DriftReportQuery,
} from './engine/queries';
export { commandSchema, querySchema } from './engine';

// ── Pure services (usable standalone, no IO) ────────────────────────────────
export { LockService } from './locks/lock-service';
export { RoutingService } from './dispatch/routing-service';
export { ClaimCoordinator } from './dispatch/claim-coordinator';
export { Reconciler } from './coherence/reconciler-service';
export { DelegationChainService } from './handoff/delegation-chain-service';

// ── Module shells (impure, port-driven) ─────────────────────────────────────
export { LockManager } from './locks/lock-manager';
export { DispatchManager } from './dispatch/dispatch-manager';
export { HandoffService } from './handoff/handoff-service';
export { HandoffBus } from './handoff/handoff-bus';

// ── Built-in adapters ───────────────────────────────────────────────────────
export * as memory from './persistence/memory';
export * as postgres from './persistence/postgres';
export { InProcEventBus } from './transport/inproc-event-bus';
// TODO(wave-2): export { NatsEventBus } from './transport/nats-event-bus';
