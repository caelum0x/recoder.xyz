/**
 * `DaemonSupervisorPort` — the contract for supervising a loopback binary
 * (Rust/Go daemon): spawn once, wait for `/health` 200, restart with capped
 * backoff on exit, and shut down gracefully. ONE implementation folds the
 * scattered `conductor/{openfang,governance,colbert,ops-recorder}-daemon.ts` +
 * `engines/{multica,ziti}-client.ts` supervision.
 *
 * DEGRADE-SAFE laws:
 *  - When the binary is absent, `ensureStarted` resolves to `null` (never throws)
 *    and `health` reports `down` with a reason — the adapter degrades.
 *  - When `<ENGINE>_URL` points at an externally-managed instance, the supervisor
 *    SKIPS spawning and simply trusts/probes that URL (mode `'external'`).
 *  - The child env is NEVER the full `process.env`; only the configured key(s)
 *    + the loopback listen addr are passed (secret-leak guard).
 *  - Bind is loopback-only (`127.0.0.1`) — a supervised daemon never exposes a
 *    routable interface.
 */
import type { EngineHealth } from '../types.js';

/** How to spawn + probe one loopback daemon. */
export interface DaemonSpec {
  /** The engine id (cache key + logging + health `engineId`). */
  readonly engineId: string;
  /**
   * Absolute path to the daemon binary. `null` → the binary is unresolved
   * (unbuilt / wrong arch) and the supervisor degrades to `down`.
   */
  readonly binPath: string | null;
  /** CLI args passed to the binary (e.g. `['serve','--port','8893']`). */
  readonly args: readonly string[];
  /** Loopback listen address (`127.0.0.1:PORT`) — validated to be loopback-only. */
  readonly listenAddr: string;
  /**
   * Externally-managed URL (from `<ENGINE>_URL`). When set, the supervisor does
   * NOT spawn — it trusts + probes this instance (`mode: 'external'`).
   */
  readonly externalUrl?: string | null;
  /**
   * The MINIMAL env overlay for the child (configured keys + listen addr). The
   * supervisor must NOT spread the full `process.env`.
   */
  readonly env?: Readonly<Record<string, string>>;
  /** cwd for the child (so vendored deps resolve); defaults to the bin dir. */
  readonly cwd?: string;
  /** The `/health` path to probe (default `/health`). */
  readonly healthPath?: string;
  /** Max ms to wait for the first healthy probe on boot. */
  readonly waitMs?: number;
}

/** A live daemon handle: how the seam was satisfied + where to reach it. */
export interface DaemonHandle {
  readonly engineId: string;
  /** `external` = operator-managed URL trusted; `spawned` = supervisor owns the child. */
  readonly mode: 'external' | 'spawned';
  /** Base URL the daemon serves on (`http://127.0.0.1:PORT`). */
  readonly baseUrl: string;
  /** Process id when spawned (absent for external). */
  readonly pid?: number;
}

export interface DaemonSupervisorPort {
  /**
   * Ensure the daemon is running (idempotent). Resolves to a handle when the
   * daemon is up (external or spawned + passed health), or `null` when the
   * binary is absent / boot failed / health timed out. Never throws.
   */
  ensureStarted(spec: DaemonSpec): Promise<DaemonHandle | null>;

  /** Stop a supervised daemon (SIGTERM → SIGKILL grace). Idempotent, no-op for external. */
  stop(engineId: string): Promise<void>;

  /** The current handle for an engine, or `null` when not started. */
  handle(engineId: string): DaemonHandle | null;

  /** Truthful health for a supervised daemon (bounded `/health` probe). */
  health(spec: DaemonSpec): Promise<EngineHealth>;

  /** Stop every supervised daemon (lifecycle shutdown). */
  stopAll(): Promise<void>;
}
