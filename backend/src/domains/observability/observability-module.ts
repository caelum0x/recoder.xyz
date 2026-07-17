/**
 * `ObservabilityComposer` — the Phase-11 composer that fuses the four engines
 * (logging / metrics / tracing / signals) + the audit-XDR projection behind the
 * single {@link ObservabilityModule} interface. It is the LAST domain: it consumes
 * the frozen seams of every prior phase and re-implements none of them.
 *
 * It wires:
 *   1. the config slice                      (from AppConfig; no process.env),
 *   2. the correlated pino logger + ring     (over @recoder/logger),
 *   3. the in-process metrics registry        (MetricsPort — the seam all domains inject),
 *   4. the degrade-safe OTel tracer           (TracerPort),
 *   5. the health aggregator                  (over the bootstrap HealthRegistry — conflict #7),
 *   6. the ops-recorder loopback client + work-signals service,
 *   7. the alerting service,
 *   8. the audit-XDR projection               (over governance verifyAudit),
 *   9. the routes + MCP tools + telemetry middleware.
 *
 * It exposes `metrics`/`tracer`/`telemetry` for DI (other domains + the edge chain
 * inject them), and a truthful `health()` that reflects each engine's real state.
 */
import type { Router, RequestHandler } from 'express';
import type { ComponentHealth } from '../../shared/health-types.js';
import type { McpToolRegistration } from '../../shared/module-base.js';
import type { AppConfig } from '../../shared/app-config.js';
import type { Logger } from '../../shared/logger.js';
import type { QueryExecutor } from '../persistence/ports/query-executor.port.js';
import type { AuthMiddleware } from '../identity/middleware/authenticate.middleware.js';
import type { GovernanceGate } from '../governance/ports/gate.port.js';

import { sliceObservabilityConfig, type ObservabilityConfig, type ObservabilityConfigOverrides } from './config.js';
import { observabilityHealth } from './health.js';
import type { EngineHealth } from './types.js';
import type { MetricsPort } from './ports/metrics.port.js';
import type { TracerPort } from './ports/tracer.port.js';
import type { HealthSourceRegistry } from './ports/health-source.port.js';
import type { RunEventEmitter, SignalBoard } from './services/work-signals.service.js';
import type { AlertNotifier } from './services/alerting.service.js';

import { LogRingBuffer, createCorrelatedLogger, type CorrelatedLogger } from './adapters/pino-logger.adapter.js';
import { PrometheusMetrics } from './adapters/prometheus-registry.adapter.js';
import { OtelTracer } from './adapters/otel-tracer.adapter.js';
import { OpsRecorderClient } from './adapters/ops-recorder.adapter.js';
import { AuditXdrProjection } from './adapters/audit-xdr.adapter.js';
import {
  createAlertRepository,
  createSignalDispositionRepository,
  createSloRepository,
  PgAuditReader,
} from './repositories/observability.repository.js';
import { HealthAggregator } from './services/health-aggregator.service.js';
import { AlertingService } from './services/alerting.service.js';
import { WorkSignalsService } from './services/work-signals.service.js';
import { telemetryMiddleware } from './middleware/telemetry.middleware.js';
import { buildControlRoutes, buildHealthRoutes, buildMetricsRoutes } from './routes/observability.routes.js';
import { buildObservabilityMcpTools } from './mcp/observability-engine.js';

/** Dependencies bootstrap injects (after every prior phase is built). */
export interface ObservabilityModuleDeps {
  readonly config: AppConfig;
  readonly logger: Logger;
  /** The persistence executor the durable repos + audit reader bind to. */
  readonly executor: QueryExecutor;
  /** The composed identity auth middleware the control edges guard with. */
  readonly middleware: AuthMiddleware;
  /** The governance gate — backs XDR verify + gates alert-ack/disposition writes. */
  readonly gate: GovernanceGate;
  /**
   * The registry of ALL domain HealthSources (the bootstrap HealthRegistry). The
   * aggregator fuses these into `/health/full` — this is the conflict-#7 seam.
   */
  readonly registry: HealthSourceRegistry;
  /** Optional RunEvent bus — normalized work-signals ingest here. */
  readonly runEvents?: RunEventEmitter;
  /** Optional board (herd) — needs-you signals surface here. */
  readonly board?: SignalBoard;
  /** Optional alert delivery seam (notify engine / herd board). */
  readonly notifier?: AlertNotifier;
  /**
   * Optional LIVE ops-recorder URL source (the engines module's supervised
   * daemon endpoint — null until its first health passes). Consulted lazily
   * when no static `opsRecorderUrl` override is configured.
   */
  readonly opsRecorderUrlProvider?: () => string | null;
  /** Not-yet-in-AppConfig observability values (OTLP, ops-recorder URL, tokens). */
  readonly overrides?: ObservabilityConfigOverrides;
}

/** The public surface bootstrap + every other domain consumes. */
export interface ObservabilityModule {
  readonly name: 'observability';
  /** THE metrics seam every domain injects (RED/USE without prom-client coupling). */
  metrics(): MetricsPort;
  /** THE tracing seam every edge/composer opens spans through. */
  tracer(): TracerPort;
  /** The express telemetry middleware (correlation + trace + RED + access log). */
  telemetry(): RequestHandler;
  /** The health aggregator (conflict #7 owner). */
  aggregator(): HealthAggregator;
  /** A correlated child logger bound to a domain (redaction + ring + correlation). */
  createLogger(domain: string): CorrelatedLogger;
  /** The `/api/agent-os/observability/*` control edges. */
  routes(): Router;
  /** The root `/health` + `/health/full` + `/api/agent-os/health` edges. */
  healthRoutes(): Router;
  /** The root `/metrics` scrape edge (INTERNAL_SERVICE_KEY-gated). */
  metricsRoutes(): Router;
  /** Read-only MCP introspection tools (health/metrics/audit/signals). */
  mcp(): readonly McpToolRegistration[];
  /** This module's OWN truthful engine health (folded into the aggregate). */
  health(): Promise<ComponentHealth>;
  /** Boot hook (starts the alert-eval loop when enabled). Idempotent. */
  start(): Promise<void>;
  /** Shutdown hook (stops loops, drops the tracer exporter). Idempotent. */
  stop(): Promise<void>;
}

export class ObservabilityComposer implements ObservabilityModule {
  readonly name = 'observability' as const;

  private readonly cfg: ObservabilityConfig;
  private readonly ring: LogRingBuffer;
  private readonly promMetrics: PrometheusMetrics;
  private readonly otelTracer: OtelTracer;
  private readonly opsClient: OpsRecorderClient;
  private readonly auditXdr: AuditXdrProjection;
  private readonly healthAggregator: HealthAggregator;
  private readonly alerting: AlertingService;
  private readonly workSignals: WorkSignalsService;
  private readonly sloRepo: ReturnType<typeof createSloRepository>;
  private readonly log: Logger;
  private alertTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: ObservabilityModuleDeps) {
    this.log = deps.logger;
    this.cfg = sliceObservabilityConfig(deps.config, deps.overrides ?? {});

    // 2. Correlated logging + ring buffer.
    this.ring = new LogRingBuffer(this.cfg.logRingSize);

    // 3. In-process metrics registry (always up).
    this.promMetrics = new PrometheusMetrics();

    // 4. Degrade-safe tracer (no-op export when no OTLP endpoint).
    this.otelTracer = new OtelTracer({
      logger: deps.logger,
      otlpEndpoint: this.cfg.otlpEndpoint,
      sampleRatio: this.cfg.sampleRatio,
    });

    // 5. Repositories over the persistence executor.
    this.sloRepo = createSloRepository(deps.executor);
    const alertRepo = createAlertRepository(deps.executor);
    const dispositionRepo = createSignalDispositionRepository(deps.executor);
    const auditReader = new PgAuditReader(deps.executor);

    // 5b. Health aggregator over the bootstrap registry (conflict #7).
    this.healthAggregator = new HealthAggregator({
      registry: deps.registry,
      slo: this.sloRepo,
      metrics: this.promMetrics,
      service: deps.config.runtime.serviceName,
      instanceId: deps.config.runtime.instanceId,
      defaultSpaceId: this.cfg.defaultSpaceId,
    });

    // 6. Ops-recorder loopback client + work-signals service. The static URL
    //    wins; otherwise the supervised daemon's LIVE endpoint is read lazily.
    this.opsClient = new OpsRecorderClient({
      logger: deps.logger,
      baseUrl: this.cfg.opsRecorderUrl,
      ...(deps.opsRecorderUrlProvider ? { urlProvider: deps.opsRecorderUrlProvider } : {}),
      token: this.cfg.opsRecorderToken,
      authDisabled: this.cfg.opsRecorderAuthDisabled,
    });
    this.workSignals = new WorkSignalsService({
      logger: deps.logger,
      port: this.opsClient,
      gate: deps.gate,
      repository: dispositionRepo,
      ...(deps.runEvents ? { runEvents: deps.runEvents } : {}),
      ...(deps.board ? { board: deps.board } : {}),
      defaultSpaceId: this.cfg.defaultSpaceId,
    });

    // 7. Alerting service.
    this.alerting = new AlertingService({
      logger: deps.logger,
      repository: alertRepo,
      gate: deps.gate,
      ...(deps.notifier ? { notifier: deps.notifier } : {}),
    });

    // 8. Audit-XDR projection over governance verifyAudit + the read seam.
    this.auditXdr = new AuditXdrProjection({ gate: deps.gate, reader: auditReader });

    // Keep the middleware bound to these deps once.
    this.middleware = deps.middleware;

    this.log.info(
      {
        tracingExport: this.otelTracer.exporting,
        opsRecorder: this.cfg.opsRecorderUrl
          ? 'configured'
          : deps.opsRecorderUrlProvider
            ? 'supervised (live endpoint)'
            : 'absent',
        alerting: this.cfg.alertingEnabled,
      },
      'observability composed',
    );
  }

  private readonly middleware: AuthMiddleware;

  metrics(): MetricsPort {
    return this.promMetrics;
  }

  tracer(): TracerPort {
    return this.otelTracer;
  }

  telemetry(): RequestHandler {
    return telemetryMiddleware({
      metrics: this.promMetrics,
      tracer: this.otelTracer,
      logger: this.createLogger('edge'),
    });
  }

  aggregator(): HealthAggregator {
    return this.healthAggregator;
  }

  createLogger(domain: string): CorrelatedLogger {
    return createCorrelatedLogger({
      domain,
      redactKeys: this.cfg.redactKeys,
      ring: this.ring,
    });
  }

  routes(): Router {
    return buildControlRoutes({
      aggregator: this.healthAggregator,
      alerting: this.alerting,
      workSignals: this.workSignals,
      auditXdr: this.auditXdr,
      slo: this.sloRepo,
      logRing: this.ring,
      engines: () => this.engineHealth(),
      mw: this.middleware,
      logger: this.log,
      config: this.cfg,
    });
  }

  healthRoutes(): Router {
    return buildHealthRoutes({
      aggregator: this.healthAggregator,
      engines: () => this.engineHealth(),
    });
  }

  metricsRoutes(): Router {
    return buildMetricsRoutes({ metrics: this.promMetrics, config: this.cfg, mw: this.middleware });
  }

  mcp(): readonly McpToolRegistration[] {
    return buildObservabilityMcpTools({
      aggregator: this.healthAggregator,
      workSignals: this.workSignals,
      auditXdr: this.auditXdr,
      metrics: this.promMetrics,
      engines: () => this.engineHealth(),
    });
  }

  /** Probe the module's four engines truthfully (signals is an async sidecar probe). */
  private async engineHealth(): Promise<readonly EngineHealth[]> {
    const availability = await this.opsClient.availability();
    return [
      { engine: 'logging', status: 'up', degraded: false },
      { engine: 'metrics', status: 'up', degraded: false },
      {
        engine: 'tracing',
        status: 'up',
        degraded: !this.otelTracer.exporting,
        ...(this.otelTracer.exporting ? {} : { reason: 'no OTLP collector configured (spans not exported)' }),
      },
      {
        engine: 'signals',
        status: availability.status,
        degraded: availability.status !== 'up',
        ...(availability.reason ? { reason: availability.reason } : {}),
      },
    ];
  }

  async health(): Promise<ComponentHealth> {
    const engines = await this.engineHealth();
    return observabilityHealth(engines);
  }

  async start(): Promise<void> {
    this.otelTracer.start();
    if (this.cfg.alertingEnabled && this.cfg.alertEvalIntervalMs > 0 && !this.alertTimer) {
      this.alertTimer = setInterval(() => {
        void this.evaluateAlertsOnce();
      }, this.cfg.alertEvalIntervalMs);
      // Do not keep the process alive solely for the alert loop.
      this.alertTimer.unref?.();
    }
  }

  /** One alert-evaluation pass over the current fused health (degrade-safe). */
  private async evaluateAlertsOnce(): Promise<void> {
    try {
      const engines = await this.engineHealth();
      const health = await this.healthAggregator.full(engines);
      await this.alerting.evaluateRules({ health });
    } catch (err) {
      this.log.warn(
        { err: err instanceof Error ? err.message : String(err) },
        'alert evaluation pass failed',
      );
    }
  }

  async stop(): Promise<void> {
    if (this.alertTimer) {
      clearInterval(this.alertTimer);
      this.alertTimer = null;
    }
    this.otelTracer.shutdown();
    this.ring.clear();
  }
}
