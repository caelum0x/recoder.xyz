/**
 * `ConductorComposer` — the composer that fuses the terminal product into one
 * module (ARCHITECTURE §3). It:
 *  - slices the injected `AppConfig` into the typed {@link ConductorConfig},
 *  - builds the substrate registry (over injected concrete substrates) + truthful
 *    availability, the workspace repository (over the persistence executor), the
 *    degrade-safe run-tailer / substrate-scan, and the durable+live run-event sink,
 *  - constructs the `@recoder/substrate` `WorkspaceEngine` behind those ports,
 *  - routes EVERY write (create / steer / reconcile) through the injected
 *    governance gate (`decide` before, `recordAudit` after),
 *  - owns the `/terminal` + `/sync` terminal surface ({@link TerminalStreamPort}),
 *  - exposes the `/api/conductor` router, read-only MCP tools, and truthful health.
 *
 * No `process.env` reads (config injected); no top-level singletons; every
 * stateful path degrade-safe (no substrate ⇒ truthful launch failure; no DB ⇒
 * bounded in-process store; gate deny ⇒ the write is blocked, never faked).
 */
import { Router } from 'express';
import {
  WorkspaceEngine,
  reconcile as substrateReconcile,
  systemClock,
  uuidId,
  type CreateWorkspaceInput,
  type ReconcileReport,
  type WorkspaceEngineDeps,
} from '@recoder/substrate';
import type { Workspace } from '@recoder/agent-os';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { Principal } from '../identity/types.js';
import { sliceConductorConfig, type ConductorConfig } from './config.js';
import type { GateVerdict, TerminalStreamPort } from './ports/index.js';
import type { RunEventSinkPort } from './ports/run-event-sink.port.js';
import type { WorkspaceRepositoryPort } from './ports/workspace-repository.port.js';
import type {
  ReconcileFindingView,
  SteerInput,
  SubstrateAvailabilityView,
} from './types.js';
import type { ConductorModule, ConductorModuleDeps } from './index.js';
import { toLoggerPort } from './adapters/logger.adapter.js';
import { createConductorRegistry, type ConductorRegistry } from './adapters/substrate-registry.adapter.js';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { createRunEventSink } from './adapters/run-event-sink.adapter.js';
import { createRunTailer, type ConductorRunTailer } from './adapters/run-tailer.adapter.js';
import { createSubstrateScan } from './adapters/substrate-scan.adapter.js';
import { TerminalStreamService } from './terminal/terminal-stream.js';
import { buildConductorRoutes } from './routes/conductor.routes.js';
import { buildConductorMcpTools } from './mcp/conductor-engine.js';
import { buildConductorHealth } from './health.js';
import {
  conductorAuditEntry,
  guardConductorWrite,
  recordConductorAudit,
} from './audit/conductor-audit.js';

/** The create request the routes/callers build (createdBy is stamped from the principal). */
export type CreateConductorWorkspaceInput = Omit<CreateWorkspaceInput, 'createdBy'>;

/**
 * The outcome of a governed conductor write. `ok` reflects whether the action was
 * PERFORMED (gate allowed AND execution succeeded); `verdict` is always present;
 * `reason` carries the truthful blocker when `ok:false`.
 */
export interface ConductorWriteResult<T> {
  readonly ok: boolean;
  readonly verdict: GateVerdict;
  readonly value?: T;
  readonly reason?: string;
}

export class ConductorComposer implements ConductorModule {
  readonly name = 'conductor' as const;

  private readonly log: Logger;
  private readonly cfg: ConductorConfig;
  private readonly gate: ConductorModuleDeps['gate'];
  private readonly middleware: ConductorModuleDeps['middleware'];
  private readonly registry: ConductorRegistry;
  private readonly repository: WorkspaceRepositoryPort;
  private readonly tailer: ConductorRunTailer;
  private readonly terminalService: TerminalStreamService;
  private readonly engine: WorkspaceEngine;
  private readonly engineDeps: WorkspaceEngineDeps;
  private started = false;

  constructor(deps: ConductorModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceConductorConfig(deps.config, deps.overrides ?? {});
    this.gate = deps.gate;
    this.middleware = deps.middleware;

    const loggerPort = toLoggerPort(this.log);

    // Substrate registry + truthful availability (empty ⇒ launches fail truthfully).
    this.registry = createConductorRegistry({
      config: this.cfg,
      ...(deps.substrates ? { substrates: deps.substrates } : {}),
    });

    // Workspace repository over the persistence executor (degrade-safe in-process).
    this.repository =
      deps.repository ?? createWorkspaceRepository({ executor: deps.executor });

    // Terminal surface owns the sync hub; steering is gated through this composer.
    this.terminalService = new TerminalStreamService({
      logger: this.log,
      steer: async (input, ctx) => {
        const result = await this.steerWorkspace(input, ctx.principal);
        if (!result.ok) throw new Error(result.reason ?? 'steer denied');
      },
    });

    // Durable + live run-event sink; the tailer emits through it. When an external
    // state-of-record sink is injected (the agent-os RunEvent bus, adapted at the
    // composition root), fan out to it FIRST so the control plane sees every event,
    // then to the conductor-local durable+live sink. A failing external ingest is
    // isolated (logged, swallowed) so the live terminal stream never stalls.
    const localSink = createRunEventSink({
      repository: this.repository,
      publish: (event) => this.terminalService.publishSync(event),
      logger: this.log,
    });
    const sink = composeRunEventSink(localSink, deps.runEventSink, this.log);
    this.tailer = createRunTailer({ sink, logger: this.log });

    // The engine deps assembled behind the ports.
    this.engineDeps = {
      registry: this.registry.registry,
      repository: this.repository,
      runTailer: this.tailer,
      scan: createSubstrateScan(),
      logger: loggerPort,
      clock: systemClock,
      id: uuidId,
      ...(deps.brain ? { brain: deps.brain } : {}),
      ...(deps.lock ? { lock: deps.lock } : {}),
      ...(deps.admission ? { admission: deps.admission } : {}),
    };
    this.engine = new WorkspaceEngine(this.engineDeps);
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return this.engine.listWorkspaces();
  }

  async getWorkspace(workspaceId: string): Promise<Workspace | null> {
    return this.engine.getWorkspace(workspaceId);
  }

  async createWorkspace(
    input: CreateConductorWorkspaceInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<Workspace>> {
    const action = 'workspace.create';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { path: input.repoPath },
      ...(input.taskId ? { taskId: input.taskId } : {}),
      metadata: { projectId: input.projectId, runtimeId: input.runtimeId, substrate: input.substrate },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };

    try {
      const workspace = await this.engine.createWorkspace({
        ...input,
        createdBy: principal.userId,
      });
      await recordConductorAudit(
        this.gate,
        conductorAuditEntry(action, principal, verdict, { workspaceId: workspace.workspaceId }),
      );
      return { ok: true, verdict, value: workspace };
    } catch (err) {
      const reason = err instanceof Error ? err.message : 'workspace launch failed';
      this.log.error({ err, projectId: input.projectId }, 'conductor createWorkspace failed');
      return { ok: false, verdict, reason };
    }
  }

  async steerWorkspace(
    input: SteerInput,
    principal: Principal,
  ): Promise<ConductorWriteResult<void>> {
    const action = 'workspace.steer';
    const workspace = await this.engine.getWorkspace(input.workspaceId);
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { path: input.workspaceId },
      ...(workspace?.taskId ? { taskId: workspace.taskId } : {}),
      metadata: { workspaceId: input.workspaceId },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    if (!workspace) return { ok: false, verdict, reason: 'workspace not found' };
    if (workspace.state !== 'running') {
      return { ok: false, verdict, reason: `workspace is ${workspace.state}, not running` };
    }
    // The live send-keys transport is provided by the interactive substrate wired
    // at the composition root; absent it, steering is refused truthfully (never faked).
    await recordConductorAudit(
      this.gate,
      conductorAuditEntry(action, principal, verdict, { workspaceId: input.workspaceId }),
    );
    return {
      ok: false,
      verdict,
      reason: 'steering requires a live interactive substrate (none wired in this composition)',
    };
  }

  async reconcile(principal: Principal): Promise<ConductorWriteResult<ReconcileReport>> {
    const action = 'workspace.reconcile';
    const { allowed, verdict } = await guardConductorWrite(this.gate, action, principal, {
      target: { environment: 'conductor' },
      metadata: { op: 'reconcile' },
    });
    if (!allowed) return { ok: false, verdict, reason: verdict.reason };
    const report = await substrateReconcile(this.engineDeps);
    await recordConductorAudit(
      this.gate,
      conductorAuditEntry(action, principal, verdict, {
        live: report.live.length,
        orphanedWorkspaces: report.orphanedWorkspaces.length,
      }),
    );
    return { ok: true, verdict, value: report };
  }

  substrates(): readonly SubstrateAvailabilityView[] {
    return this.registry.availability();
  }

  async listReconcileFindings(workspaceId?: string): Promise<readonly ReconcileFindingView[]> {
    return this.repository.listReconcileFindings(workspaceId);
  }

  terminal(): TerminalStreamPort {
    return this.terminalService;
  }

  routes(): Router {
    return buildConductorRoutes({ module: this, middleware: this.middleware });
  }

  mcp(): readonly McpToolRegistration[] {
    return buildConductorMcpTools(this);
  }

  async health(): Promise<ComponentHealth> {
    return buildConductorHealth({
      config: this.cfg,
      substrates: this.registry.availability(),
      repositoryAvailable: true,
      liveConnections: this.terminalService.liveConnections(),
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.log.info(
      {
        substrates: this.registry.availability().filter((s) => s.available).map((s) => s.id),
        tmuxControlMode: this.cfg.tmuxControlMode,
      },
      'conductor module started',
    );
  }

  async stop(): Promise<void> {
    // Idempotent, degrade-safe: live sessions are substrate-owned and survive.
  }
}

/**
 * Fan a `RunEvent` out to the injected external state-of-record sink (agent-os)
 * AND the conductor-local durable+live sink. The external ingest runs first but is
 * isolated: a rejection is logged and swallowed so the local durable append + live
 * `/sync` publish always run (a state-plane hiccup never stalls the terminal). When
 * no external sink is injected, the local sink is returned unchanged.
 */
function composeRunEventSink(
  local: RunEventSinkPort,
  external: RunEventSinkPort | undefined,
  logger: Logger,
): RunEventSinkPort {
  if (!external) return local;
  return {
    async append(event): Promise<void> {
      try {
        await external.append(event);
      } catch (err) {
        logger.error({ err, eventId: event.eventId }, 'conductor run-event state-of-record ingest failed');
      }
      await local.append(event);
    },
  };
}
