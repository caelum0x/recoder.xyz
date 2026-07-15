/**
 * `WorkSignalsPort` — the engine boundary to the Python `ops-recorder`
 * work-signals sidecar. The TS side NEVER detects signals itself; it fetches what
 * the sidecar detected, normalizes them to `RunEvent`s, and routes them to the
 * board. When the sidecar (venv/torch/process) is absent, `availability()` is
 * `down` and `fetchSignals()` returns EMPTY — the domain fabricates NO signals
 * (truthful degrade: a silent hang must never look like "no problems").
 *
 * FROZEN CONTRACT — Phase 11 seam over the existing
 * `backend/engines/py/ops-recorder/work-signals` HTTP surface.
 */
import type { HealthStatus } from '../../../shared/health-types.js';

/** The raw signal shape the Python sidecar returns (before RunEvent normalization). */
export interface RawWorkSignal {
  readonly id: string;
  readonly source: string;
  readonly item_type: string;
  readonly title: string;
  readonly source_url: string;
  readonly assignee?: string | null;
  readonly status?: string | null;
  readonly detected_reason: string;
  readonly priority: string;
  readonly why_it_matters?: string;
  readonly recommended_next_action?: string;
  readonly agent_handoff_prompt?: string;
  readonly resolved?: boolean;
  readonly created_at?: string;
  readonly detected_at?: string;
}

/** The sidecar availability probe result (drives the signals engine health). */
export interface SignalsAvailability {
  readonly status: HealthStatus;
  /** Why not `up` (sidecar unreachable, auth preflight failed, venv absent). */
  readonly reason?: string;
}

export interface WorkSignalsPort {
  /**
   * Pull all currently-detected raw signals from the sidecar. Returns `[]` when
   * the sidecar is unavailable — NEVER fabricated data.
   */
  fetchSignals(): Promise<readonly RawWorkSignal[]>;
  /** Fetch one signal by id (null when absent or sidecar down). */
  fetchSignal(id: string): Promise<RawWorkSignal | null>;
  /**
   * Probe the sidecar (auth-preflighted). `down` when unreachable/unauthorized so
   * `/health/full` shows the signals engine truthfully, not green.
   */
  availability(): Promise<SignalsAvailability>;
}
