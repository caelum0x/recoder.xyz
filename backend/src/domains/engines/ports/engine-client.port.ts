/**
 * `EngineClientPort<TReq,TRes>` — the ONE contract every engine adapter
 * satisfies, regardless of transport (napi / daemon / sidecar / cli). A consumer
 * domain (inference / memory / conductor / governance / retrieval) takes a typed
 * engine client from this seam; it never imports an engine `dist/` or loads a
 * second `.node`.
 *
 * FROZEN CONTRACT (deep-engine adapters build against this, do not widen it
 * without updating every adapter): identity, transport, lifecycle
 * (`start`/`stop`), a single degrade-safe `invoke`, and truthful `health`.
 *
 * Laws every implementation obeys:
 *  - `invoke` NEVER throws across the seam and NEVER fabricates a result — a
 *    missing binding or a failed call returns `{ ok:false, reason }`.
 *  - `health` NEVER hangs and NEVER fakes `up` — an absent `.node`/binary/venv/
 *    key is a truthful `down` with a reason.
 *  - `start`/`stop` are idempotent and degrade-safe: starting an engine whose
 *    binding is absent is a no-op that leaves health `down`, not an error.
 */
import type { EngineId, EngineHealth, EngineTransport, InvokeResult } from '../types.js';

/**
 * A single engine operation the adapter routes to its native/daemon/sidecar/cli
 * surface. `op` is the engine-local method name (e.g. openfang `runAgent`,
 * tensorzero `inference`, colbert `rerank`); `input` is the typed request.
 */
export interface EngineCall<TReq> {
  /** The engine-local operation name (adapter maps it to the real surface). */
  readonly op: string;
  /** The typed request payload for `op`. */
  readonly input: TReq;
  /** Optional per-call deadline (ms) — the adapter must bound long operations. */
  readonly timeoutMs?: number;
}

/**
 * The common engine client. `TReq`/`TRes` default to `unknown` so the registry
 * can hold heterogeneous adapters behind `EngineClientPort<unknown, unknown>`;
 * a consumer that knows an engine's shape narrows at the typed accessor
 * (`engines.tensorzero()` returns `EngineClientPort<InferenceRequest, ...>`).
 */
export interface EngineClientPort<TReq = unknown, TRes = unknown> {
  /** Stable engine identity (one of `ENGINE_IDS`). */
  readonly id: EngineId;
  /** The delivery shape this adapter is bound through. */
  readonly transport: EngineTransport;

  /**
   * Bind the engine's transport (load the `.node`, ensure the daemon/sidecar is
   * supervised, resolve the CLI). Idempotent + degrade-safe: an absent binding
   * resolves without throwing and leaves `health()` reporting `down`.
   */
  start(): Promise<void>;

  /**
   * Release the engine's transport (SIGTERM a supervised child, drop a cached
   * `.node` handle). Idempotent + degrade-safe; never throws.
   */
  stop(): Promise<void>;

  /**
   * Execute one engine operation. Returns a discriminated `InvokeResult` — a
   * value on success, a truthful `{ ok:false, reason }` on any failure or when
   * the engine is `down`. Never throws across the seam.
   */
  invoke(call: EngineCall<TReq>): Promise<InvokeResult<TRes>>;

  /**
   * Truthful current health. Cheap and non-throwing; a daemon/sidecar may run a
   * bounded `/health` probe, a napi adapter reports whether its `.node` loaded,
   * a CLI adapter reports whether the binary is on PATH.
   */
  health(): Promise<EngineHealth>;
}

/**
 * A convenience base adapters may extend: carries identity + transport and
 * provides no-op idempotent `start`/`stop` so a CLI/napi adapter only overrides
 * what it needs. `invoke`/`health` stay abstract (each adapter's real surface).
 */
export abstract class EngineClientBase<TReq = unknown, TRes = unknown>
  implements EngineClientPort<TReq, TRes>
{
  protected constructor(
    readonly id: EngineId,
    readonly transport: EngineTransport,
  ) {}

  async start(): Promise<void> {
    // Default: nothing to bind (CLI/napi adapters that resolve lazily override).
  }

  async stop(): Promise<void> {
    // Default: nothing to release.
  }

  abstract invoke(call: EngineCall<TReq>): Promise<InvokeResult<TRes>>;
  abstract health(): Promise<EngineHealth>;
}
