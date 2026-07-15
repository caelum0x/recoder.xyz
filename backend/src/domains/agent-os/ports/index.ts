/**
 * Agent-OS ports barrel — the frozen seams other domains + the composer import.
 *
 * Two ports are OWNED here (the domain declares them): the state-of-record
 * repository and the RunEvent ingest bus. Three are CONSUMED (re-declared as
 * thin seams over other domains / packages): the governance gate (ceded to
 * governance — conflicts #2/#5), the CloudEvents outbox publisher, and the
 * instruction compiler (from `@recoder/agent-instructions`).
 */

// — Owned seams —
export type {
  AgentOsRepositoryPort,
  AgentOsRepositorySnapshot,
  RepositoryResult,
} from './agent-os-repository.port.js';
export type {
  RunEventBusPort,
  RunEventEnvelope,
  RunEventSource,
  RunEventHandler,
  RunEventSubscription,
  RunEventIngestResult,
  RunEventRejection,
  RunEventRejectionReason,
} from './run-event.port.js';

// — Consumed seams —
export type {
  GovernanceGate,
  GovernanceGatePort,
  GovernanceAction,
  GateDecisionContext,
  GateVerdict,
  AuditEntryInput,
  AuditRecord,
} from './governance-gate.port.js';
export type { OutboxPublisherPort } from './outbox-publisher.port.js';
export type {
  InstructionCompilerPort,
  CompileAgentOsInstructionBundleInput,
  CompileAgentOsInstructionBundleResult,
} from './instruction-compiler.port.js';
