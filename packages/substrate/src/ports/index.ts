/**
 * ports/ barrel — every dependency-inversion seam (design §4.9 / §7).
 *
 * Dependency inversion is what lets `@recoder/substrate` stay free of
 * `docker-backend`, the logger, the Daytona client, the brain, and governance.
 * Every external dependency is an interface here; the backend's
 * `docker-backend/src/conductor/wiring/*` provides the concrete adapters.
 */
export type { LoggerPort } from './logger.port.js';
export type { ClockPort } from './clock.port.js';
export type { IdPort } from './id.port.js';
export type { WorkspaceRepositoryPort } from './repository.port.js';
export type { RunEventSink } from './run-event-sink.port.js';
export type {
  WorkLockPort,
  LockConflictInfo,
  AcquireWorkLockInput,
  AcquireWorkLockResult,
  ReacquireWorkLockResult,
  ReleaseWorkLockInput,
} from './work-lock.port.js';
export type { AdmissionPort, AdmissionDecision } from './admission.port.js';
export type {
  RunTailerPort,
  RunTailAttachInput,
} from './run-tailer.port.js';
export type { SubstrateScanPort } from './substrate-scan.port.js';
export type {
  SubstrateRegistryPort,
  EngineSubstrate,
} from './substrate-registry.port.js';
export type {
  BrainPort,
  BrainEnrichInput,
  BrainEnrichResult,
  BrainProvenanceRef,
} from './brain.port.js';
export type {
  GovernancePort,
  ApprovalGuardPort,
  GovernedAction,
  GovernanceContext,
} from './governance.port.js';
export type { MetricsPort, MetricLabels } from './metrics.port.js';
export type {
  MemoryCandidatePort,
  DeliveryEvidence,
  MemoryCandidateRef,
} from './memory.port.js';
