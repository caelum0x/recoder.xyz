/**
 * @recoder/substrate — the swappable, restart-survivable execution layer under
 * every Conductor workspace.
 *
 * One contract (`ConductorSubstrate`) over real coding-agent CLIs driven inside
 * isolated git worktrees (local tmux) or remote sandboxes (Daytona). This barrel
 * is the package's public surface (design §6.1).
 *
 * Stage status: FOUNDATION + self-contained modules are shipped here —
 * contract, types, errors, ports, registry, command (the real 8 headless CLI
 * lines), exec primitives, observe, review, reconcile, the engine, the factory
 * composition root, and the remote/daytona substrate (over the injected Daytona
 * client port). The local/tmux substrate impl is the remaining move and is NOT
 * stubbed.
 */

// === Contract — the seam everyone codes to ===
export type {
  ConductorSubstrate,
  SubstrateLaunchInput,
  SubstrateHandle,
  SubstrateDiff,
  SubstrateAvailability,
  SubstrateCapabilities,
  SubstrateLifecycleEvent,
  SubstrateProvisionedEvent,
  SubstrateLaunchedEvent,
  SubstrateCapturedEvent,
  SubstrateFinishedEvent,
  SubstrateTornDownEvent,
} from './contract/index.js';

// === Types — shared domain-adjacent shapes ===
export type {
  SubstrateId,
  ConductorRuntimeId,
  RuntimeCommandOptions,
  RuntimeSpec,
  ResolvedRuntimeCommand,
  RuntimeAvailability,
  CaptureResult,
  CaptureDelta,
  Liveness,
  LivenessSource,
  ProvisionResult,
  OrphanKind,
  ReconcileFinding,
  SubstrateReconcileReport,
} from './types/index.js';
export { CONDUCTOR_RUNTIME_IDS } from './types/index.js';

// === Command — resolve runtime+prompt → the REAL headless CLI line ===
export {
  RUNTIME_SPECS,
  resolveRuntimeCommand,
  runtimeAvailability,
  shellQuote,
  modelFlag,
  extraArgs,
  isConductorRuntimeId,
  asConductorRuntime,
} from './command/index.js';

// === Exec — low-level process primitives ===
export {
  execFileSafe,
  which,
  commandExists,
  ExecError,
  toExecError,
} from './exec/index.js';
export type { ExecResult, ExecOptions } from './exec/index.js';

// === Errors — typed, narrow-able error surface ===
export {
  SubstrateError,
  SubstrateErrorCode,
  SubstrateUnavailableError,
  SubstrateNotRegisteredError,
  ProvisionError,
  LaunchError,
  HandleGoneError,
  DiffError,
  TeardownError,
  isSubstrateError,
  toErrorPayload,
} from './errors/index.js';
export type { SubstrateErrorOptions, SubstrateErrorPayload } from './errors/index.js';

// === Registry — pluggable substrate registry + selection ===
export {
  SubstrateRegistry,
  defaultRegistry,
  selectSubstrate,
  resolveSubstrate,
} from './registry/index.js';
export type {
  SubstrateSelectable,
  ResolveSubstrateOptions,
  ResolvedSubstrate,
} from './registry/index.js';

// === Review — reviewable-diff mechanism (pure parsing of git output) ===
export {
  parseUntracked,
  countChangedFiles,
  buildSubstrateDiff,
} from './review/index.js';
export type { RawGitDiffOutput } from './review/index.js';

// === Observe — substrate-pure run tailer (poll capture/alive → RunEvents) ===
export {
  startRunTail,
  stopRunTail,
  activeTailCount,
  TailRegistry,
  computeDelta,
  MAX_DELTA_CHARS,
  DEFAULT_INTERVAL_MS,
  DEFAULT_MAX_MS,
  CAPTURE_LINES,
} from './observe/index.js';
export type {
  RunTailInput,
  RunTailerDeps,
  TailSubstrate,
  TailHandle,
  CaptureDeltaResult,
} from './observe/index.js';

// === Ports — every dependency-inversion seam (for backend adapters) ===
export type {
  LoggerPort,
  ClockPort,
  IdPort,
  WorkspaceRepositoryPort,
  RunEventSink,
  BrainPort,
  BrainEnrichInput,
  BrainEnrichResult,
  BrainProvenanceRef,
  GovernancePort,
  ApprovalGuardPort,
  GovernedAction,
  GovernanceContext,
  MetricsPort,
  MetricLabels,
  MemoryCandidatePort,
  DeliveryEvidence,
  MemoryCandidateRef,
  WorkLockPort,
  LockConflictInfo,
  AcquireWorkLockInput,
  AcquireWorkLockResult,
  ReacquireWorkLockResult,
  ReleaseWorkLockInput,
  AdmissionPort,
  AdmissionDecision,
  RunTailerPort,
  RunTailAttachInput,
  SubstrateScanPort,
  SubstrateRegistryPort,
  EngineSubstrate,
  DaytonaClientPort,
  DaytonaExecResult,
  DaytonaExecOptions,
  DaytonaSandboxRef,
} from './ports/index.js';

// === Engine — the orchestration brain (persisted Workspace lifecycle) ===
export { WorkspaceEngine, ADMISSION_REJECTED_PREFIX } from './engine/index.js';
export type {
  WorkspaceEngineDeps,
  CreateWorkspaceInput,
  ReconcileReport,
} from './engine/index.js';

// === Reconcile — restart survivability (join records × live substrate) ===
export { reconcile } from './reconcile/index.js';

// === Remote — off-machine substrate (Daytona) over the injected client port ===
export { createDaytonaSubstrate } from './remote/index.js';
export type { CreateDaytonaSubstrateDeps } from './remote/index.js';

// === Factory — the composition root (ports → registry) ===
export {
  createSubstrateRegistry,
  resolvePorts,
  systemClock,
  uuidId,
} from './factory/index.js';
export type {
  SubstratePorts,
  SubstratePortsInput,
  CreateSubstrateRegistryInput,
} from './factory/index.js';
