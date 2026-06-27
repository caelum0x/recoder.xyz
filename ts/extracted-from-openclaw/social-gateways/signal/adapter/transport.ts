// Owned by Recoder. Self-contained signal-cli JSON-RPC transport for the
// ConnectorPort adapter. This is the REAL signal-cli HTTP daemon wire contract
// extracted verbatim from social-gateways/signal/client.ts (JSON-RPC at
// `/api/v1/rpc`, health at `/api/v1/check`, SSE at `/api/v1/events`). It is
// reproduced here — rather than imported — because the original client.ts pulls
// `../infra/fetch.js`, an un-extracted monorepo module not present in this
// package (see foundationGaps in the adapter handoff). The protocol logic is
// unchanged; only the fetch resolution is made local and dependency-free.

import { randomUUID } from "node:crypto";

const DEFAULT_TIMEOUT_MS = 10_000;

/** Resolve a real `fetch` implementation (Node 18+ global, or globalThis). */
function resolveFetch(): typeof fetch {
  const candidate = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof candidate !== "function") {
    throw new Error("fetch is not available in this runtime (Node >= 18 required)");
  }
  return candidate;
}

export interface SignalRpcOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

export interface SignalRpcError {
  readonly code?: number;
  readonly message?: string;
  readonly data?: unknown;
}

export interface SignalRpcResponse<T> {
  readonly jsonrpc?: string;
  readonly result?: T;
  readonly error?: SignalRpcError;
  readonly id?: string | number | null;
}

export interface SignalSseEvent {
  readonly event?: string;
  readonly data?: string;
  readonly id?: string;
}

export interface SignalCheckResult {
  readonly ok: boolean;
  readonly status?: number | null;
  readonly error?: string | null;
}

/** Normalize a daemon base URL to an origin without a trailing slash. */
export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("Signal base URL is required");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}`.replace(/\/+$/, "");
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const fetchImpl = resolveFetch();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Issue a signal-cli JSON-RPC 2.0 request and return its `result`. */
export async function signalRpcRequest<T = unknown>(
  method: string,
  params: Record<string, unknown> | undefined,
  opts: SignalRpcOptions,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const id = randomUUID();
  const body = JSON.stringify({ jsonrpc: "2.0", method, params, id });
  const res = await fetchWithTimeout(
    `${baseUrl}/api/v1/rpc`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  if (res.status === 201) {
    return undefined as T;
  }
  const text = await res.text();
  if (!text) {
    throw new Error(`Signal RPC empty response (status ${res.status})`);
  }
  const parsed = JSON.parse(text) as SignalRpcResponse<T>;
  if (parsed.error) {
    const code = parsed.error.code ?? "unknown";
    const msg = parsed.error.message ?? "Signal RPC error";
    throw new Error(`Signal RPC ${code}: ${msg}`);
  }
  return parsed.result as T;
}

/** Probe the daemon's `/api/v1/check` health endpoint. */
export async function signalCheck(
  baseUrl: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<SignalCheckResult> {
  const normalized = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetchWithTimeout(`${normalized}/api/v1/check`, { method: "GET" }, timeoutMs);
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, status: res.status, error: null };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Stream Server-Sent Events from the daemon's `/api/v1/events` endpoint,
 * invoking `onEvent` for each fully-parsed SSE frame. Resolves when the stream
 * ends or the abort signal fires. Real SSE framing extracted from client.ts.
 */
export async function streamSignalEvents(params: {
  baseUrl: string;
  account?: string;
  abortSignal?: AbortSignal;
  onEvent: (event: SignalSseEvent) => void;
}): Promise<void> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const url = new URL(`${baseUrl}/api/v1/events`);
  if (params.account) {
    url.searchParams.set("account", params.account);
  }

  const fetchImpl = resolveFetch();
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "text/event-stream" },
    signal: params.abortSignal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`Signal SSE failed (${res.status} ${res.statusText || "error"})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent: { event?: string; data?: string; id?: string } = {};

  const flushEvent = () => {
    if (!currentEvent.data && !currentEvent.event && !currentEvent.id) {
      return;
    }
    params.onEvent({
      event: currentEvent.event,
      data: currentEvent.data,
      id: currentEvent.id,
    });
    currentEvent = {};
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    let lineEnd = buffer.indexOf("\n");
    while (lineEnd !== -1) {
      let line = buffer.slice(0, lineEnd);
      buffer = buffer.slice(lineEnd + 1);
      if (line.endsWith("\r")) {
        line = line.slice(0, -1);
      }

      if (line === "") {
        flushEvent();
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      if (line.startsWith(":")) {
        lineEnd = buffer.indexOf("\n");
        continue;
      }
      const [rawField, ...rest] = line.split(":");
      const field = rawField.trim();
      const rawValue = rest.join(":");
      const fieldValue = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
      if (field === "event") {
        currentEvent.event = fieldValue;
      } else if (field === "data") {
        currentEvent.data = currentEvent.data ? `${currentEvent.data}\n${fieldValue}` : fieldValue;
      } else if (field === "id") {
        currentEvent.id = fieldValue;
      }
      lineEnd = buffer.indexOf("\n");
    }
  }

  flushEvent();
}
