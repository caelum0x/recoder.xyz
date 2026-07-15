/**
 * Core shared types for the engines seam — the vocabulary every supervisor,
 * adapter, and consumer speaks. Kept deliberately small: identity, transport,
 * truthful health, and a discriminated invoke result.
 *
 * The domain-local `EngineStatus` string union (`up|down|degraded`) is distinct
 * from the shared `EngineStatus` *interface* in `shared/health-types.ts` — this
 * one is the raw status value an adapter reports; the composer's `health.ts`
 * maps it into the shared `ComponentHealth`/`EngineStatus` shapes for `/health`.
 */
import type { EngineId } from './constants.js';

export type { EngineId };

/** How an engine is reached (drives which supervisor owns its lifecycle). */
export type EngineTransport = 'napi' | 'daemon' | 'sidecar' | 'cli';

/** The three truthful states an engine adapter reports (never a faked `up`). */
export type EngineStatus = 'up' | 'down' | 'degraded';

/**
 * A live, truthful health reading for one engine. `down` always carries a
 * `reason` (missing `.node`, unbuilt binary, absent venv, CLI not on PATH,
 * missing required key). `probeMs` is set when a network/health probe ran.
 */
export interface EngineHealth {
  readonly engineId: EngineId;
  readonly transport: EngineTransport;
  readonly status: EngineStatus;
  /** Why the engine is not `up`; required whenever status !== 'up'. */
  readonly reason?: string;
  /** Probed version string when the engine exposes one. */
  readonly version?: string;
  /** Resolved `.node` / binary / venv / CLI path when bound. */
  readonly bindingPath?: string;
  /** Probe latency in ms (daemon/sidecar HTTP probes). */
  readonly probeMs?: number;
  /** ISO-8601 timestamp the reading was taken. */
  readonly checkedAt: string;
}

/**
 * The static description of a declared engine: its identity, transport, a human
 * title, whether it can be restarted (daemon/sidecar only), and whether its
 * absence is expected (optional engines degrade to `down` without alarming).
 */
export interface EngineDescriptor {
  readonly id: EngineId;
  readonly transport: EngineTransport;
  readonly title: string;
  /** Only supervised daemon/sidecar engines are restartable. */
  readonly restartable: boolean;
  /** True when a missing binding is an expected degrade, not a fault. */
  readonly optional: boolean;
}

/**
 * A discriminated result for any engine `invoke`. Adapters NEVER throw across
 * the seam and NEVER fabricate a value — a failure is a typed `{ ok:false }`
 * with a truthful reason so callers degrade explicitly.
 */
export type InvokeResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string; readonly code?: string };

/** Build a successful invoke result. */
export function ok<T>(value: T): InvokeResult<T> {
  return { ok: true, value };
}

/** Build a failed invoke result with a truthful reason. */
export function fail<T = never>(reason: string, code?: string): InvokeResult<T> {
  return code ? { ok: false, reason, code } : { ok: false, reason };
}

/** Build a `down` health reading with a required reason. */
export function down(
  engineId: EngineId,
  transport: EngineTransport,
  reason: string,
  extra?: { readonly bindingPath?: string },
): EngineHealth {
  return {
    engineId,
    transport,
    status: 'down',
    reason,
    checkedAt: new Date().toISOString(),
    ...(extra?.bindingPath ? { bindingPath: extra.bindingPath } : {}),
  };
}

/** Build an `up` health reading. */
export function up(
  engineId: EngineId,
  transport: EngineTransport,
  extra?: { readonly version?: string; readonly bindingPath?: string; readonly probeMs?: number },
): EngineHealth {
  return {
    engineId,
    transport,
    status: 'up',
    checkedAt: new Date().toISOString(),
    ...(extra?.version ? { version: extra.version } : {}),
    ...(extra?.bindingPath ? { bindingPath: extra.bindingPath } : {}),
    ...(extra?.probeMs !== undefined ? { probeMs: extra.probeMs } : {}),
  };
}
