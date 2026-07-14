/**
 * Shared health primitives.
 *
 * Every domain module exposes truthful health through these shapes. The
 * invariant (ARCHITECTURE §10.1): a missing key/binary/venv yields `down` with a
 * reason; `degraded` when a module still serves but an engine is impaired; a
 * timed-out probe yields `unknown` — never a faked `up`, never a hang.
 */

/** The four truthful states a component or engine can report. */
export type HealthStatus = 'up' | 'down' | 'degraded' | 'unknown';

/** Health of a single non-TS engine (napi/daemon/sidecar/cli) behind a module. */
export interface EngineStatus {
  readonly name: string;
  readonly status: HealthStatus;
  /** Why the engine is not `up` (missing binary, unreachable, version mismatch). */
  readonly reason?: string;
}

/** Health of one domain module / health source. */
export interface ComponentHealth {
  readonly name: string;
  readonly status: HealthStatus;
  /** True when the component serves but at least one dependency is impaired. */
  readonly degraded: boolean;
  /** Human-readable reason when not fully `up`. */
  readonly reason?: string;
  /** Per-engine breakdown, when the module fronts non-TS engines. */
  readonly engines?: readonly EngineStatus[];
  /** Optional structured detail (never secrets). */
  readonly detail?: Readonly<Record<string, unknown>>;
}

/** The aggregated report across every registered health source. */
export interface HealthReport {
  readonly status: HealthStatus;
  readonly degraded: boolean;
  readonly sources: readonly ComponentHealth[];
  /** ISO-8601 timestamp the report was produced. */
  readonly checkedAt: string;
}

/**
 * The contract a module implements to be aggregated into `/health`.
 * `health()` may be sync or async; the registry bounds it with a timeout so a
 * slow source degrades to `unknown` rather than hanging the aggregate.
 */
export interface HealthSource {
  readonly name: string;
  health(): ComponentHealth | Promise<ComponentHealth>;
}

/** Build an `up` component report (no impaired dependencies). */
export function healthy(name: string, detail?: Record<string, unknown>): ComponentHealth {
  return { name, status: 'up', degraded: false, ...(detail ? { detail } : {}) };
}

/** Build a `down` component report with a required reason. */
export function unhealthy(name: string, reason: string, engines?: readonly EngineStatus[]): ComponentHealth {
  return { name, status: 'down', degraded: false, reason, ...(engines ? { engines } : {}) };
}

/** Build a `degraded` component report (serving, but a dependency is impaired). */
export function degraded(name: string, reason: string, engines?: readonly EngineStatus[]): ComponentHealth {
  return { name, status: 'degraded', degraded: true, reason, ...(engines ? { engines } : {}) };
}
