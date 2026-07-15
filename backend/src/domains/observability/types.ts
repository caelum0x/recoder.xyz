/**
 * Shared observability domain types — the vocabulary the composer, aggregator,
 * alerting, work-signals, and XDR projection speak.
 *
 * Observability owns NO product state; it owns *signals about* state. These types
 * describe the aggregated health surface (`HealthFull`/`EngineHealth`), the SLO/
 * alert/work-signal records this domain persists, and the read-only XDR query over
 * the governance Merkle chain. None of them owns another domain's data.
 */
import type { ComponentHealth, HealthStatus } from '../../shared/health-types.js';

/** The four truthful states, re-exported so consumers import from one place. */
export type { HealthStatus, ComponentHealth } from '../../shared/health-types.js';

/**
 * Per-engine health inside the observability module itself (its own four engines:
 * logging / metrics / tracing / signals). Distinct from a *domain's*
 * ComponentHealth — this is the module's internal breakdown.
 */
export interface EngineHealth {
  readonly engine: 'logging' | 'metrics' | 'tracing' | 'signals' | 'audit';
  readonly status: HealthStatus;
  /** True when serving but impaired (e.g. tracing up, no collector → export off). */
  readonly degraded: boolean;
  readonly reason?: string;
}

/**
 * The `/health/full` contract: the fused per-domain report across all 14 domains
 * plus the SLO rollup + this module's own engine breakdown. `status`/`degraded`
 * are the worst-of rollup; `sources` is truthful per-domain (down/degraded/unknown
 * are never masked as up).
 */
export interface HealthFull {
  readonly status: HealthStatus;
  readonly degraded: boolean;
  /** Every registered domain's truthful ComponentHealth (timeout → `unknown`). */
  readonly sources: readonly ComponentHealth[];
  /** The observability module's own engine breakdown. */
  readonly engines: readonly EngineHealth[];
  /** Current SLO attainment rollup (empty when no targets configured). */
  readonly slo: readonly SloAttainment[];
  /** Count of sources in each terminal state (fast triage). */
  readonly counts: Readonly<Record<HealthStatus, number>>;
  readonly service: string;
  readonly instanceId: string;
  readonly checkedAt: string;
}

/** The shallow `/health` liveness contract (no per-domain detail, no secrets). */
export interface HealthShallow {
  readonly status: HealthStatus;
  readonly degraded: boolean;
  readonly service: string;
  readonly instanceId: string;
  readonly sources: number;
  readonly checkedAt: string;
}

/** An SLO target row (drives `/health/full` rollup + alert rules). */
export interface SloTarget {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  /** Objective, e.g. 0.999. */
  readonly target: number;
  readonly windowSecs: number;
  /** Prometheus expression backing this SLO. */
  readonly metricQuery: string;
  readonly createdAt: string;
}

/** A target's current attainment (target vs observed), computed at report time. */
export interface SloAttainment {
  readonly id: string;
  readonly name: string;
  readonly target: number;
  /** Observed value; `null` when the backing metric is unavailable (truthful). */
  readonly observed: number | null;
  /** True when `observed` is present and meets `target`. */
  readonly met: boolean | null;
}

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertStatus = 'firing' | 'acked' | 'resolved';

/** An alert rule evaluated by the alerting service. */
export interface AlertRule {
  readonly id: string;
  readonly spaceId: string;
  readonly name: string;
  readonly severity: AlertSeverity;
  /** Condition over metric/health/slo. */
  readonly expr: string;
  /** Debounce window (seconds) before firing. */
  readonly forSecs: number;
  /** Herd board / notify engine target. */
  readonly notifyRoute: string;
  readonly enabled: boolean;
  readonly createdAt: string;
}

/** A fired alert instance (audit trail + ack state). */
export interface AlertEvent {
  readonly id: string;
  readonly ruleId: string;
  readonly spaceId: string;
  readonly status: AlertStatus;
  readonly value: number | null;
  readonly firedAt: string;
  readonly ackedAt: string | null;
  readonly ackedBy: string | null;
  readonly resolvedAt: string | null;
  /** Governance audit record id for the ack (governance-gated write). */
  readonly auditRef: string | null;
}

export type WorkSignalKind = 'stuck' | 'blocked' | 'needs-you';
export type DispositionState = 'open' | 'acknowledged' | 'resolved' | 'dismissed';

/** A normalized work signal surfaced to the board (from the ops-recorder sidecar). */
export interface WorkSignal {
  readonly id: string;
  readonly kind: WorkSignalKind;
  readonly title: string;
  readonly sourceUrl: string;
  readonly reason: string;
  readonly priority: 'high' | 'medium' | 'low';
  /** Correlated run id when the signal maps to a Recoder run (RunEvent link). */
  readonly runId: string | null;
  readonly handoffPrompt: string;
  readonly detectedAt: string;
}

/** The human decision recorded against a work signal (governance-gated write). */
export interface SignalDisposition {
  readonly id: string;
  readonly signalId: string;
  readonly spaceId: string;
  readonly runId: string | null;
  readonly kind: WorkSignalKind;
  readonly disposition: DispositionState;
  readonly decidedBy: string | null;
  readonly decidedAt: string | null;
  readonly auditRef: string | null;
  readonly createdAt: string;
}

/** A read-only XDR query over the governance Merkle audit chain. */
export interface XdrQuery {
  /** Filter by actor id. */
  readonly actorId?: string;
  /** Filter by dotted action (e.g. `pr.create`). */
  readonly action?: string;
  /** Filter by effect. */
  readonly effect?: 'allow' | 'deny';
  /** Max rows returned (bounded). */
  readonly limit?: number;
}

/** One projected, re-verified audit row returned by the XDR surface. */
export interface XdrRecord {
  readonly seq: number;
  readonly actorId: string;
  readonly action: string;
  readonly resource: string;
  readonly effect: string;
  readonly riskTier: string;
  readonly degraded: boolean;
  readonly entryHash: string;
  readonly createdAt: string;
}

/** The XDR query result — records only ever returned when the chain re-verifies. */
export interface XdrResult {
  /** True only when the Merkle chain re-verified clean before projection. */
  readonly verified: boolean;
  /** The seq the chain first broke at, when `verified === false`. */
  readonly brokenAtSeq?: number;
  readonly records: readonly XdrRecord[];
  readonly entries: number;
  readonly verifiedAt: string;
}
