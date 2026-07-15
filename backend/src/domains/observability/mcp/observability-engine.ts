/**
 * Observability MCP tools — the READ-ONLY surface an agent uses to inspect the
 * running system's truth over the composed observability module. Registered as
 * the `observability` server into the interop-gated MCP host; every call already
 * passed the `authorize→risk→policy→audit` chain at the host boundary, so these
 * handlers stay thin and truthful (never fake green, never fabricate a signal, and
 * never return unverified audit rows).
 *
 *  - `obs_health`        — the fused `/health/full` (per-domain up|down + engines + SLO).
 *  - `obs_metrics_query` — the current Prometheus scrape text (RED/USE snapshot).
 *  - `obs_audit_search`  — the XDR query, Merkle re-verified (tamper → verified:false).
 *  - `obs_signals`       — current ops-recorder work-signals (empty when sidecar down).
 *
 * It composes the SAME services the routes use — it does NOT duplicate log
 * read/search (that stays in `agent-os/mcp/logs-engine.ts`), it only surfaces the
 * aggregated health/metrics/audit/signals views.
 */
import type { McpToolRegistration } from '../../../shared/module-base.js';
import type { HealthAggregator } from '../services/health-aggregator.service.js';
import type { WorkSignalsService } from '../services/work-signals.service.js';
import type { AuditXdrProjection } from '../adapters/audit-xdr.adapter.js';
import type { PrometheusMetrics } from '../adapters/prometheus-registry.adapter.js';
import type { EngineHealth } from '../types.js';

export interface ObservabilityMcpDeps {
  readonly aggregator: HealthAggregator;
  readonly workSignals: WorkSignalsService;
  readonly auditXdr: AuditXdrProjection;
  readonly metrics: PrometheusMetrics;
  readonly engines: () => Promise<readonly EngineHealth[]> | readonly EngineHealth[];
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

/** Build the observability MCP tools (registered via the wiring checklist). */
export function buildObservabilityMcpTools(deps: ObservabilityMcpDeps): readonly McpToolRegistration[] {
  return [
    {
      name: 'obs_health',
      description: 'The fused /health/full across all domains: per-domain up|down|degraded|unknown + engines + SLO rollup (never fakes green).',
      handler: async () => {
        const engines = await deps.engines();
        return deps.aggregator.full(engines);
      },
    },
    {
      name: 'obs_metrics_query',
      description: 'The current Prometheus scrape (RED/USE counters + histograms) as text exposition.',
      handler: async () => {
        return { format: 'prometheus', text: deps.metrics.render() };
      },
    },
    {
      name: 'obs_audit_search',
      description: 'Query the governance Merkle audit chain (XDR). Re-verifies the proof first; a tampered chain returns verified:false with no rows.',
      handler: async (raw: unknown) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const effect = args.effect === 'allow' || args.effect === 'deny' ? args.effect : undefined;
        return deps.auditXdr.verifyAndProject({
          ...(str(args.actorId) ? { actorId: str(args.actorId) } : {}),
          ...(str(args.action) ? { action: str(args.action) } : {}),
          ...(effect ? { effect } : {}),
          limit: Math.min(Number(args.limit) || 100, 500),
        });
      },
    },
    {
      name: 'obs_signals',
      description: 'Current ops-recorder work-signals (stuck/blocked/needs-you). Empty + degraded when the sidecar is down — never fabricated.',
      handler: async () => {
        const refresh = await deps.workSignals.refresh();
        return {
          signals: refresh.signals,
          degraded: refresh.degraded,
          reason: refresh.reason ?? null,
        };
      },
    },
  ];
}
