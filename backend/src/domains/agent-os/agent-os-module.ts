/**
 * `AgentOsComposer` — the composer that fuses the control plane into one module.
 * It:
 *  - slices the typed `AgentOsConfig` out of the injected `AppConfig` (no env
 *    reads, no top-level singletons),
 *  - selects the state-of-record repository driver (an injected repository wins;
 *    else in-memory degrade — the postgres/json adapters are wired at
 *    integration behind the same port),
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
import { createGovernanceGateAdapter } from './adapters/governance-gate.adapter.js';
import { createInstructionCompilerAdapter } from './adapters/instruction-compiler.adapter.js';
import { createNatsOutboxPublisher } from './adapters/nats-outbox-publisher.adapter.js';
import { RunEventIngestService } from './services/run-event-ingest.service.js';
import { OutboxDrainService } from './services/outbox-drain.service.js';
import { SquadService, InMemorySquadStore } from './services/squad.service.js';
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
  private readonly executorAvailable: boolean;
  private readonly outboxPublisher: OutboxPublisherPort & { close?(): Promise<void> };
  private readonly instructionCompiler: InstructionCompilerPort;
  private readonly ingest: RunEventIngestService;
  private readonly drain: OutboxDrainService;
  private readonly squads: SquadService | null;
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

    // Repository selection: an explicit injection wins (integration supplies the
    // pg/json adapter behind the port). Absent that, degrade to in-memory and
    // report the effective driver truthfully in health.
    if (deps.repository) {
      this.repo = deps.repository;
      this.effectiveDriver = cfg.repositoryDriver;
      this.executorAvailable = Boolean(deps.executor?.isAvailable());
    } else {
      this.repo = new InMemoryAgentOsRepository();
      this.effectiveDriver = 'memory';
      this.executorAvailable = false;
      if (cfg.repositoryDriver !== 'memory') {
        this.log.warn(
          { configuredDriver: cfg.repositoryDriver },
          'agent-os: no repository adapter injected — degrading to in-memory state-of-record',
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
      executorAvailable: this.executorAvailable,
      outboxPublisher: this.outboxPublisher,
      instructionCompiler: this.instructionCompiler,
    });
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    this.drain.start();
    this.log.info(
      {
        repositoryDriver: this.effectiveDriver,
        outbox: await this.outboxPublisher.health(),
        squads: this.cfg.squadsEnabled,
      },
      'agent-os module started',
    );
  }

  async stop(): Promise<void> {
    this.drain.stop();
    if (this.outboxPublisher.close) {
      await this.outboxPublisher.close().catch(() => undefined);
    }
  }
}
