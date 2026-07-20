/**
 * `AgentOsComposer` — the composer that fuses the control plane into one module.
 * It:
 *  - slices the typed `AgentOsConfig` out of the injected `AppConfig` (no env
 *    reads, no top-level singletons),
 *  - selects the state-of-record repository driver (an injected repository wins;
 *    else the durable `PostgresAgentOsRepository` over the injected persistence
 *    executor; else in-memory degrade — all behind the same frozen port),
 *  - builds the governance-gated write adapter, the instruction compiler, and
 *    the NATS/log-only outbox publisher,
 *  - composes the RunEvent ingest bus + the at-least-once outbox drain,
 *  - composes squads (leader-routing) when enabled,
 *  - exposes `repository()` + `runEventBus()` (the conductor + edge seams),
 *    the `/api/agent-os` router, read-only MCP tools, and truthful health.
 *
 * Degrade-safe throughout; every stateful path fails safe rather than faking.
 */
import { Router } from 'express';
import type { Logger } from '../../shared/logger.js';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { AgentOsDeps } from './types.js';
import type { AgentOsModule } from './index.js';
import type { AgentOsConfig, AgentOsRepositoryDriver } from './config.js';
import { sliceAgentOsConfig } from './config.js';
import type { AgentOsRepositoryPort } from './ports/agent-os-repository.port.js';
import type { RunEventBusPort } from './ports/run-event.port.js';
import type { OutboxPublisherPort } from './ports/outbox-publisher.port.js';
import type { InstructionCompilerPort } from './ports/instruction-compiler.port.js';
import { InMemoryAgentOsRepository } from './adapters/in-memory-agent-os.repository.js';
import { PostgresAgentOsRepository } from './adapters/postgres-agent-os.repository.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import { createGovernanceGateAdapter, type AgentOsGovernanceGate } from './adapters/governance-gate.adapter.js';
import { MulticaCoordinationAdapter } from './adapters/multica-coordination.adapter.js';
import type { CoordinationEnginePort } from './ports/coordination-engine.port.js';
import type { CoordinationAdmissionPort } from './ports/coordination-admission.port.js';
import { CoordinationAdmissionService } from './services/coordination-admission.service.js';
import { createInstructionCompilerAdapter } from './adapters/instruction-compiler.adapter.js';
import { createNatsOutboxPublisher } from './adapters/nats-outbox-publisher.adapter.js';
import { RunEventIngestService } from './services/run-event-ingest.service.js';
import { OutboxDrainService } from './services/outbox-drain.service.js';
import { SquadService, InMemorySquadStore } from './services/squad.service.js';
import { SquadAutopilotService } from './services/squad-autopilot.service.js';
import {
  WorkflowService,
  InMemoryWorkflowDefinitionStore,
  type WorkflowDefinitionStore,
} from './services/workflow.service.js';
import { PostgresWorkflowDefinitionStore } from './adapters/postgres-workflow-definition.store.js';
import { AgentOsWorkflowRunnerDriver } from './adapters/agent-os-workflow-runner.driver.js';
import { createBrowserCheckWorkflowHandler } from './adapters/browser-check-workflow.handler.js';
import type { SquadConductorPort } from './ports/squad-autopilot.port.js';
import type { SquadIssuePort } from './ports/squad-issue.port.js';
import { buildSquadBoardRouter } from './routes/squad-board.routes.js';
import { buildSquadReadRouter } from './routes/squad-read.routes.js';
import { buildWorkflowRouter } from './routes/workflow.routes.js';
import { buildAgentOsRouter } from './routes/agent-os.routes.js';
import { buildInternalAgentOsRouter } from './routes/internal-agent-os.routes.js';
import { buildAgentOsMcpTools } from './mcp/agent-os-engine.js';
import { buildCoordinationMcpTools } from './mcp/coordination-engine.js';
import { buildAgentOsHealth } from './health.js';

export class AgentOsComposer implements AgentOsModule {
  readonly name = 'agent-os' as const;

  private readonly log: Logger;
  private readonly cfg: AgentOsConfig;
  private readonly repo: AgentOsRepositoryPort;
  private readonly effectiveDriver: AgentOsRepositoryDriver;
  private readonly executor: QueryExecutor | null;
  private readonly outboxPublisher: OutboxPublisherPort & { close?(): Promise<void> };
  private readonly instructionCompiler: InstructionCompilerPort;
  private readonly governanceGate: AgentOsGovernanceGate;
  private readonly coordination: CoordinationEnginePort;
  private readonly coordinationAdmissionGate: CoordinationAdmissionPort;
  private readonly ingest: RunEventIngestService;
  private readonly drain: OutboxDrainService;
  private readonly squads: SquadService | null;
  private readonly autopilot: SquadAutopilotService | null;
  private readonly workflows: WorkflowService;
  private readonly router: Router;
  private readonly internalRouter: Router;
  private started = false;

  private constructor(
    deps: AgentOsDeps,
    cfg: AgentOsConfig,
    outboxPublisher: OutboxPublisherPort & { close?(): Promise<void> },
  ) {
    this.log = deps.logger;
    this.cfg = cfg;
    this.outboxPublisher = outboxPublisher;

    // Repository selection: an explicit injection wins; else the DURABLE pg
    // adapter binds to the injected persistence executor when the configured
    // driver is `postgres`; else degrade to in-memory and report the effective
    // driver truthfully in health. A temporarily-down executor still binds pg
    // (queries fail truthfully and recover with the pool; health shows degraded).
    this.executor = deps.executor ?? null;
    if (deps.repository) {
      this.repo = deps.repository;
      this.effectiveDriver = cfg.repositoryDriver;
    } else if (cfg.repositoryDriver === 'postgres' && this.executor) {
      this.repo = new PostgresAgentOsRepository(this.executor);
      this.effectiveDriver = 'postgres';
    } else {
      this.repo = new InMemoryAgentOsRepository();
      this.effectiveDriver = 'memory';
      if (cfg.repositoryDriver !== 'memory') {
        this.log.warn(
          { configuredDriver: cfg.repositoryDriver },
          'agent-os: no repository adapter or executor injected — degrading to in-memory state-of-record',
        );
      }
    }

    this.instructionCompiler = deps.instructionCompiler ?? createInstructionCompilerAdapter(this.log);

    const gate = createGovernanceGateAdapter(deps.gate);
    this.governanceGate = gate;
    this.ingest = new RunEventIngestService({ repository: this.repo, gate, logger: this.log });

    // Multica coordination introspection seam (squad routing / work-locks /
    // conflict detection). An injected seam wins (tests / explicit composition);
    // else the default adapter over `MULTICA_URL` (external mode). When neither
    // MULTICA_URL nor a live engine is present the reads degrade truthfully —
    // Multica (the Go squads server needs PG15) is an OPTIONAL enrichment over
    // the local `squad.service.ts`, never the source of truth.
    this.coordination =
      deps.coordinationEngine ??
      new MulticaCoordinationAdapter({
        baseUrlResolver: () => process.env['MULTICA_URL']?.trim() || null,
        ...(process.env['MULTICA_API_KEY'] ? { apiKey: process.env['MULTICA_API_KEY'] } : {}),
        ...(process.env['MULTICA_WORKSPACE_ID'] ? { workspaceId: process.env['MULTICA_WORKSPACE_ID'] } : {}),
        logger: this.log,
      });

    // The DOUBLE-ASSIGNMENT admission gate over the same coordination fabric —
    // the conductor consults it before a launch (alongside its work-lock) to
    // skip/defer an issue already actively held by 2+ agents. Degrade-open.
    this.coordinationAdmissionGate = new CoordinationAdmissionService({
      engine: this.coordination,
      logger: this.log,
    });

    this.drain = new OutboxDrainService({
      repository: this.repo,
      publisher: this.outboxPublisher,
      logger: this.log,
      intervalMs: cfg.outboxDrainIntervalMs,
      batchSize: cfg.outboxDrainBatchSize,
    });

    this.squads = cfg.squadsEnabled ? new SquadService({ store: new InMemorySquadStore() }) : null;

    // The autopilot loop (cron→beads→conductor) — opt-in on top of squads. BOTH
    // load-bearing seams are usually attached late, since bootstrap builds their
    // owners after agent-os: the issue-graph read seam via `attachIssueGraph`
    // (memory owns the beads module facet) and the conductor dispatch seam via
    // `attachSquadAutopilotConductor`. Absent seams ⇒ ticks report a truthful
    // `degraded`, never a faked launch.
    this.autopilot =
      cfg.squadsEnabled && cfg.squadAutopilotEnabled
        ? new SquadAutopilotService({
            conductor: deps.conductorDispatch ?? null,
            squads: this.squads,
            // The configured squad every dispatch routes through (leader-first /
            // weighted). Absent ⇒ the autopilot falls back to the flat default
            // dispatch (degrade-truthful pass-through in `routeThroughSquad`).
            ...(cfg.squadId ? { squadId: cfg.squadId } : {}),
            logger: this.log,
            intervalMs: cfg.squadAutopilotIntervalMs,
            maxDispatchesPerTick: cfg.squadAutopilotMaxPerTick,
          })
        : null;

    // Workflow-definition CRUD + dispatch. Definitions persist through the
    // DURABLE pg store when the effective repository driver is postgres (they
    // survive restart); else the in-memory store (no-DB degrade / tests), behind
    // the same seam. Dispatch runs a stored definition through a `WorkflowDriver`:
    // an injected driver wins (tests / explicit composition); else the default
    // `AgentOsWorkflowRunnerDriver` — which SKINS the frozen
    // `@recoder/agent-workflows` runner, so dispatch executes truthfully (nodes
    // without a handler surface a `failed`/`waiting` run) instead of the legacy
    // permanent `not_configured`. Bootstrap may inject a richer driver (real node
    // handler ports) behind this same seam.
    const workflowStore: WorkflowDefinitionStore =
      this.effectiveDriver === 'postgres' && this.executor
        ? new PostgresWorkflowDefinitionStore(this.executor)
        : new InMemoryWorkflowDefinitionStore();
    // The default driver wires the LIVE `browser-check` node handler over the
    // injected browser-use engine (navigate → assert → screenshot → summary
    // artifact + optional autonomous `run_task`). Absent engine ⇒ the handler
    // degrades to a truthful `skipped` per node — browsing never fakes a verdict
    // and never blocks the run. An explicitly injected `workflowDriver` wins
    // (tests / richer bootstrap composition) behind the same seam.
    const defaultDriver = new AgentOsWorkflowRunnerDriver({
      ports: {
        runBrowserCheck: createBrowserCheckWorkflowHandler({ client: deps.browserEngine ?? null }),
      },
    });
    this.workflows = new WorkflowService({
      store: workflowStore,
      driver: deps.workflowDriver ?? defaultDriver,
    });

    const inner = buildAgentOsRouter({
      repository: this.repo,
      middleware: deps.middleware,
    });
    // The INTERNAL_SERVICE_KEY-gated ingest edges (events / steps / runtime-
    // evidence / outbox drain). Exposed via `internalRoutes()` for the canonical
    // `/internal/agent-os` mount AND kept reachable under the module's own
    // `<mountBase>/internal/*` (back-compat with the existing `/internal/events`).
    this.internalRouter = buildInternalAgentOsRouter({
      repository: this.repo,
      runEventBus: this.ingest,
      drain: this.drain,
      middleware: deps.middleware,
    });
    this.router = Router();
    // Board first: its literal `/squads/board` path must win over the `/squads/
    // :squadId` param route in the read router mounted next.
    this.router.use(
      buildSquadBoardRouter({ squads: this.squads, autopilot: this.autopilot, middleware: deps.middleware }),
    );
    // Squads read-only introspection (list / detail / members / activity). Owner
    // decision: squads are never mutated over HTTP/MCP — reads only.
    this.router.use(buildSquadReadRouter({ squads: this.squads, middleware: deps.middleware }));
    // Workflow-definition CRUD + dispatch edge.
    this.router.use(buildWorkflowRouter({ workflows: this.workflows, middleware: deps.middleware }));
    this.router.use(inner);
    this.router.use('/internal', this.internalRouter);
  }

  /** Async factory — connects the outbox transport before constructing. */
  static async create(deps: AgentOsDeps): Promise<AgentOsComposer> {
    const cfg = sliceAgentOsConfig(deps.config, deps.overrides ?? {});
    const outboxPublisher =
      deps.outboxPublisher ??
      (await createNatsOutboxPublisher({ natsUrl: cfg.natsUrl, logger: deps.logger }));
    return new AgentOsComposer(deps, cfg, outboxPublisher);
  }

  repository(): AgentOsRepositoryPort {
    return this.repo;
  }

  runEventBus(): RunEventBusPort {
    return this.ingest;
  }

  /**
   * The DOUBLE-ASSIGNMENT admission gate over the Multica coordination fabric.
   * The conductor injects this into its `createWorkspace` flow (alongside the
   * path-level work-lock) to skip/defer a launch for an issue already actively
   * held by 2+ agents. Degrade-open: absent engine ⇒ never blocks a run.
   */
  coordinationAdmission(): CoordinationAdmissionPort {
    return this.coordinationAdmissionGate;
  }

  /** Leader-routing squads (null when the feature flag is off). */
  squadService(): SquadService | null {
    return this.squads;
  }

  /** The squad autopilot loop (null when squads/autopilot are disabled). */
  squadAutopilot(): SquadAutopilotService | null {
    return this.autopilot;
  }

  /** Workflow-definition CRUD + dispatch service (always present; dispatch degrades). */
  workflowService(): WorkflowService {
    return this.workflows;
  }

  /** Late-bind the conductor dispatch seam (bootstrap builds it after agent-os). */
  attachSquadAutopilotConductor(port: SquadConductorPort): void {
    if (!this.autopilot) {
      this.log.debug('agent-os: squad autopilot disabled — conductor seam not attached');
      return;
    }
    this.autopilot.attachConductor(port);
  }

  /**
   * Late-bind the issue-graph read seam onto the autopilot (bootstrap builds
   * the MEMORY module — which owns the beads issue-graph facet — after
   * agent-os; mirrors `attachSquadAutopilotConductor`).
   */
  attachIssueGraph(port: SquadIssuePort): void {
    if (!this.autopilot) {
      this.log.debug('agent-os: squad autopilot disabled — issue-graph seam not attached');
      return;
    }
    this.autopilot.attachIssueGraph(port);
  }

  routes(): Router {
    return this.router;
  }

  /** The `/internal/agent-os/*` router (INTERNAL_SERVICE_KEY-gated ingest edges). */
  internalRoutes(): Router {
    return this.internalRouter;
  }

  mcp(): readonly McpToolRegistration[] {
    return [
      ...buildAgentOsMcpTools(this.repo),
      ...buildCoordinationMcpTools({
        engine: this.coordination,
        gate: this.governanceGate,
        logger: this.log,
      }),
    ];
  }

  async health(): Promise<ComponentHealth> {
    return buildAgentOsHealth({
      repositoryDriver: this.effectiveDriver,
      executorAvailable: this.executor?.isAvailable() ?? false,
      outboxPublisher: this.outboxPublisher,
      instructionCompiler: this.instructionCompiler,
      squadAutopilot: this.autopilot ? this.autopilot.seams() : null,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.drain.start();
    this.autopilot?.start();
    this.log.info(
      {
        repositoryDriver: this.effectiveDriver,
        outbox: await this.outboxPublisher.health(),
        squads: this.cfg.squadsEnabled,
        squadAutopilot: this.autopilot !== null,
      },
      'agent-os module started',
    );
  }

  async stop(): Promise<void> {
    this.autopilot?.stop();
    this.drain.stop();
    if (this.outboxPublisher.close) {
      await this.outboxPublisher.close().catch(() => undefined);
    }
  }
}
