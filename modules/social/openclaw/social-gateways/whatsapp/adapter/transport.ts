// Owned by Recoder. Self-contained HTTP + SSE transport for the WhatsApp Web
// bridge daemon (Baileys behind a local HTTP API), reproduced here rather than
// imported because the original WhatsApp gateway code (`web/outbound.js`,
// `web/login-qr.js`, `web/accounts.js`, `channel-web.js`) pulls a large set of
// un-extracted monorepo modules (`../config`, `../infra`, `../routing`, ...)
// not present in this package (see foundationGaps). The bridge wire contract
// itself is unchanged — it is the same daemon-over-HTTP model the Signal adapter
// uses for signal-cli:
//   POST   /api/v1/send         deliver a message      -> { id, timestamp }
//   POST   /api/v1/react        apply an emoji ack      -> 200
//   GET    /api/v1/status       link/connection health  -> { linked, connected }
//   GET    /api/v1/events       SSE stream of messages   (event: "message")
// Auth (when configured) is a bearer token on the `Authorization` header.

const DEFAULT_TIMEOUT_MS = 15_000;

/** Resolve a real `fetch` implementation (Node 18+ global, or globalThis). */
function resolveFetch(): typeof fetch {
  const candidate = (globalThis as { fetch?: typeof fetch }).fetch;
  if (typeof candidate !== "function") {
    throw new Error("fetch is not available in this runtime (Node >= 18 required)");
  }
  return candidate;
}

export interface WhatsAppHttpOptions {
  readonly baseUrl: string;
  readonly token?: string;
  readonly timeoutMs?: number;
}

export interface WhatsAppSseEvent {
  readonly event?: string;
  readonly data?: string;
  readonly id?: string;
}

export interface WhatsAppCheckResult {
  readonly ok: boolean;
  readonly status?: number | null;
  readonly error?: string | null;
  /** Whether a WhatsApp Web session is linked (creds present). */
  readonly linked?: boolean;
  /** Whether the linked session is currently connected to WhatsApp. */
  readonly connected?: boolean;
  /** Bridge-reported identity (the linked account's phone / pushname). */
  readonly identity?: string;
}

/** Normalize a daemon base URL to an origin without a trailing slash. */
export function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error("WhatsApp base URL is required");
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/\/+$/, "");
  }
  return `http://${trimmed}`.replace(/\/+$/, "");
}

function authHeaders(token?: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
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

/** Issue a POST against a WhatsApp Web bridge endpoint and return its body. */
export async function whatsappPost<T = unknown>(
  path: string,
  params: Record<string, unknown>,
  opts: WhatsAppHttpOptions,
): Promise<T> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  const res = await fetchWithTimeout(
    `${baseUrl}${path}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders(opts.token),
      },
      body: JSON.stringify(params),
    },
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  );
  const text = await res.text();
  if (!res.ok) {
    const detail = text ? `: ${text}` : "";
    throw new Error(`WhatsApp bridge ${path} failed (HTTP ${res.status})${detail}`);
  }
  if (!text) {
    return undefined as T;
  }
  return JSON.parse(text) as T;
}

interface WhatsAppStatusBody {
  readonly linked?: unknown;
  readonly connected?: unknown;
  readonly identity?: unknown;
  readonly me?: unknown;
  readonly pushname?: unknown;
}

function readStatusIdentity(body: WhatsAppStatusBody): string | undefined {
  for (const candidate of [body.identity, body.me, body.pushname]) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

/** Probe the bridge's `/api/v1/status` link/health endpoint. */
export async function whatsappCheck(
  opts: WhatsAppHttpOptions,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<WhatsAppCheckResult> {
  const baseUrl = normalizeBaseUrl(opts.baseUrl);
  try {
    const res = await fetchWithTimeout(
      `${baseUrl}/api/v1/status`,
      { method: "GET", headers: authHeaders(opts.token) },
      timeoutMs,
    );
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    const body = (text ? JSON.parse(text) : {}) as WhatsAppStatusBody;
    return {
      ok: true,
      status: res.status,
      error: null,
      linked: body.linked === true,
      connected: body.connected === true,
      identity: readStatusIdentity(body),
    };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Stream Server-Sent Events from the bridge's `/api/v1/events` endpoint,
 * invoking `onEvent` for each fully-parsed SSE frame. Resolves when the stream
 * ends or the abort signal fires. The SSE framing parser is identical to the
 * Signal adapter's (the daemon model is the same); only the endpoint differs.
 */
export async function streamWhatsAppEvents(params: {
  baseUrl: string;
  token?: string;
  abortSignal?: AbortSignal;
  onEvent: (event: WhatsAppSseEvent) => void;
}): Promise<void> {
  const baseUrl = normalizeBaseUrl(params.baseUrl);
  const url = new URL(`${baseUrl}/api/v1/events`);

  const fetchImpl = resolveFetch();
  const res = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "text/event-stream", ...authHeaders(params.token) },
    signal: params.abortSignal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`WhatsApp SSE failed (${res.status} ${res.statusText || "error"})`);
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
