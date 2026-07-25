/**
 * Conductor domain ports — the barrel of every dependency-inversion seam.
 *
 * The composer (`conductor-module.ts`) constructs the `@recoder/substrate`
 * `WorkspaceEngine` with concrete adapters for these ports; tests construct it
 * with fakes. Business logic depends on these interfaces, never on a driver.
 *
 * Grouping:
 *  - Persistence:  WorkspaceRepositoryPort (+ run-tails / reconcile-findings)
 *  - Substrates:   SubstrateRegistryPort / EngineSubstrate (from @recoder/substrate)
 *  - Emission:     RunEventSink / RunEventSinkPort / RunEventEmitterPort
 *  - Admission:    AdmissionPort, WorkLockPort, BrainPort
 *  - Surface:      TerminalStreamPort (consumed by edge), GovernanceGatePort (write seam)
 */

// --- Persistence (conductor-owned + substrate base) ---
export type {
  WorkspaceRepositoryPort,
  RunTailCursor,
  PersistRunTailInput,
  PersistReconcileFindingInput,
} from './workspace-repository.port.js';

// --- Substrate registry + contract ---
export type {
  SubstrateRegistryPort,
  EngineSubstrate,
  ConductorSubstrate,
  SubstrateLaunchInput,
  SubstrateHandle,
  SubstrateAvailability,
  SubstrateCapabilities,
} from './substrate-registry.port.js';

// --- Run-event emission (durable + live fan-out) ---
export type {
  RunEventSink,
  RunEventSinkPort,
  RunEventEmitterPort,
} from './run-event-sink.port.js';

// --- Admission / locks / enrichment ---
export type {
  AdmissionPort,
  AdmissionDecision,
} from './admission.port.js';
export type {
  WorkLockPort,
  AcquireWorkLockInput,
  AcquireWorkLockResult,
  ReacquireWorkLockResult,
  LockConflictInfo,
} from './work-lock.port.js';
export type {
  CoordinationAdmissionPort,
  CoordinationAdmissionInput,
  CoordinationAdmissionOptions,
  CoordinationAdmissionDecision,
} from './coordination-admission.port.js';
export type {
  BrainPort,
  BrainEnrichInput,
  BrainEnrichResult,
  BrainProvenanceRef,
} from './brain.port.js';

// --- Live steering (send-keys transport into the interactive session) ---
export type {
  SteerTransportPort,
  SteerKeysInput,
} from './steer-transport.port.js';

// --- Per-worktree `.mcp.json` injection (Recoder toolbelt into launched agents) ---
export type {
  McpInjectPort,
  McpInjectResult,
} from './mcp-inject.port.js';

// --- Exposed surface: terminal WS + the governance write seam ---
export type {
  TerminalStreamPort,
  WorkspaceSyncEvent,
} from './terminal-stream.port.js';
export type {
  GithubStatusPort,
  GithubStatusView,
  GithubStatusSource,
  GithubAccountView,
  GithubRepoView,
} from './github-status.port.js';
export type {
  GovernanceGatePort,
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  GovernanceEffect,
  RiskTier,
  AuditEntryInput,
  AuditRecord,
} from './governance-gate.port.js';
export type { AuditReaderPort } from './audit-reader.port.js';

// --- Reverse-push: terminal run outcome → ops-recorder stuck-work board ---
export type {
  RunSignalPushPort,
  ConductorRunOutcome,
  RunSignalPushResult,
} from './run-signal-push.port.js';
