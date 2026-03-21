'use client';

import { getSessionAccessToken } from '@/lib/auth/session-token';

type SSEEventHandler = (event: MessageEvent) => void;

type TokenizedSSEOptions = {
  url: string;
  params?: Record<string, string | undefined>;
  token?: string | null;
  events?: Record<string, SSEEventHandler>;
  reconnectDelayMs?: number;
  tokenParamName?: string;
};

export type TokenizedSSEConnection = {
  close: () => void;
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
 * Maximum consecutive EventSource failures before switching to fetch-based
 * SSE streaming. Cloudflare HTTP/3 (QUIC) can break native EventSource but
 * regular fetch with ReadableStream works fine.
 */
const FETCH_FALLBACK_AFTER = 3;

export function connectTokenizedSSE(options: TokenizedSSEOptions): TokenizedSSEConnection {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let fetchAbortController: AbortController | null = null;
  let closed = false;
  let consecutiveFailures = 0;
  let useFetchFallback = false;

  const reconnectDelayMs = options.reconnectDelayMs ?? 1500;
  const tokenParamName = options.tokenParamName ?? 'token';

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) {
      return;
    }
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void connect();
    }, reconnectDelayMs);
  };

  const connect = async () => {
    if (closed) return;

    const resolvedToken =
      typeof options.token !== 'undefined' ? options.token : await getSessionAccessToken();
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

    eventSource = new EventSource(fullUrl);

    for (const [eventName, handler] of Object.entries(options.events || {})) {
      eventSource.addEventListener(eventName, handler as EventListener);
    }

    eventSource.onopen = () => {
      consecutiveFailures = 0;
    };

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      consecutiveFailures++;

      if (consecutiveFailures >= FETCH_FALLBACK_AFTER) {
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

            let currentEventName = 'message';
            let currentData = '';

            for (const line of lines) {
              if (line.startsWith('event: ') || line.startsWith('event:')) {
                currentEventName = line.slice(line.indexOf(':') + 1).trim() || 'message';
              } else if (line.startsWith('data: ') || line.startsWith('data:')) {
                currentData += (currentData ? '\n' : '') + line.slice(line.indexOf(':') + 1).trimStart();
              } else if (line.trim() === '' && currentData) {
                // End of SSE event — dispatch to matching handler
                const handler = options.events?.[currentEventName];
                if (handler) {
                  const syntheticEvent = new MessageEvent(currentEventName, {
                    data: currentData,
                  });
                  handler(syntheticEvent);
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
      if (fetchAbortController) {
        try { fetchAbortController.abort(); } catch { /* ignore */ }
        fetchAbortController = null;
      }
    },
  };
}
