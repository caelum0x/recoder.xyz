/**
 * Canonical engine ids, default loopback bindings, backoff caps, and probe
 * timeouts for the engines seam.
 *
 * These are the ONLY literals the supervisors and adapters share. Loopback
 * addresses are ALWAYS `127.0.0.1` — a supervised daemon/sidecar never binds a
 * routable interface (auth posture: on-host traffic only). Env-derived overrides
 * flow through `config.ts`; nothing here reads `process.env`.
 */
import type { EngineTransport } from './types.js';

/**
 * Every engine the seam knows how to bind, grouped by delivery shape. This is
 * the closed set the wiring-checklist guard and the registry catalog validate
 * against — a new engine must be added here (and to `ENGINE_TRANSPORTS`) before
 * it can be supervised or health-reported.
 */
export const ENGINE_IDS = [
  // Rust napi (in-process `.node`, native-first).
  'openfang',
  'tensorzero',
  'governance',
  // Rust/Go daemons (supervised loopback HTTP).
  'colbert',
  'ops-recorder',
  'multica',
  'ziti',
  'tensorzero-loopback',
  // Python sidecars (uv venv; stdio-MCP or loopback HTTP).
  'mem0',
  'browser-use',
  'pal-mcp',
  // CLI binaries (one-shot subprocess).
  'beads',
  'dmux',
  'tmux',
  'recodergit',
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

/** Fast membership check for an untyped id string. */
export function isEngineId(value: string): value is EngineId {
  return (ENGINE_IDS as readonly string[]).includes(value);
}

/** The delivery shape each engine is reached through (drives supervisor choice). */
export const ENGINE_TRANSPORTS: Readonly<Record<EngineId, EngineTransport>> = {
  openfang: 'napi',
  tensorzero: 'napi',
  governance: 'napi',
  colbert: 'daemon',
  'ops-recorder': 'daemon',
  multica: 'daemon',
  ziti: 'daemon',
  'tensorzero-loopback': 'daemon',
  mem0: 'sidecar',
  'browser-use': 'sidecar',
  'pal-mcp': 'sidecar',
  beads: 'cli',
  dmux: 'cli',
  tmux: 'cli',
  recodergit: 'cli',
};

/**
 * Only supervised, long-lived transports (daemon/sidecar) can be restarted; a
 * napi addon is a process-lifetime in-proc load and a CLI is one-shot — both
 * report a truthful "not restartable" instead of faking a restart.
 */
export function isRestartable(transport: EngineTransport): boolean {
  return transport === 'daemon' || transport === 'sidecar';
}

/** Default loopback bind addresses (127.0.0.1 only) per daemon/sidecar engine. */
export const DEFAULT_LOOPBACK: Readonly<Record<string, string>> = {
  colbert: '127.0.0.1:8893',
  'ops-recorder': '127.0.0.1:8894',
  multica: '127.0.0.1:8895',
  ziti: '127.0.0.1:1280',
  'tensorzero-loopback': '127.0.0.1:3030',
  mem0: '127.0.0.1:8896',
  'browser-use': '127.0.0.1:8897',
};

/** Exponential-backoff cap (ms) for supervised restart loops. */
export const BACKOFF_CAP_MS = 30_000;

/** Base backoff (ms) for the first restart attempt. */
export const BACKOFF_BASE_MS = 1_000;

/** Hard timeout (ms) for a single `/health` probe before it classifies `down`. */
export const PROBE_TIMEOUT_MS = 2_000;

/** How long to wait for a freshly-spawned daemon/sidecar `/health` 200 on boot. */
export const DAEMON_WAIT_MS = 30_000;

/** Poll interval (ms) while waiting for a boot health check to pass. */
export const HEALTH_POLL_MS = 100;

/** Grace period (ms) between SIGTERM and SIGKILL on shutdown. */
export const SIGKILL_GRACE_MS = 5_000;

/** The persistence namespace tables live under (unschema'd public tables). */
export const ENGINE_TABLES = {
  registry: 'engine_registry',
  healthLog: 'engine_health_log',
  restartLog: 'engine_restart_log',
} as const;
