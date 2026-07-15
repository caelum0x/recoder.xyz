/**
 * `SidecarSupervisorPort` — the contract for supervising a Python uv-venv
 * sidecar (mem0, browser-use, pal-mcp-server) over EITHER stdio-MCP or loopback
 * HTTP. It wraps interop's `ExternalMcpProcessManager` for the stdio-MCP variant
 * and the daemon-style spawn for the loopback-HTTP variant.
 *
 * A pre-spawn `auth-preflight` runs BEFORE any process is started: it checks the
 * uv venv exists and the required keys are present. If the venv (or torch, for
 * the ML sidecars) is absent, the supervisor degrades to `down` with a truthful
 * reason — it NEVER installs deps and NEVER fakes a `ready`.
 */
import type { EngineHealth } from '../types.js';

/** The transport a sidecar exposes once running. */
export type SidecarTransport = 'stdio-mcp' | 'loopback-http';

/** How to preflight + spawn one Python sidecar. */
export interface SidecarSpec {
  /** The engine id (cache key + logging + health `engineId`). */
  readonly engineId: string;
  /** Which transport the sidecar speaks. */
  readonly transport: SidecarTransport;
  /**
   * Absolute path to the sidecar's uv venv python interpreter. `null` → the venv
   * is absent and the supervisor degrades to `down` (never spawns).
   */
  readonly pythonPath: string | null;
  /** Absolute path to the sidecar entrypoint (`server.py` / module). */
  readonly entrypoint: string | null;
  /** Args passed after the entrypoint. */
  readonly args?: readonly string[];
  /** Loopback listen address for the `loopback-http` transport. */
  readonly listenAddr?: string;
  /**
   * `/health` path to probe for the `loopback-http` transport (default
   * `/health`). Some sidecars mount it elsewhere (mem0 → `/api/health`).
   */
  readonly healthPath?: string;
  /** MINIMAL child env overlay (required keys + listen addr); NOT the full env. */
  readonly env?: Readonly<Record<string, string>>;
  /** Env var names that MUST be present in `env` for the sidecar to be usable. */
  readonly requiredKeys?: readonly string[];
  /** cwd for the child (vendored dep resolution). */
  readonly cwd?: string;
  /** Max ms to wait for the sidecar to become ready. */
  readonly waitMs?: number;
}

/**
 * The outcome of the pre-spawn preflight. `ok:false` short-circuits the spawn and
 * becomes the engine's truthful `down` reason.
 */
export interface PreflightResult {
  readonly ok: boolean;
  /** Why the sidecar cannot be spawned (missing venv / missing required key). */
  readonly reason?: string;
  /** The keys that were checked (for the audit/health detail). */
  readonly checkedKeys?: readonly string[];
}

/** A live sidecar handle: transport + how to reach it. */
export interface SidecarHandle {
  readonly engineId: string;
  readonly transport: SidecarTransport;
  /** Base URL for `loopback-http`; absent for `stdio-mcp`. */
  readonly baseUrl?: string;
  /** The interop external-server id for `stdio-mcp`; absent for `loopback-http`. */
  readonly externalServerId?: string;
  readonly pid?: number;
}

export interface SidecarSupervisorPort {
  /**
   * Run the pre-spawn auth preflight (venv exists, required keys present) WITHOUT
   * spawning. A caller can gate on this to report `down` early.
   */
  preflight(spec: SidecarSpec): Promise<PreflightResult>;

  /**
   * Ensure the sidecar is running (idempotent): preflight → spawn (uv venv) →
   * stdio-MCP or loopback-HTTP ready. Resolves to a handle, or `null` when the
   * preflight fails / the venv is absent / boot failed. Never throws.
   */
  ensureStarted(spec: SidecarSpec): Promise<SidecarHandle | null>;

  /** Stop a supervised sidecar (SIGTERM → SIGKILL grace). Idempotent. */
  stop(engineId: string): Promise<void>;

  /** Current handle for an engine, or `null` when not started. */
  handle(engineId: string): SidecarHandle | null;

  /** Truthful health (preflight + liveness) — degrades to `down` when venv absent. */
  health(spec: SidecarSpec): Promise<EngineHealth>;

  /** Stop every supervised sidecar (lifecycle shutdown). */
  stopAll(): Promise<void>;
}
