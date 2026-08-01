/**
 * Observability domain — public factory + the ONE public surface.
 *
 * `createObservabilityModule(deps)` builds the composer that fuses logging /
 * metrics / tracing / health-aggregation / audit-XDR / work-signals behind the
 * single {@link ObservabilityModule} interface. It is the LAST domain (Phase 11):
 * it consumes the frozen seams of every prior phase — the persistence executor,
 * the identity auth middleware, the governance gate, and (critically) the boot-time
 * HealthRegistry of ALL domain HealthSources — and re-implements none of them.
 *
 * Truthful degrade throughout: no OTLP collector ⇒ tracing no-ops (degraded); no
 * ops-recorder sidecar ⇒ signals `down` with NO fabricated data; no metrics token
 * in prod ⇒ `/metrics` fails safe; a domain health timeout ⇒ `unknown` in the
 * aggregate, never a hang.
 */
import { ObservabilityComposer, type ObservabilityModuleDeps } from './observability-module.js';

/** Build the observability module. Synchronous — no engine daemons, pure TS. */
export function createObservabilityModule(deps: ObservabilityModuleDeps): ObservabilityComposer {
  return new ObservabilityComposer(deps);
}

export { ObservabilityComposer } from './observability-module.js';
export type { ObservabilityModule, ObservabilityModuleDeps } from './observability-module.js';

// Config slice.
export {
  sliceObservabilityConfig,
  observabilityConfigSchema,
  type ObservabilityConfig,
  type ObservabilityConfigOverrides,
} from './config.js';

// Domain types.
export type {
  HealthFull,
  HealthShallow,
  EngineHealth,
  SloTarget,
  SloAttainment,
  AlertRule,
  AlertEvent,
  AlertSeverity,
  AlertStatus,
  WorkSignal,
  WorkSignalKind,
  SignalDisposition,
  DispositionState,
  XdrQuery,
  XdrRecord,
  XdrResult,
} from './types.js';

// Ports (the seams other domains consume).
export type {
  MetricsPort,
  MetricsReader,
  MetricSample,
  MetricSpec,
  MetricLabels,
  CounterHandle,
  GaugeHandle,
  HistogramHandle,
  TimerHandle,
} from './ports/metrics.port.js';
export type {
  TracerPort,
  Span,
  SpanContext,
  SpanOptions,
  TraceCarrier,
} from './ports/tracer.port.js';
export type { HealthSource, HealthReport, HealthSourceRegistry } from './ports/health-source.port.js';
export { isHealthSource } from './ports/health-source.port.js';
export type { WorkSignalsPort, RawWorkSignal, SignalsAvailability } from './ports/signals.port.js';
export type {
  OpsRecorderPushPort,
  OpsRecorderPushResult,
  OpsRecorderSyncResult,
  RunSignalPush,
} from './ports/ops-recorder-push.port.js';
export type { RunOutcomeSignal } from './services/run-signal-push.service.js';
export type {
  AlertRepository,
  SignalDispositionRepository,
  SloRepository,
} from './ports/observability.repository.js';

// Health fusion (the frozen aggregator + its pure helpers).
export {
  HealthAggregator,
  buildHealthFull,
  rollupStatus,
  countStatuses,
} from './services/health-aggregator.service.js';
export { observabilityHealth } from './health.js';

// Correlation lifecycle (used by logger + tracer + metrics labels).
export {
  runWithCorrelation,
  currentCorrelation,
  currentCorrelationId,
  correlationLabels,
  enrichCorrelation,
  type CorrelationContext,
} from './services/correlation.service.js';

// Adapters + services surfaced for direct wiring/testing.
export { PrometheusMetrics, renderMetrics } from './adapters/prometheus-registry.adapter.js';
export { OtelTracer, startTracing, shutdownTracing } from './adapters/otel-tracer.adapter.js';
export { OpsRecorderClient } from './adapters/ops-recorder.adapter.js';
export { RunSignalPushService } from './services/run-signal-push.service.js';
export {
  AuditXdrProjection,
  AuditUnavailableError,
  queryXdr,
  type AuditReader,
} from './adapters/audit-xdr.adapter.js';
export {
  createCorrelatedLogger,
  LogRingBuffer,
  redactFields,
  type CorrelatedLogger,
  type LogRecord,
} from './adapters/pino-logger.adapter.js';
export { WorkSignalsService, normalizeSignal, toRunEvent, classifyKind } from './services/work-signals.service.js';
export { AlertingService, evaluateExpr } from './services/alerting.service.js';
export {
  SloEvaluator,
  DEFAULT_RED_CONFIG,
  type RedAvailabilityConfig,
  type SloEvaluation,
  type SloInsufficientReason,
} from './services/slo-evaluator.service.js';

// Repositories (concrete impls over the persistence executor).
export {
  createSloRepository,
  createAlertRepository,
  createSignalDispositionRepository,
  PgAuditReader,
} from './repositories/observability.repository.js';

// Middleware + MCP.
export { telemetryMiddleware, wsTelemetry } from './middleware/telemetry.middleware.js';
export { buildObservabilityMcpTools } from './mcp/observability-engine.js';
