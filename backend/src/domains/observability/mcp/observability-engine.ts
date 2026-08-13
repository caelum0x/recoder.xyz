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
 *  - `obs_scan`          — trigger an on-demand GitHub+Linear stuck-work scan, then refresh.
 *
 * It composes the SAME services the routes use — it does NOT duplicate log
 * read/search (that stays in `agent-os/mcp/logs-engine.ts`), it only surfaces the
 * aggregated health/metrics/audit/signals views.
 *
 * ACTOR IDENTITY (SECURITY): `obs_audit_search` filters the governance audit chain
 * by `actorId` — another actor's governance actions/effects are tenant-owned data,
 * so the filter is derived from the host-authorized {@link McpToolCaller}, NEVER
 * from free-form `args` alone. A NON-privileged caller may only read its OWN audit
 * rows: its `actorId` filter is FORCED to the caller's `userId`, and a caller-named
 * `args.actorId` for anyone else is rejected (403) rather than served (cross-actor
 * audit-trail disclosure). Only an `admin`/`internal` caller may name an arbitrary
 * `actorId` (or omit it for the global ops view). Absent a caller, the handler
 * refuses (never guesses an identity).
 */
import type { McpToolCaller, McpToolRegistration } from '../../../shared/module-base.js';
import { createError, ErrorCode } from '../../../shared/errors.js';
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

/** Does the caller carry an elevated scope that may filter by an arbitrary actor? */
function isPrivileged(caller: McpToolCaller): boolean {
  const scopes = caller.scopes ?? [];
  return scopes.includes('admin') || scopes.includes('internal');
}

/**
 * Resolve the `actorId` audit filter, bound to the authorized {@link McpToolCaller}.
 * A NON-privileged caller is pinned to its OWN `userId` (a caller-supplied
 * `args.actorId` for another actor is rejected 403, never used as a selector); an
 * `admin`/`internal` caller may name any `actorId` or omit it for the global view.
 * Absent a caller, refuse (never guess an identity).
 */
function resolveActorId(raw: unknown, caller: McpToolCaller | undefined): string | undefined {
  const authUserId = str(caller?.userId);
  if (!caller || !authUserId) {
    throw createError(ErrorCode.AUTH_REQUIRED, 'obs_audit_search: no authorized caller identity');
  }
  const requested = str((raw as { actorId?: unknown } | null)?.actorId);
  if (isPrivileged(caller)) return requested;
  // Non-privileged: own actor only. A foreign args.actorId is rejected, not served.
  if (requested && requested !== authUserId) {
    throw createError(
      ErrorCode.AUTHZ_PROJECT_ACCESS_DENIED,
      'obs_audit_search: caller may only read its own audit rows',
    );
  }
  return authUserId;
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
      handler: async (raw: unknown, caller?: McpToolCaller) => {
        const args = (raw ?? {}) as Record<string, unknown>;
        const actorId = resolveActorId(raw, caller);
        const effect = args.effect === 'allow' || args.effect === 'deny' ? args.effect : undefined;
        return deps.auditXdr.verifyAndProject({
          ...(actorId ? { actorId } : {}),
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
    {
      name: 'obs_scan',
      description:
        'Trigger an on-demand scan for stuck/blocked/needs-you work NOW (ops-recorder GitHub + Linear detectors), then return the refreshed signals. Per-detector triggered:false + degraded when the sidecar is down — never a faked scan.',
      handler: async () => {
        const scan = await deps.workSignals.scan();
        return {
          signals: scan.signals,
          triggered: scan.triggered,
          degraded: scan.degraded,
          reason: scan.reason ?? null,
        };
      },
    },
  ];
}
