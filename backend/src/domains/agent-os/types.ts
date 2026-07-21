/**
 * Agent-OS domain-internal types — DTOs that are NOT published in `packages/*`
 * and NOT part of the frozen ports. The wire/domain types come from
 * `@recoder/agent-os` + `@recoder/agent-schemas`; the port contracts live in
 * `ports/*`. This file carries only the composer's assembly + runtime-stat
 * shapes (domain doc §2 `types.ts`).
 */
import type { Router } from 'express';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from './ports/governance-gate.port.js';
import type { InstructionCompilerPort } from './ports/instruction-compiler.port.js';
import type { OutboxPublisherPort } from './ports/outbox-publisher.port.js';
import type { AgentOsRepositoryPort } from './ports/agent-os-repository.port.js';
import type { SquadConductorPort } from './ports/squad-autopilot.port.js';
import type { CoordinationEnginePort } from './ports/coordination-engine.port.js';
import type { EngineClientPort } from '../engines/ports/engine-client.port.js';
import type { BrowserVerifyRunner } from './ports/browser-verify.port.js';
import type { WorkflowDriver, WorkflowEnginePort } from '@recoder/agent-workflows';
import type { AgentOsConfigOverrides } from './config.js';

/**
 * Dependencies injected by bootstrap AFTER persistence + identity + governance
 * are built (serial integration — the wiring, not the ports, is what waits).
 * The composer is a PURE factory over these — no top-level singletons, no env
 * reads (REPLACES the legacy `agentOsContainer`).
 */
export interface AgentOsDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the pg repository adapter binds to (null → json/memory degrade). */
  readonly executor?: QueryExecutor | null;
  /** The composed identity auth middleware the `/api/agent-os/*` edges guard with. */
  readonly middleware: AuthMiddleware;
  /** THE write seam consumed from the governance domain (every write gate-checks). */
  readonly gate: GovernanceGate;
  /** Not-yet-in-AppConfig agent-os values (NATS url, feature flags, driver override). */
  readonly overrides?: AgentOsConfigOverrides;
  /**
   * Optional pre-built seams for tests / explicit composition. When omitted the
   * composer builds the concrete adapters from `AgentOsConfig`.
   */
  readonly repository?: AgentOsRepositoryPort;
  readonly outboxPublisher?: OutboxPublisherPort;
  readonly instructionCompiler?: InstructionCompilerPort;
  /**
   * The browser-use `EngineClientPort` (`engines.client('browser-use')`) that
   * backs the workflow `browser-check` node handler (navigate → assert →
   * screenshot → summary artifact). Absent ⇒ `browser-check` nodes degrade to a
   * truthful `skipped` (browsing is evidence-gathering — never a faked verdict,
   * never a blocked run). Only consulted when no explicit `workflowDriver` is
   * injected (the default `AgentOsWorkflowRunnerDriver` wires the handler).
   */
  readonly browserEngine?: EngineClientPort | null;
  /**
   * The injected browser-verification runner (the engines `executeBrowserVerification`,
   * bound at the composition root). The default `AgentOsWorkflowRunnerDriver` wires the
   * `browser-check` node handler over it + `browserEngine`. Absent ⇒ the handler is not
   * registered, so a `browser-check` node degrades to a truthful `skipped` (unhandled) —
   * the same posture as a null engine, with zero cross-domain value coupling in agent-os.
   * Only consulted when no explicit `workflowDriver` is injected.
   */
  readonly browserVerifyRunner?: BrowserVerifyRunner;
  /**
   * The narrow conductor dispatch seam the autopilot launches workspaces
   * through. Bootstrap builds the conductor AFTER agent-os, so this is usually
   * attached late via `attachSquadAutopilotConductor` instead.
   */
  readonly conductorDispatch?: SquadConductorPort | null;
  /**
   * The workflow dispatch seam — the frozen `@recoder/agent-workflows`
   * `WorkflowDriver`. Absent ⇒ workflow CRUD still works over the in-memory
   * store, but `/workflows/:id/dispatch` degrades truthfully to `not_configured`
   * (never a faked run). Bootstrap injects a concrete driver once the runtime
   * seams are built.
   */
  readonly workflowDriver?: WorkflowDriver | null;
  /**
   * The native openfang workflow engine (`createOpenfangWorkflowDriver()`,
   * adapted). When present the default `AgentOsWorkflowRunnerDriver` wires the
   * native-workflow `executeTool` handler so a `tool` node marked
   * `config.workflow` dispatches register_workflow/run_workflow inside the kernel
   * `.node` — the FIRST real consumer of that subsystem. Absent ⇒ the handler is
   * not registered (unhandled tool nodes keep failing truthfully). Only consulted
   * when no explicit `workflowDriver` is injected.
   */
  readonly nativeWorkflowEngine?: WorkflowEnginePort | null;
  /**
   * The Multica coordination introspection seam (squad routing / work-locks /
   * conflict detection). Absent ⇒ the composer builds the default
   * `MulticaCoordinationAdapter` over `MULTICA_URL`; when THAT is unset the
   * coordination MCP tools degrade truthfully (`available:false`).
   */
  readonly coordinationEngine?: CoordinationEnginePort;
}

/**
 * The result of ingesting a batch of `RunEvent`s through the ingest service —
 * the aggregate view over the per-event {@link import('./ports/run-event.port.js').RunEventIngestResult}s.
 */
export interface IngestResult {
  readonly operation: 'run-event.ingest';
  /** Total events submitted. */
  readonly received: number;
  /** Newly applied (state-of-record mutated). */
  readonly applied: number;
  /** Recognized idempotent replays (nothing mutated). */
  readonly duplicates: number;
  /** Rejected (illegal transition / unknown run / gate denied / validation). */
  readonly rejected: number;
  /** CloudEvents outbox records enqueued as a side effect. */
  readonly outboxEnqueued: number;
}

/** The result of one outbox drain pass (domain doc §1.3 at-least-once spine). */
export interface DrainStats {
  readonly operation: 'outbox.drain';
  /** Pending records claimed this pass. */
  readonly attempted: number;
  /** Successfully published + marked delivered. */
  readonly published: number;
  /** Failed to publish (left `pending` for retry — never lost). */
  readonly failed: number;
  /** Records still `pending` after the pass. */
  readonly remainingPending: number;
}

/** The composed public surface of this domain (mirrors the governance module shape). */
export interface AgentOsModuleSurface {
  readonly name: 'agent-os';
  /** The state-of-record repository seam. */
  repository(): AgentOsRepositoryPort;
  /** The RunEvent ingest + subscribe bus (conductor/runtimes emit here). */
  runEventBus(): import('./ports/run-event.port.js').RunEventBusPort;
  /** The `/api/agent-os/*` + `/internal/agent-os/*` router. */
  routes(): Router;
}
