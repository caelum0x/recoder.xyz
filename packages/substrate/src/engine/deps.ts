/**
 * WorkspaceEngineDeps — the injected seams the workspace engine drives.
 *
 * The engine is substrate-agnostic and backend-free: it owns the persisted
 * Workspace lifecycle (state of record) and orchestrates the selected substrate
 * through these ports. The backend's thin `workspace-service` adapter constructs
 * the engine with concrete adapters (agent-os repository, conductor-locks,
 * bundle.enrichPrompt, the substrate registry, the run-tailer, the resource
 * governor); tests construct it with fakes. Nothing here performs IO directly.
 */
import type { SubstrateRegistryPort } from '../ports/substrate-registry.port.js';
import type { LoggerPort } from '../ports/logger.port.js';
import type { ClockPort } from '../ports/clock.port.js';
import type { IdPort } from '../ports/id.port.js';
import type { WorkspaceRepositoryPort } from '../ports/repository.port.js';
import type { BrainPort } from '../ports/brain.port.js';
import type { WorkLockPort } from '../ports/work-lock.port.js';
import type { AdmissionPort } from '../ports/admission.port.js';
import type { RunTailerPort } from '../ports/run-tailer.port.js';
import type { SubstrateScanPort } from '../ports/substrate-scan.port.js';

export interface WorkspaceEngineDeps {
  /** Registry of registered substrates (selects the launch/exit-code impl by id). */
  registry: SubstrateRegistryPort;
  /** Canonical Workspace/Run/Event/Task persistence (state of record). */
  repository: WorkspaceRepositoryPort;
  /** Prompt enrichment (task constraints + context-pack + docs); raw prompt when absent. */
  brain?: BrainPort;
  /** Collision-prevention write-lock (acquire before launch, re-acquire on reconcile). */
  lock?: WorkLockPort;
  /** Resource governor admission (refuse over-budget launches truthfully). */
  admission?: AdmissionPort;
  /** Run-tailer attach (stream terminal output into the RunEvent log). */
  runTailer: RunTailerPort;
  /** Direct-substrate queries for reconcile (live sessions + worktrees on disk). */
  scan: SubstrateScanPort;
  /** Structured logger. */
  logger: LoggerPort;
  /** Injected clock (ISO + epoch ms) for deterministic timestamps under test. */
  clock: ClockPort;
  /** Injected id generator (workspace/event ids). */
  id: IdPort;
}
