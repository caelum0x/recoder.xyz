/**
 * `DaemonEngineAdapter` — the shared base every supervised-loopback engine
 * adapter (colbert, ops-recorder, multica) extends. It implements the frozen
 * `EngineClientPort` lifecycle (`start`/`stop`/`health`) once, on top of the
 * injected `DaemonSupervisorPort`, so a concrete adapter only supplies its
 * `DaemonSpec` (how to spawn/probe its binary) and its `invoke` (the real HTTP
 * calls to the daemon's own endpoints).
 *
 * DEGRADE-SAFE LAW (held here, not re-implemented per adapter):
 *  - `start` calls `supervisor.ensureStarted(spec)` — an absent binary resolves
 *    to `null` and health stays `down`; the call NEVER throws.
 *  - `stop` is an idempotent SIGTERM→SIGKILL delegate to the supervisor.
 *  - `health` delegates to the supervisor's bounded `/health` probe (which is
 *    truthful: `down` with a reason when the binary is unbuilt / not started).
 *  - A disabled engine is never bound and reports `down` with reason
 *    `"disabled"` — the config flag short-circuits before any spawn.
 *  - `invoke` resolves the live base URL through `ensureStarted` (idempotent) so
 *    the first call boots the daemon; when it cannot bind, every op returns a
 *    truthful `{ ok:false, reason }` (never a fabricated result).
 *
 * The base owns NO transport of its own — the ONE `DaemonSupervisor` (frozen
 * FROZEN #1 seam) owns the raw child process + loopback bind. Consumers reach
 * these engines only through the typed `EngineClientPort`.
 */
import type { Logger } from '../../../../shared/logger.js';
import { DEFAULT_LOOPBACK } from '../../constants.js';
import type {
  DaemonSpec,
  DaemonSupervisorPort,
} from '../../ports/daemon-supervisor.port.js';
import { EngineClientBase } from '../../ports/engine-client.port.js';
import { down, fail, type EngineHealth, type EngineId, type InvokeResult } from '../../types.js';

/**
 * The narrowed config slice a daemon adapter consumes, projected by the composer
 * out of `EnginesConfig` (bootstrap injects the env-derived values — no adapter
 * reads `process.env`). Every field is degrade-safe when unset.
 */
export interface DaemonAdapterConfig {
  /** False → the engine is never bound and reports `down` reason "disabled". */
  readonly enabled: boolean;
  /**
   * Externally-managed URL (`<ENGINE>_URL`). When set, the supervisor SKIPS
   * spawning and trusts + probes this instance. `null` → app-owned spawn.
   */
  readonly externalUrl: string | null;
  /**
   * Operator-pinned binary path (`<ENGINE>_BIN` / `<ENGINE>_PYTHON`). `null` →
   * the adapter resolves its own binding via the vendored OSS resolver.
   */
  readonly binOverride: string | null;
  /** Loopback listen address (`127.0.0.1:PORT`); defaults to `DEFAULT_LOOPBACK`. */
  readonly listenAddr?: string;
  /**
   * MINIMAL child env overlay (configured keys + listen addr), composer-injected.
   * NEVER the full `process.env` — the supervisor enforces the same law.
   */
  readonly childEnv?: Readonly<Record<string, string>>;
}

/** Shared shape a concrete adapter returns from `resolveSpec` when it can bind. */
export interface ResolvedBinding {
  /** The binary to spawn (python interpreter / Go server). `null` → degrade. */
  readonly binPath: string | null;
  /** Args after the binary (e.g. `[entrypoint]` or uvicorn flags). */
  readonly args: readonly string[];
  /** cwd for the child so vendored deps resolve. */
  readonly cwd?: string;
  /** MINIMAL child env overlay. */
  readonly env?: Readonly<Record<string, string>>;
  /** `/health` path override (default `/health`). */
  readonly healthPath?: string;
}

export abstract class DaemonEngineAdapter<TReq = unknown, TRes = unknown>
  extends EngineClientBase<TReq, TRes>
{
  protected constructor(
    id: EngineId,
    protected readonly supervisor: DaemonSupervisorPort,
    protected readonly config: DaemonAdapterConfig,
    protected readonly log: Logger,
  ) {
    super(id, 'daemon');
  }

  /** The loopback listen addr this engine binds (config override → default). */
  protected listenAddr(): string {
    return this.config.listenAddr ?? DEFAULT_LOOPBACK[this.id] ?? '127.0.0.1:0';
  }

  /**
   * Resolve the concrete binding (binary + args + cwd + env). Returns a binding
   * with `binPath: null` when the engine cannot be spawned (missing binary /
   * unmet preflight) — the supervisor then degrades to `down`. Never throws.
   */
  protected abstract resolveBinding(): ResolvedBinding;

  /** Build the spec the supervisor spawns/probes. Degrade-safe when disabled. */
  protected buildSpec(): DaemonSpec {
    const listenAddr = this.listenAddr();
    if (!this.config.enabled) {
      // Disabled → force the degrade path (null binary, no external URL).
      return { engineId: this.id, binPath: null, args: [], listenAddr };
    }
    const binding = this.resolveBinding();
    return {
      engineId: this.id,
      binPath: this.config.binOverride ?? binding.binPath,
      args: binding.args,
      listenAddr,
      externalUrl: this.config.externalUrl,
      ...(binding.env ? { env: binding.env } : {}),
      ...(binding.cwd ? { cwd: binding.cwd } : {}),
      ...(binding.healthPath ? { healthPath: binding.healthPath } : {}),
    };
  }

  override async start(): Promise<void> {
    if (!this.config.enabled) return; // disabled → no-op, stays down
    try {
      await this.supervisor.ensureStarted(this.buildSpec());
    } catch (err) {
      this.log.warn({ engineId: this.id, err: message(err) }, 'daemon adapter start degraded');
    }
  }

  override async stop(): Promise<void> {
    try {
      await this.supervisor.stop(this.id);
    } catch {
      /* idempotent, degrade-safe */
    }
  }

  async health(): Promise<EngineHealth> {
    if (!this.config.enabled) {
      return down(this.id, 'daemon', 'disabled');
    }
    try {
      return await this.supervisor.health(this.buildSpec());
    } catch (err) {
      return down(this.id, 'daemon', `health probe error: ${message(err)}`);
    }
  }

  /**
   * Resolve the live base URL (idempotently booting the daemon on first call),
   * or a truthful `{ ok:false }` when the engine is disabled/unbindable. A
   * concrete `invoke` calls this, then performs its real HTTP op.
   */
  protected async resolveBaseUrl(): Promise<InvokeResult<string>> {
    if (!this.config.enabled) return fail(`${this.id} is disabled`, 'engine_disabled');
    try {
      const handle = await this.supervisor.ensureStarted(this.buildSpec());
      if (!handle) {
        return fail(
          `${this.id} daemon unavailable (binary/deps absent or health check failed)`,
          'engine_down',
        );
      }
      return { ok: true, value: handle.baseUrl };
    } catch (err) {
      return fail(`${this.id} daemon bind error: ${message(err)}`, 'engine_down');
    }
  }
}

/** Extract a message from an unknown throwable without leaking a stack. */
export function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * A bounded `fetch` helper every daemon adapter shares: hard-timeout, never
 * throws into the caller — a network error / non-2xx becomes a typed
 * `{ ok:false, reason }`. JSON body parsed on success; a non-JSON 2xx yields the
 * raw text under `{ raw }`.
 */
export async function daemonFetch<T = unknown>(
  url: string,
  init: {
    readonly method?: string;
    readonly headers?: Readonly<Record<string, string>>;
    readonly body?: unknown;
    readonly timeoutMs?: number;
  } = {},
): Promise<InvokeResult<T>> {
  const timeoutMs = init.timeoutMs ?? 15_000;
  try {
    const res = await (globalThis.fetch as typeof fetch)(url, {
      method: init.method ?? 'GET',
      ...(init.headers ? { headers: { ...init.headers } } : {}),
      ...(init.body !== undefined
        ? {
            headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
            body: typeof init.body === 'string' ? init.body : JSON.stringify(init.body),
          }
        : {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) {
      return fail(`HTTP ${res.status} from ${url}`, `http_${res.status}`);
    }
    const text = await res.text();
    if (!text) return { ok: true, value: undefined as T };
    try {
      return { ok: true, value: JSON.parse(text) as T };
    } catch {
      return { ok: true, value: { raw: text } as unknown as T };
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? `request timed out after ${timeoutMs}ms`
        : `request failed: ${message(err)}`;
    return fail(reason, 'request_failed');
  }
}
