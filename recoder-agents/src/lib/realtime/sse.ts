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

export function connectTokenizedSSE(options: TokenizedSSEOptions): TokenizedSSEConnection {
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

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
    eventSource = new EventSource(fullUrl);

    for (const [eventName, handler] of Object.entries(options.events || {})) {
      eventSource.addEventListener(eventName, handler as EventListener);
    }

    eventSource.onerror = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
      scheduleReconnect();
    };
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
