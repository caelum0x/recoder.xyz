/**
 * @module docker-backend-api
 *
 * HTTP + SSE client for docker-backend (Express, port 3001).
 *
 * A2A workspace/channel/task endpoints live on docker-backend, NOT the
 * Python FastAPI backend. This client follows the earlier docker-api.ts
 * pattern but is adapted for the Next.js frontend.
 *
 * Auth: reads session token via getSessionAccessToken() and sends it
 * as Authorization: Bearer <token>.
 *
 * Response envelope:
 *   { success: true, data: T }
 *   { success: false, error: { code, message } }
 */

import { getSessionAccessToken } from '@/lib/auth/session-token';
import { resolveDockerBackendUrl } from '@/lib/runtime-urls';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOCKER_BACKEND_URL = resolveDockerBackendUrl();

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DockerBackendResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export interface DockerBackendRequestOptions {
  /** Timeout in ms (default 30 000). */
  timeout?: number;
  /** Extra headers. */
  headers?: Record<string, string>;
  /** AbortSignal for cancellation. */
  signal?: AbortSignal;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function resolveHeaders(
  extra?: Record<string, string>,
): Promise<Record<string, string>> {
  const token = await getSessionAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function request<T>(
  method: string,
  endpoint: string,
  body?: unknown,
  opts?: DockerBackendRequestOptions,
): Promise<DockerBackendResponse<T>> {
  const timeout = opts?.timeout ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // Chain external signal
  if (opts?.signal) {
    opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const headers = await resolveHeaders(opts?.headers);
    const url = `${DOCKER_BACKEND_URL}${endpoint}`;

    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timer);

    const json = (await res.json()) as DockerBackendResponse<T>;

    if (!res.ok && !json.error) {
      return {
        success: false,
        error: {
          code: String(res.status),
          message: `HTTP ${res.status}: ${res.statusText}`,
        },
      };
    }

    return json;
  } catch (err: unknown) {
    clearTimeout(timer);

    const isAbort =
      err instanceof Error &&
      (err.name === 'AbortError' || err.message.includes('aborted'));

    return {
      success: false,
      error: {
        code: isAbort ? 'TIMEOUT' : 'NETWORK_ERROR',
        message: isAbort
          ? 'Request timed out'
          : err instanceof Error
            ? err.message
            : String(err),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const dockerBackendApi = {
  get: <T = unknown>(endpoint: string, opts?: DockerBackendRequestOptions) =>
    request<T>('GET', endpoint, undefined, opts),

  post: <T = unknown>(endpoint: string, data?: unknown, opts?: DockerBackendRequestOptions) =>
    request<T>('POST', endpoint, data, opts),

  patch: <T = unknown>(endpoint: string, data?: unknown, opts?: DockerBackendRequestOptions) =>
    request<T>('PATCH', endpoint, data, opts),

  delete: <T = unknown>(endpoint: string, opts?: DockerBackendRequestOptions) =>
    request<T>('DELETE', endpoint, undefined, opts),
};

// ---------------------------------------------------------------------------
// SSE helper
// ---------------------------------------------------------------------------

export type DockerSSEConnection = { close: () => void };

/**
 * Open an SSE connection to a docker-backend endpoint.
 *
 * Token is sent as a query-string parameter so EventSource (which cannot
 * send custom headers) can authenticate.
 */
/**
 * Maximum consecutive EventSource failures before switching to fetch-based
 * SSE streaming. Cloudflare HTTP/3 (QUIC) can break native EventSource but
 * regular fetch with ReadableStream works fine.
 */
const SSE_FETCH_FALLBACK_AFTER = 3;

export function connectDockerSSE(
  path: string,
  events: Record<string, (event: MessageEvent) => void>,
  params?: Record<string, string>,
): DockerSSEConnection {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let fetchAbortController: AbortController | null = null;
  let closed = false;
  let consecutiveFailures = 0;
  let useFetchFallback = false;

  const connect = async () => {
    if (closed) return;

    const token = await getSessionAccessToken();
    if (!token) {
      scheduleReconnect();
      return;
    }

    const url = new URL(`${DOCKER_BACKEND_URL}${path}`);
    url.searchParams.set('token', token);
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v) url.searchParams.set(k, v);
    }

    const fullUrl = url.toString();

    if (useFetchFallback) {
      connectViaFetch(fullUrl);
      return;
    }

    try {
      eventSource = new EventSource(fullUrl);
    } catch (err) {
      // EventSource constructor can throw on invalid URLs or when blocked
      // by CORS/CSP. Treat as a failure and try reconnecting.
      console.warn('[connectDockerSSE] EventSource constructor threw for %s:', path, err);
      consecutiveFailures++;
      if (consecutiveFailures >= SSE_FETCH_FALLBACK_AFTER) {
        useFetchFallback = true;
      }
      scheduleReconnect();
      return;
    }

    for (const [name, handler] of Object.entries(events)) {
      eventSource.addEventListener(name, handler as EventListener);
    }

    eventSource.onopen = () => {
      consecutiveFailures = 0;
    };

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      consecutiveFailures++;

      if (consecutiveFailures >= SSE_FETCH_FALLBACK_AFTER) {
        console.warn(
          '[connectDockerSSE] EventSource failed %d times, switching to fetch SSE fallback for %s',
          consecutiveFailures,
          path
        );
        useFetchFallback = true;
      }

      scheduleReconnect();
    };
  };

  /**
   * Fetch-based SSE fallback: uses ReadableStream to parse SSE frames.
   * Works around Cloudflare HTTP/3 QUIC issues that break EventSource.
   */
  const connectViaFetch = async (url: string) => {
    if (closed) return;

    // Abort any previous fetch connection before starting a new one.
    if (fetchAbortController) {
      try { fetchAbortController.abort(); } catch { /* ignore */ }
      fetchAbortController = null;
    }

    try {
      fetchAbortController = new AbortController();
      const response = await fetch(url, {
        headers: { 'Accept': 'text/event-stream' },
        signal: fetchAbortController.signal,
        credentials: 'include',
      });

      if (!response.ok || !response.body) {
        scheduleReconnect();
        return;
      }

      consecutiveFailures = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Persist event name and data across read() calls so that SSE events
      // split across TCP chunks are reassembled correctly.
      let currentEventName = 'message';
      let currentData = '';

      const readLoop = async () => {
        try {
          while (!closed) {
            const { done, value } = await reader.read();
            if (done) {
              if (!closed) scheduleReconnect();
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('event: ') || line.startsWith('event:')) {
                currentEventName = line.slice(line.indexOf(':') + 1).trim() || 'message';
              } else if (line.startsWith('data: ') || line.startsWith('data:')) {
                currentData += (currentData ? '\n' : '') + line.slice(line.indexOf(':') + 1).trimStart();
              } else if (line.trim() === '' && currentData) {
                const handler = events[currentEventName];
                if (handler) {
                  handler(new MessageEvent(currentEventName, { data: currentData }));
                }
                currentEventName = 'message';
                currentData = '';
              }
            }
          }
        } catch (err) {
          if (closed) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          scheduleReconnect();
        }
      };

      readLoop();
    } catch {
      if (!closed) scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch((err) => {
        if (!closed) {
          console.warn('[connectDockerSSE] Reconnect error for %s:', path, err);
        }
      });
    }, 1500);
  };

  // Kick off connection; catch any unexpected rejection so it never
  // surfaces as an unhandled promise rejection that could crash React.
  connect().catch((err) => {
    if (!closed) {
      console.warn('[connectDockerSSE] Unhandled connection error for %s:', path, err);
      scheduleReconnect();
    }
  });

  return {
    close: () => {
      closed = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      if (fetchAbortController) {
        try { fetchAbortController.abort(); } catch { /* ignore */ }
        fetchAbortController = null;
      }
    },
  };
}
