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
import { createGovernanceGateAdapter } from './adapters/governance-gate.adapter.js';
import { createInstructionCompilerAdapter } from './adapters/instruction-compiler.adapter.js';
import { createNatsOutboxPublisher } from './adapters/nats-outbox-publisher.adapter.js';
import { RunEventIngestService } from './services/run-event-ingest.service.js';
import { OutboxDrainService } from './services/outbox-drain.service.js';
import { SquadService, InMemorySquadStore } from './services/squad.service.js';
import { SquadAutopilotService } from './services/squad-autopilot.service.js';
import { WorkflowService, InMemoryWorkflowDefinitionStore } from './services/workflow.service.js';
import type { SquadConductorPort } from './ports/squad-autopilot.port.js';
import { buildSquadBoardRouter } from './routes/squad-board.routes.js';
import { buildSquadReadRouter } from './routes/squad-read.routes.js';
import { buildWorkflowRouter } from './routes/workflow.routes.js';
import { buildAgentOsRouter } from './routes/agent-os.routes.js';
import { buildInternalAgentOsRouter } from './routes/internal-agent-os.routes.js';
import { buildAgentOsMcpTools } from './mcp/agent-os-engine.js';
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
    this.ingest = new RunEventIngestService({ repository: this.repo, gate, logger: this.log });

    this.drain = new OutboxDrainService({
      repository: this.repo,
      publisher: this.outboxPublisher,
      logger: this.log,
      intervalMs: cfg.outboxDrainIntervalMs,
      batchSize: cfg.outboxDrainBatchSize,
    });

    this.squads = cfg.squadsEnabled ? new SquadService({ store: new InMemorySquadStore() }) : null;

    // The autopilot loop (cron→beads→conductor) — opt-in on top of squads. The
    // beads seam is injected now; the conductor seam is usually attached late
    // (`attachSquadAutopilotConductor`) since bootstrap builds it after agent-os.
    // Absent seams ⇒ ticks report a truthful `degraded`, never a faked launch.
    this.autopilot =
      cfg.squadsEnabled && cfg.squadAutopilotEnabled
        ? new SquadAutopilotService({
            beads: deps.beadsEngine ?? null,
            conductor: deps.conductorDispatch ?? null,
            squads: this.squads,
            logger: this.log,
            intervalMs: cfg.squadAutopilotIntervalMs,
            maxDispatchesPerTick: cfg.squadAutopilotMaxPerTick,
          })
        : null;

    // Workflow-definition CRUD + dispatch. CRUD always works over the in-memory
    // store (a pg store is the follow-up behind the same seam); dispatch runs a
    // stored definition through the injected `WorkflowDriver` and degrades to a
    // truthful `not_configured` when no driver is wired.
    this.workflows = new WorkflowService({
      store: new InMemoryWorkflowDefinitionStore(),
      driver: deps.workflowDriver ?? null,
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

  routes(): Router {
    return this.router;
  }

  /** The `/internal/agent-os/*` router (INTERNAL_SERVICE_KEY-gated ingest edges). */
  internalRoutes(): Router {
    return this.internalRouter;
  }

  mcp(): readonly McpToolRegistration[] {
    return buildAgentOsMcpTools(this.repo);
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
