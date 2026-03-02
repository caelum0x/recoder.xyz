/**
 * @module docker-backend-api
 *
 * HTTP + SSE client for docker-backend (Express, port 3001).
 *
 * A2A workspace/channel/task endpoints live on docker-backend, NOT the
 * Python FastAPI backend. This client mirrors the pattern used by
 * recoder-web (docker-api.ts) but is adapted for the Next.js frontend.
 *
 * Auth: reads session token via getSessionAccessToken() and sends it
 * as Authorization: Bearer <token>.
 *
 * Response envelope:
 *   { success: true, data: T }
 *   { success: false, error: { code, message } }
 */

import { getSessionAccessToken } from '@/lib/auth/session-token';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DOCKER_BACKEND_URL =
  process.env.NEXT_PUBLIC_DOCKER_BACKEND_URL || 'http://localhost:3001';

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
export function connectDockerSSE(
  path: string,
  events: Record<string, (event: MessageEvent) => void>,
  params?: Record<string, string>,
): DockerSSEConnection {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

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

    eventSource = new EventSource(url.toString());

    for (const [name, handler] of Object.entries(events)) {
      eventSource.addEventListener(name, handler as EventListener);
    }

    eventSource.onerror = () => {
      eventSource?.close();
      eventSource = null;
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, 1500);
  };

  void connect();

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
    },
  };
}
