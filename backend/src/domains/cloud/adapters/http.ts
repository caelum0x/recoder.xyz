/**
 * A minimal HTTP transport seam for the cloud adapters.
 *
 * The daytona / e2b / ziti / xds adapters make REAL REST calls when a key +
 * endpoint are configured, but they must stay (a) degrade-safe (no throw on a
 * network fault — a failed fetch resolves to a truthful error), (b) testable
 * (inject a fake transport), and (c) free of a hard coupling to a package
 * transport type that could break `tsc`. So they depend on THIS narrow shape,
 * not on `@recoder/*` SDK types or the DOM `fetch` lib.
 *
 * The later hardening step swaps the default `globalFetch` for the
 * `@recoder/sandbox-daytona` / `@recoder/daytona-api-client` SDK IN PLACE — the
 * adapter boundary is designed for it (see the build report "wiring needed").
 */

/** The narrow response shape the adapters read (subset of the Fetch `Response`). */
export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/** The narrow request init the adapters send (subset of `RequestInit`). */
export interface HttpRequestInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly signal?: unknown;
}

/** The injectable transport. Defaults to the Node ≥18 global `fetch`. */
export type FetchLike = (url: string, init?: HttpRequestInit) => Promise<HttpResponse>;

/** The Node ≥18 global fetch, coerced to {@link FetchLike}; `null` when absent. */
export function globalFetch(): FetchLike | null {
  const f = (globalThis as { fetch?: unknown }).fetch;
  return typeof f === 'function' ? (f as FetchLike) : null;
}

/** The outcome of a guarded probe: never throws, always truthful. */
export interface ProbeResult {
  readonly ok: boolean;
  /** HTTP status observed (`null` on connect failure / no transport). */
  readonly status: number | null;
  readonly reason?: string;
}

/**
 * Perform a guarded HTTP request with a hard timeout. NEVER throws: a connect
 * failure, timeout, or missing transport resolves to `{ ok:false, status:null }`
 * with a machine reason. This is the truthful-probe primitive every adapter and
 * the preview health check builds on (a bare 200 is never inferred — the caller
 * reads the real `status`).
 */
export async function probe(
  fetchLike: FetchLike | null,
  url: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<ProbeResult & { response?: HttpResponse }> {
  if (!fetchLike) return { ok: false, status: null, reason: 'no HTTP transport available' };
  const timeoutMs = opts.timeoutMs ?? 5000;
  const AbortCtor = (globalThis as { AbortController?: new () => { signal: unknown; abort(): void } })
    .AbortController;
  const controller = AbortCtor ? new AbortCtor() : null;
  const timer = controller
    ? setTimeout(() => {
        try {
          controller.abort();
        } catch {
          /* ignore */
        }
      }, timeoutMs)
    : null;
  try {
    const response = await fetchLike(url, {
      method: opts.method ?? 'GET',
      ...(opts.headers ? { headers: opts.headers } : {}),
      ...(opts.body !== undefined ? { body: opts.body } : {}),
      ...(controller ? { signal: controller.signal } : {}),
    });
    return { ok: response.ok, status: response.status, response };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : 'request failed';
    return { ok: false, status: null, reason };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
