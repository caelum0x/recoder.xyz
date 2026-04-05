'use client';

import { getSessionAccessToken } from '@/lib/auth/session-token';

type SSEEventHandler = (event: MessageEvent) => void;

/**
 * Connection state for SSE connections.
 * - idle: not yet started
 * - connecting: attempting to establish connection
 * - connected: connection is open and receiving data
 * - reconnecting: connection lost, attempting to reconnect
 * - disconnected: intentionally closed
 * - error: failed after max retries (will still auto-recover)
 */
export type SSEConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';

type TokenizedSSEOptions = {
  url: string;
  params?: Record<string, string | undefined>;
  token?: string | null;
  events?: Record<string, SSEEventHandler>;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  circuitBreakerCooldownMs?: number;
  tokenParamName?: string;
  onStateChange?: (state: SSEConnectionState) => void;
};

export type TokenizedSSEConnection = {
  close: () => void;
  getState: () => SSEConnectionState;
};

export function buildTokenizedSSEUrl(
  baseUrl: string,
  token?: string | null,
  params?: Record<string, string | undefined>,
  tokenParamName = 'token'
): string {
  const url = new URL(baseUrl);
  if (token) {
    url.searchParams.set(tokenParamName, token);
  }
  for (const [key, value] of Object.entries(params || {})) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

/**
 * Use fetch-based SSE from the start. Cloudflare HTTP/2 idle timeout (~100s)
 * kills native EventSource streams with ERR_HTTP2_PROTOCOL_ERROR. The fetch()
 * + ReadableStream approach is more reliable through HTTP/2 proxies.
 */
const FETCH_FALLBACK_AFTER = 0;

/** Backoff configuration */
const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30000;
const BACKOFF_MULTIPLIER = 2;
/** Maximum reconnect attempts before giving up */
const MAX_RECONNECT_ATTEMPTS = 15;
/** Cooldown after repeated failures for the same endpoint */
const CIRCUIT_BREAKER_COOLDOWN_MS = 60000;
/** Shared endpoint cooldowns to avoid retry storms across mounts */
const endpointCooldowns = new Map<string, number>();

/**
 * Calculate exponential backoff with jitter.
 * Returns a delay in ms: min(base * multiplier^attempt, max) + random jitter.
 */
function calculateBackoff(attempt: number, baseMs: number, maxMs: number): number {
  const exponentialDelay = Math.min(baseMs * Math.pow(BACKOFF_MULTIPLIER, attempt), maxMs);
  // Add jitter: +-25% of the delay to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, exponentialDelay + jitter);
}

/**
 * Check if an error is a known network/protocol error that should be
 * silently retried rather than logged as a real failure.
 */
function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message?.toLowerCase() || '';
  const name = err.name?.toLowerCase() || '';
  return (
    msg.includes('err_http2_protocol_error') ||
    msg.includes('err_quic_protocol_error') ||
    msg.includes('err_network_changed') ||
    msg.includes('err_internet_disconnected') ||
    msg.includes('err_connection_refused') ||
    msg.includes('err_connection_reset') ||
    msg.includes('net::err_') ||
    msg.includes('failed to fetch') ||
    msg.includes('network error') ||
    msg.includes('load failed') ||
    (name === 'typeerror' && msg.includes('fetch')) ||
    name === 'aborterror'
  );
}

export function connectTokenizedSSE(options: TokenizedSSEOptions): TokenizedSSEConnection {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let fetchAbortController: AbortController | null = null;
  let closed = false;
  let consecutiveFailures = 0;
  let reconnectAttempt = 0;
  let useFetchFallback = true;
  let connectionState: SSEConnectionState = 'idle';

  const baseDelayMs = options.reconnectDelayMs ?? BACKOFF_BASE_MS;
  const maxDelayMs = options.maxReconnectDelayMs ?? BACKOFF_MAX_MS;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? MAX_RECONNECT_ATTEMPTS;
  const circuitBreakerCooldownMs =
    options.circuitBreakerCooldownMs ?? CIRCUIT_BREAKER_COOLDOWN_MS;
  const tokenParamName = options.tokenParamName ?? 'token';
  const endpointKey = options.url;

  const setState = (newState: SSEConnectionState) => {
    if (connectionState !== newState) {
      connectionState = newState;
      try {
        options.onStateChange?.(newState);
      } catch {
        // Never let state change callbacks crash us
      }
    }
  };

  const getCircuitCooldownRemaining = () => {
    const cooldownUntil = endpointCooldowns.get(endpointKey) ?? 0;
    const remainingMs = cooldownUntil - Date.now();
    return remainingMs > 0 ? remainingMs : 0;
  };

  const clearCircuitCooldown = () => {
    endpointCooldowns.delete(endpointKey);
  };

  const armCircuitCooldown = () => {
    endpointCooldowns.set(endpointKey, Date.now() + circuitBreakerCooldownMs);
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) {
      return;
    }

    const circuitCooldownRemaining = getCircuitCooldownRemaining();
    if (circuitCooldownRemaining > 0) {
      setState('error');
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect().catch((err) => {
          if (!closed) {
            if (!isTransientNetworkError(err)) {
              console.warn('[connectTokenizedSSE] Cooldown reconnect error:', err);
            }
            scheduleReconnect();
          }
        });
      }, circuitCooldownRemaining);
      return;
    }

    // Stop reconnecting after max attempts to prevent infinite loops
    if (reconnectAttempt >= maxReconnectAttempts) {
      if (reconnectAttempt === maxReconnectAttempts) {
        console.warn(
          `[connectTokenizedSSE] Max reconnect attempts (${maxReconnectAttempts}) reached, entering cooldown.`
        );
      }
      armCircuitCooldown();
      reconnectAttempt = 0;
      consecutiveFailures = 0;
      setState('error');
      scheduleReconnect();
      return;
    }

    setState('reconnecting');
    const delay = calculateBackoff(reconnectAttempt, baseDelayMs, maxDelayMs);
    reconnectAttempt++;

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect().catch((err) => {
        if (!closed) {
          // Only log on first reconnect attempt to avoid console spam
          if (!isTransientNetworkError(err) && reconnectAttempt <= 1) {
            console.warn('[connectTokenizedSSE] Reconnect error:', err);
          }
          scheduleReconnect();
        }
      });
    }, delay);
  };

  const connect = async () => {
    if (closed) return;

    const circuitCooldownRemaining = getCircuitCooldownRemaining();
    if (circuitCooldownRemaining > 0) {
      setState('error');
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          connect().catch((err) => {
            if (!closed) {
              if (!isTransientNetworkError(err)) {
                console.warn('[connectTokenizedSSE] Deferred reconnect error:', err);
              }
              scheduleReconnect();
            }
          });
        }, circuitCooldownRemaining);
      }
      return;
    }

    setState('connecting');

    let resolvedToken: string | null | undefined;
    try {
      resolvedToken =
        typeof options.token !== 'undefined' ? options.token : await getSessionAccessToken();
    } catch (err) {
      // Token resolution can fail (e.g. auth expired) — retry silently
      if (!isTransientNetworkError(err)) {
        console.warn('[connectTokenizedSSE] Token resolution failed:', err);
      }
      scheduleReconnect();
      return;
    }

    if (!resolvedToken || closed) {
      scheduleReconnect();
      return;
    }

    const fullUrl = buildTokenizedSSEUrl(
      options.url,
      resolvedToken,
      options.params,
      tokenParamName
    );

    if (useFetchFallback) {
      connectViaFetch(fullUrl);
      return;
    }

    try {
      eventSource = new EventSource(fullUrl, { withCredentials: true });
    } catch (err) {
      // EventSource constructor can throw on invalid URLs or when blocked
      // by CORS/CSP. Treat as a failure and try reconnecting.
      if (!isTransientNetworkError(err)) {
        console.warn('[connectTokenizedSSE] EventSource constructor threw:', err);
      }
      consecutiveFailures++;
      if (consecutiveFailures >= FETCH_FALLBACK_AFTER) {
        useFetchFallback = true;
      }
      scheduleReconnect();
      return;
    }

    for (const [eventName, handler] of Object.entries(options.events || {})) {
      eventSource.addEventListener(eventName, (evt) => {
        try {
          handler(evt as MessageEvent);
        } catch (handlerErr) {
          // Never let event handler errors propagate to EventSource
          // which could crash the React tree
          console.warn('[connectTokenizedSSE] Event handler error suppressed:', handlerErr);
        }
      });
    }

    eventSource.onopen = () => {
      consecutiveFailures = 0;
      reconnectAttempt = 0;
      clearCircuitCooldown();
      setState('connected');
    };

    eventSource.onerror = () => {
      // EventSource fires onerror for many reasons (network drop, HTTP errors,
      // CORS issues, HTTP/2 protocol errors). We NEVER throw from here —
      // just clean up and schedule a retry.
      try {
        if (eventSource) {
          eventSource.close();
          eventSource = null;
        }
      } catch {
        // Ignore errors during cleanup
        eventSource = null;
      }

      consecutiveFailures++;

      if (consecutiveFailures >= FETCH_FALLBACK_AFTER && !useFetchFallback) {
        console.warn(
          '[connectTokenizedSSE] EventSource failed %d times, switching to fetch SSE fallback',
          consecutiveFailures
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
    // Without this, a reconnect would leave the old ReadableStream reader
    // running, causing duplicate event dispatches.
    if (fetchAbortController) {
      try { fetchAbortController.abort(); } catch { /* ignore */ }
      fetchAbortController = null;
    }

    try {
      fetchAbortController = new AbortController();

      // Add a timeout so we don't hang forever on stalled connections
      const timeoutId = setTimeout(() => {
        try { fetchAbortController?.abort(); } catch { /* ignore */ }
      }, 30000); // 30s connection timeout

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'Accept': 'text/event-stream' },
          signal: fetchAbortController.signal,
          credentials: 'include',
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok || !response.body) {
        // Stop reconnecting on 4xx client errors (404 not found, 401 unauthorized, etc.)
        // These errors indicate the endpoint or resource doesn't exist and retrying won't help.
        if (response.status >= 400 && response.status < 500) {
          if (consecutiveFailures === 0) {
            console.warn(
              `[connectTokenizedSSE] SSE endpoint returned ${response.status}, stopping reconnect.`
            );
          }
          setState('error');
          return;
        }
        // For 5xx or other errors, retry with backoff
        scheduleReconnect();
        return;
      }

      consecutiveFailures = 0;
      reconnectAttempt = 0;
      clearCircuitCooldown();
      setState('connected');

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
                // End of SSE event — dispatch to matching handler
                const handler = options.events?.[currentEventName];
                if (handler) {
                  try {
                    const syntheticEvent = new MessageEvent(currentEventName, {
                      data: currentData,
                    });
                    handler(syntheticEvent);
                  } catch (handlerErr) {
                    // Never let handler errors crash the read loop
                    console.warn('[connectTokenizedSSE] Fetch handler error suppressed:', handlerErr);
                  }
                }
                currentEventName = 'message';
                currentData = '';
              }
            }
          }
        } catch (err) {
          if (closed) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          if (!isTransientNetworkError(err)) {
            console.warn('[connectTokenizedSSE] Fetch read loop error:', err);
          }
          scheduleReconnect();
        }
      };

      readLoop();
    } catch (err) {
      if (!closed) {
        if (err instanceof Error && err.name === 'AbortError') return;
        if (!isTransientNetworkError(err)) {
          console.warn('[connectTokenizedSSE] Fetch connection error:', err);
        }
        scheduleReconnect();
      }
    }
  };

  // Kick off connection; catch any unexpected rejection so it never
  // surfaces as an unhandled promise rejection that could crash React.
  connect().catch((err) => {
    if (!closed) {
      if (!isTransientNetworkError(err)) {
        console.warn('[connectTokenizedSSE] Unhandled connection error:', err);
      }
      scheduleReconnect();
    }
  });

  return {
    close: () => {
      closed = true;
      setState('disconnected');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (eventSource) {
        try {
          eventSource.close();
        } catch {
          // Ignore errors during close
        }
        eventSource = null;
      }
      if (fetchAbortController) {
        try { fetchAbortController.abort(); } catch { /* ignore */ }
        fetchAbortController = null;
      }
    },
    getState: () => connectionState,
  };
}
