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
import {
  CircuitBreaker,
  CircuitOpenError,
  withRetry,
  type Random,
  type Sleep,
} from '../../../../shared/outbound-resilience.js';
import { startOutboundSpan } from '../../../../shared/outbound-trace.js';
// TYPE-ONLY: the frozen Phase-11 tracing seam (erased at build). The concrete
// value is late-bound by `EnginesComposer.setMcpTelemetry` (bootstrap, after
// observability composes) via {@link setDaemonFetchTracer}.
import type { TracerPort } from '../../../observability/ports/tracer.port.js';
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

/* ------------------------------------------------------------------ *
 * Outbound resilience for the shared sidecar transport (Slice BE-8.5)  *
 * ------------------------------------------------------------------ */

/** Fetch signature `daemonFetch` calls — injectable so tests never touch net. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Init the shared sidecar `fetch` accepts (unchanged wire contract). */
export interface DaemonFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly timeoutMs?: number;
}

/**
 * Optional resilience seam layered around `daemonFetch`. Every field is
 * injectable so the breaker/retry are deterministically testable; production
 * callers pass nothing and get the shared process-wide breaker + real timers.
 */
export interface DaemonFetchResilience {
  /** The per-sidecar breaker to gate on. Default: the shared module breaker. */
  readonly breaker?: CircuitBreaker;
  /** Override the breaker key (default: the URL's `scheme//host:port` origin). */
  readonly breakerKey?: string;
  /** Injected fetch (default `globalThis.fetch`). */
  readonly fetchImpl?: FetchLike;
  /** Total probe attempts for IDEMPOTENT reads (GET/HEAD). Clamped >=1. Default 3. */
  readonly maxAttempts?: number;
  /** Backoff base for the retry (ms). Default 50. */
  readonly baseDelayMs?: number;
  /** Backoff ceiling for the retry (ms). Default 1_000. */
  readonly maxDelayMs?: number;
  /** Injected RNG for jitter (default Math.random). */
  readonly random?: Random;
  /** Injected abortable delay (default a real setTimeout). */
  readonly sleep?: Sleep;
  /**
   * BE-7.3b tracer override (tests): defaults to the module-wide late-bound
   * tracer set by {@link setDaemonFetchTracer}; an explicit `null` disables
   * tracing for this call. A tracer fault never alters a sidecar call.
   */
  readonly tracer?: TracerPort | null;
}

/**
 * The module-wide late-bound tracer shared by every daemon adapter's
 * `daemonFetch` (same shared-module-state precedent as {@link sidecarBreaker}).
 * Bound once by `EnginesComposer.setMcpTelemetry` after observability composes;
 * until then every sidecar call runs untraced — never a fabricated span.
 */
let daemonTracer: TracerPort | null = null;

/** BE-7.3b: late-bind (or clear, in tests) the shared sidecar-call tracer. */
export function setDaemonFetchTracer(tracer: TracerPort | null): void {
  daemonTracer = tracer;
}

/**
 * The ONE process-wide breaker shared across every daemon adapter. Keyed by the
 * sidecar origin so one dead sidecar (colbert) can never trip calls to a healthy
 * one (ops-recorder). A "failure" here is a TRANSPORT-level outage (connection
 * refused / timeout — the sidecar is unreachable), NOT an HTTP error status: a
 * 4xx/5xx means the sidecar answered, so the circuit stays closed and the caller
 * degrades on the specific status instead.
 */
export const sidecarBreaker = new CircuitBreaker({ failureThreshold: 5, cooldownMs: 10_000 });

/** Derive a per-sidecar breaker key from a URL (its origin, so all paths share). */
export function sidecarKeyForUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    // Un-parseable URL: fall back to the raw string so we still isolate by target.
    return url;
  }
}

/** A read is retry-safe only for the idempotent probe methods (never a POST/PATCH). */
function isIdempotentMethod(method: string): boolean {
  const m = method.toUpperCase();
  return m === 'GET' || m === 'HEAD';
}

/** Classified outcome of a single fetch attempt (drives retry + breaker bookkeeping). */
interface FetchOutcome<T> {
  readonly result: InvokeResult<T>;
  /** True when the sidecar was UNREACHABLE (network error / timeout) — trips the breaker. */
  readonly transportFailure: boolean;
  /** True on a 5xx (the sidecar answered but erred) — retry-worthy, but not a breaker trip. */
  readonly serverError: boolean;
}

/** Internal sentinel: thrown inside the retry op so `withRetry` backs off + retries. */
class RetryableFetchError<T> extends Error {
  constructor(readonly outcome: FetchOutcome<T>) {
    super('retryable daemon fetch outcome');
    this.name = 'RetryableFetchError';
  }
}

/**
 * One real fetch attempt against the sidecar. Never throws — a network error /
 * timeout / non-2xx becomes a typed `{ ok:false, reason }`, classified so the
 * caller can decide about retry (transient) vs breaker (unreachable).
 */
async function attemptDaemonFetch<T>(
  url: string,
  init: DaemonFetchInit,
  fetchImpl: FetchLike,
): Promise<FetchOutcome<T>> {
  const timeoutMs = init.timeoutMs ?? 15_000;
  try {
    const res = await fetchImpl(url, {
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
      return {
        result: fail(`HTTP ${res.status} from ${url}`, `http_${res.status}`),
        transportFailure: false,
        serverError: res.status >= 500,
      };
    }
    const text = await res.text();
    if (!text) {
      return { result: { ok: true, value: undefined as T }, transportFailure: false, serverError: false };
    }
    try {
      return { result: { ok: true, value: JSON.parse(text) as T }, transportFailure: false, serverError: false };
    } catch {
      return {
        result: { ok: true, value: { raw: text } as unknown as T },
        transportFailure: false,
        serverError: false,
      };
    }
  } catch (err) {
    const reason =
      err instanceof Error && err.name === 'TimeoutError'
        ? `request timed out after ${timeoutMs}ms`
        : `request failed: ${message(err)}`;
    return { result: fail(reason, 'request_failed'), transportFailure: true, serverError: false };
  }
}

/**
 * A bounded, resilient `fetch` helper every daemon adapter shares. On top of the
 * original contract (hard-timeout; never throws; non-2xx / network error → typed
 * `{ ok:false, reason }`; JSON parsed on success; non-JSON 2xx → `{ raw }`) it now:
 *
 *  - Gates each call through a PER-SIDECAR `CircuitBreaker`. While the breaker is
 *    OPEN (the sidecar was recently unreachable) it FAST-FAILS truthfully with
 *    `{ ok:false, code:'circuit_open' }` — the same degrade-to-unavailable path
 *    the caller already handles, never a fabricated result.
 *  - Retries ONLY idempotent probe reads (GET/HEAD) on a transient failure
 *    (transport error / timeout / 5xx) with bounded jittered backoff. A stateful
 *    POST/PATCH/DELETE is NEVER re-sent — it fails fast on the first error.
 *  - Records breaker outcome by REACHABILITY: an unreachable sidecar (transport
 *    error / timeout) is a breaker failure; any HTTP answer (2xx…5xx) is a success
 *    so a single bad request never trips the whole sidecar.
 *
 * Fully backward compatible: existing callers pass `(url, init)` and get the same
 * `InvokeResult` shape; the resilience seam is an optional third argument.
 */
export async function daemonFetch<T = unknown>(
  url: string,
  init: DaemonFetchInit = {},
  resilience: DaemonFetchResilience = {},
): Promise<InvokeResult<T>> {
  const breaker = resilience.breaker ?? sidecarBreaker;
  const key = resilience.breakerKey ?? sidecarKeyForUrl(url);
  const fetchImpl = resilience.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
  const idempotent = isIdempotentMethod(init.method ?? 'GET');

  // 0. BE-7.3b: child span + W3C traceparent on the outbound sidecar call.
  //    Unwired ⇒ `trace` is null and the call is byte-identical to the untraced
  //    path; a tracer fault can never alter, fail, or reorder the sidecar call.
  const trace = startOutboundSpan(
    resilience.tracer !== undefined ? resilience.tracer : daemonTracer,
    'engines.daemon_call',
    { 'daemon.target': key, 'http.method': (init.method ?? 'GET').toUpperCase() },
  );
  const tracedInit: DaemonFetchInit = trace
    ? { ...init, headers: { ...trace.headers, ...(init.headers ?? {}) } }
    : init;

  // 1. Circuit gate — fast-fail truthfully while OPEN (or half-open probe in flight).
  try {
    breaker.guard(key);
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      trace?.fail(`${key} sidecar circuit open (retry after ${err.retryAfterMs}ms)`);
      return fail(
        `${key} sidecar circuit open (retry after ${err.retryAfterMs}ms) — recently unreachable`,
        'circuit_open',
      );
    }
    trace?.fail(message(err));
    throw err; // unexpected: never swallow a non-breaker programming error
  }

  // 2. Run the call. Idempotent reads get bounded jittered retry; stateful writes
  //    fail fast (a non-idempotent op is never silently re-sent).
  let outcome: FetchOutcome<T>;
  if (idempotent) {
    try {
      outcome = await withRetry<FetchOutcome<T>>(
        async () => {
          const o = await attemptDaemonFetch<T>(url, tracedInit, fetchImpl);
          if (o.transportFailure || o.serverError) throw new RetryableFetchError(o);
          return o;
        },
        {
          idempotent: true,
          maxAttempts: resilience.maxAttempts ?? 3,
          baseDelayMs: resilience.baseDelayMs ?? 50,
          maxDelayMs: resilience.maxDelayMs ?? 1_000,
          ...(resilience.random ? { random: resilience.random } : {}),
          ...(resilience.sleep ? { sleep: resilience.sleep } : {}),
          isRetryable: (e) => e instanceof RetryableFetchError,
        },
      );
    } catch (err) {
      // The final attempt's classified outcome is carried on the sentinel.
      if (err instanceof RetryableFetchError) outcome = err.outcome as FetchOutcome<T>;
      else {
        trace?.fail(message(err));
        throw err;
      }
    }
  } else {
    outcome = await attemptDaemonFetch<T>(url, tracedInit, fetchImpl);
  }

  // 3. Record reachability with the breaker (pairs the earlier guard exactly once).
  if (outcome.transportFailure) breaker.recordFailure(key);
  else breaker.recordSuccess(key);

  // BE-7.3b: one span covers the whole call (all retry attempts). `daemonFetch`
  // never throws on a sidecar error — the typed failure carries the reason.
  if (outcome.result.ok) trace?.succeed();
  else trace?.fail(outcome.result.reason);

  return outcome.result;
}
