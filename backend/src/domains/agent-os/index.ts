/**
 * Agent-OS domain — public factory + the ONE public interface (ARCHITECTURE §3).
 *
 * `createAgentOsModule(deps)` (ASYNC — it may connect the NATS outbox transport)
 * builds the composer that hosts the state-of-record repository, THE RunEvent
 * ingest bus (conductor/runtimes emit here), the at-least-once CloudEvents outbox
 * spine, the governance-gated write path, the instruction compiler, and squads.
 *
 * The public surface (`repository()`, `runEventBus()`, `routes()`) is what the
 * conductor (Phase 5b), the edge (`/sync` fan-out), and interop compile against.
 * Degrade-safe throughout: no DB → the repository degrades to json/memory and
 * health reports it truthfully; no NATS → the outbox publisher is a log-only sink
 * and records stay `pending`; a denied gate refuses the write, never a faked 200.
 *
 * REPLACES the legacy mutable `agentOsContainer` singleton + `process.env`-reading
 * `service-container.ts` (domain doc §7): this is a pure factory over injected
 * deps with no top-level state and no env reads.
 */
import type { Router } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { AgentOsRepositoryPort } from './ports/agent-os-repository.port.js';
import type { RunEventBusPort } from './ports/run-event.port.js';
import type { CoordinationAdmissionPort } from './ports/coordination-admission.port.js';
import type { SquadConductorPort } from './ports/squad-autopilot.port.js';
import type { SquadAutopilotService } from './services/squad-autopilot.service.js';
import type { AgentOsDeps } from './types.js';

export type { AgentOsDeps } from './types.js';
export type { SquadConductorPort, SquadDispatchRequest, SquadDispatchResult } from './ports/squad-autopilot.port.js';
export type {
  CoordinationAdmissionPort,
  CoordinationAdmissionInput,
  CoordinationAdmissionOptions,
  CoordinationAdmissionDecision,
} from './ports/coordination-admission.port.js';

/** The public surface every consumer of the control plane compiles against. */
export interface AgentOsModule {
  readonly name: 'agent-os';
  /** The state-of-record repository seam (list/upsert per aggregate + snapshot). */
  repository(): AgentOsRepositoryPort;
  /** THE RunEvent ingest + subscribe bus (conductor/runtimes/engines emit here). */
  runEventBus(): RunEventBusPort;
  /**
   * The DOUBLE-ASSIGNMENT admission gate over the Multica coordination fabric —
   * the conductor injects this into `createWorkspace` (alongside its work-lock)
   * to skip/defer a launch for an issue already actively held by 2+ agents.
   */
  coordinationAdmission(): CoordinationAdmissionPort;
  /** The `/api/agent-os/*` router (read models + `/internal/*` ingest back-compat). */
  routes(): Router;
  /**
   * The `/internal/agent-os/*` router — INTERNAL_SERVICE_KEY-gated worker
   * ingest edges (events / run steps / runtime-evidence / outbox drain). Mount
   * at `/internal/agent-os` (api rule alignment; identity mounts the same way).
   */
  internalRoutes(): Router;
  /** Read-only MCP introspection tools (summary / tasks / runs). */
  mcp(): readonly McpToolRegistration[];
  /** The squad autopilot loop (null when squads/autopilot are disabled). */
  squadAutopilot(): SquadAutopilotService | null;
  /**
   * Late-bind the conductor dispatch seam onto the autopilot (bootstrap builds
   * the conductor AFTER agent-os). No-op (logged) when the autopilot is off.
   */
  attachSquadAutopilotConductor(port: SquadConductorPort): void;
  /** Truthful component health (repository / outbox / instruction compiler). */
  health(): Promise<ComponentHealth>;
  /** Boot hook — starts the outbox drain loop (idempotent). */
  start(): Promise<void>;
  /** Shutdown hook — stops the drain + closes the transport (idempotent). */
  stop(): Promise<void>;
}

// Value import last so the type-only imports above form no runtime cycle.
import { AgentOsComposer } from './agent-os-module.js';

/**
 * Build the agent-os module. ASYNC because the outbox publisher may connect to
 * NATS at assembly. Never throws for a missing transport/DB — every seam
 * degrades truthfully.
 */
export async function createAgentOsModule(deps: AgentOsDeps): Promise<AgentOsModule> {
  return AgentOsComposer.create(deps);
}
