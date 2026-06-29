import { DistributionError } from '../../../errors/index';
import type {
  HttpRequest,
  HttpResponse,
  HttpTransportPort,
} from '../../../ports/http-transport-port';

/**
 * A `globalThis.fetch`-backed {@link HttpTransportPort}. This is the adapter a
 * real client (the desktop / CLI) passes to the device-flow functions so it does
 * NOT have to hand-roll one. It speaks the narrow seam the device-flow client
 * needs: POST a form-urlencoded body to recoder.xyz, read back parsed JSON.
 *
 * Fail safe + truthful:
 *  - A transport-level failure (DNS, TLS, offline) becomes a typed
 *    `DistributionError('provider_unavailable', …)` — never a fabricated 200.
 *  - A non-JSON / empty body yields `{ status, body: null }`; the device-flow
 *    client already treats an unparseable 2xx as a denial rather than a success,
 *    so a corrupt response can never complete a sign-in.
 */

/** The minimal structural subset of WHATWG `fetch` this adapter requires. */
export type FetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  readonly status: number;
  text(): Promise<string>;
}>;

export interface FetchTransportOptions {
  /**
   * The fetch implementation. Defaults to `globalThis.fetch` when available.
   * Injectable so a host without a global fetch (older Node) can pass one in.
   */
  readonly fetchImpl?: FetchLike;
  /**
   * Per-request timeout in milliseconds. When set, the request is aborted and a
   * `provider_unavailable` error is raised — the loop fails safe rather than
   * hanging. Omit for no client-side timeout.
   */
  readonly timeoutMs?: number;
}

function resolveFetch(opts: FetchTransportOptions): FetchLike {
  if (opts.fetchImpl) return opts.fetchImpl;
  const globalFetch = (globalThis as { fetch?: unknown }).fetch;
  if (typeof globalFetch === 'function') {
    return globalFetch as unknown as FetchLike;
  }
  throw new DistributionError(
    'provider_unavailable',
    'no fetch implementation available (pass fetchImpl to createFetchTransport)',
  );
}

function safeJson(raw: string): unknown {
  if (raw.length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Build a {@link HttpTransportPort} over `fetch`. Pass the result straight into
 * `requestDeviceAuthorization` / `pollDeviceTokenOnce` / `runDeviceFlow` /
 * `signInWithDeviceFlow`.
 */
export function createFetchTransport(
  options: FetchTransportOptions = {},
): HttpTransportPort {
  const fetchImpl = resolveFetch(options);
  return {
    async post(request: HttpRequest): Promise<HttpResponse> {
      const controller =
        options.timeoutMs !== undefined ? new AbortController() : undefined;
      const timer =
        controller && options.timeoutMs !== undefined
          ? setTimeout(() => controller.abort(), options.timeoutMs)
          : undefined;
      try {
        const res = await fetchImpl(request.url, {
          method: request.method,
          headers: { ...request.headers },
          body: request.body,
          ...(controller ? { signal: controller.signal } : {}),
        });
        const text = await res.text();
        return { status: res.status, body: safeJson(text) };
      } catch (e) {
        throw new DistributionError(
          'provider_unavailable',
          `device-flow request to '${request.url}' failed at the transport`,
          { cause: e instanceof Error ? e.message : String(e) },
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  };
}
