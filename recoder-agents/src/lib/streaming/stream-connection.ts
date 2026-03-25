import type { ConnectionState } from './types';
import { STREAM_CONFIG } from './constants';
import { calculateExponentialBackoff } from './utils';
import { buildTokenizedSSEUrl } from '@/lib/realtime/sse';

export interface StreamConnectionOptions {
  apiUrl: string;
  runId: string;
  getAuthToken: () => Promise<string | null>;
  onMessage: (data: string) => void;
  onOpen?: () => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
  onStateChange?: (state: ConnectionState) => void;
}

type EventHandler = (...args: unknown[]) => void;

/**
 * Use fetch-based SSE from the start. Cloudflare HTTP/2 idle timeout (~100s)
 * kills native EventSource streams with ERR_HTTP2_PROTOCOL_ERROR. The fetch()
 * + ReadableStream approach is more reliable through HTTP/2 proxies.
 */
const FETCH_FALLBACK_THRESHOLD = 0;

/**
 * Timeout for fetch connections — if we don't get a response in this time,
 * abort and retry.
 */
const FETCH_CONNECT_TIMEOUT_MS = 30000;

/**
 * Extended max reconnect attempts — SSE failures should never crash the page.
 * We retry aggressively in the background.
 */
const EXTENDED_MAX_RECONNECT_ATTEMPTS = 15;

/**
 * Check if an error is a known transient network/protocol error that should
 * be silently retried without noisy logging.
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message?.toLowerCase() || '';
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
    err.name === 'AbortError' ||
    (err.name === 'TypeError' && msg.includes('fetch'))
  );
}

export class StreamConnection {
  private eventSource: EventSource | null = null;
  private state: ConnectionState = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  private lastMessageTime = 0;
  private lastEventId: string | null = null;
  private isDestroyed = false;
  private options: StreamConnectionOptions;
  private eventHandlers: Map<string, EventHandler> = new Map();

  // Fetch-based SSE — used by default to avoid Cloudflare HTTP/2 ERR_HTTP2_PROTOCOL_ERROR
  private useFetchFallback = true;
  private fetchAbortController: AbortController | null = null;
  private fetchReconnectAttempts = 0;
  private consecutiveEventSourceFailures = 0;

  constructor(options: StreamConnectionOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    if (this.isDestroyed) {
      return;
    }

    this.cleanup();
    this.setState('connecting');

    if (this.useFetchFallback) {
      await this.connectViaFetch();
      return;
    }

    try {
      let token: string | null;
      try {
        token = await this.options.getAuthToken();
      } catch (err) {
        // Auth token resolution failure — don't crash, just retry
        if (!isTransientError(err)) {
          console.warn('[StreamConnection] Auth token resolution failed:', err);
        }
        this.scheduleReconnect();
        return;
      }

      const streamBaseUrl = `${this.options.apiUrl}/agent-run/${this.options.runId}/stream`;
      const url = buildTokenizedSSEUrl(streamBaseUrl, token, {
        last_id: this.lastEventId && this.lastEventId !== '0' ? this.lastEventId : undefined,
      });

      try {
        this.eventSource = new EventSource(url, { withCredentials: true });
      } catch (esError) {
        // EventSource constructor can throw on CORS/CSP blocks or invalid URLs.
        // Count as a connection failure and potentially switch to fetch fallback.
        if (!isTransientError(esError)) {
          console.warn('[StreamConnection] EventSource constructor threw:', esError);
        }
        this.consecutiveEventSourceFailures++;
        if (this.consecutiveEventSourceFailures >= FETCH_FALLBACK_THRESHOLD && !this.useFetchFallback) {
          this.useFetchFallback = true;
          this.reconnectAttempts = 0;
          await this.connectViaFetch();
          return;
        }
        this.scheduleReconnect();
        return;
      }
      this.setupEventHandlers();
    } catch (error) {
      // Catch-all: NEVER let connection errors propagate to React
      if (!isTransientError(error)) {
        console.warn('[StreamConnection] Unexpected connect error:', error);
      }
      this.handleError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fallback: use fetch() + ReadableStream to consume SSE data.
   * This works around Cloudflare HTTP/3 QUIC issues that break EventSource
   * but not regular fetch streaming.
   */
  private async connectViaFetch(): Promise<void> {
    if (this.isDestroyed) return;

    // Abort any previous fetch connection before starting a new one.
    // Without this, a heartbeat-triggered reconnect would leave the old
    // ReadableStream reader running, causing duplicate callbacks.
    if (this.fetchAbortController) {
      try { this.fetchAbortController.abort(); } catch { /* ignore */ }
      this.fetchAbortController = null;
    }

    try {
      let token: string | null;
      try {
        token = await this.options.getAuthToken();
      } catch (err) {
        if (!isTransientError(err)) {
          console.warn('[StreamConnection] Fetch auth token resolution failed:', err);
        }
        this.handleFetchConnectionError();
        return;
      }

      const streamBaseUrl = `${this.options.apiUrl}/agent-run/${this.options.runId}/stream`;
      const url = buildTokenizedSSEUrl(streamBaseUrl, token, {
        last_id: this.lastEventId && this.lastEventId !== '0' ? this.lastEventId : undefined,
      });

      this.fetchAbortController = new AbortController();

      // Add a connection timeout so we don't hang forever on stalled connections
      const timeoutId = setTimeout(() => {
        try { this.fetchAbortController?.abort(); } catch { /* ignore */ }
      }, FETCH_CONNECT_TIMEOUT_MS);

      let response: Response;
      try {
        response = await fetch(url, {
          headers: { 'Accept': 'text/event-stream' },
          signal: this.fetchAbortController.signal,
          credentials: 'include',
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (this.isDestroyed) return;
        if (fetchErr instanceof Error && fetchErr.name === 'AbortError') {
          // Timeout or intentional abort — just retry
          this.handleFetchConnectionError();
          return;
        }
        throw fetchErr;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        // Stop retrying on 4xx client errors (404, 401, 403, etc.)
        // These errors mean the endpoint/resource doesn't exist and won't self-resolve.
        if (response.status >= 400 && response.status < 500) {
          if (this.fetchReconnectAttempts === 0) {
            console.warn(
              `[StreamConnection] SSE endpoint returned ${response.status}, stopping reconnect.`
            );
          }
          this.handleError(new Error(`SSE endpoint returned HTTP ${response.status}`));
          return;
        }
        // For 5xx or other errors, retry gracefully with backoff
        if (!this.isDestroyed) {
          this.handleFetchConnectionError();
        }
        return;
      }

      if (!response.body) {
        if (!this.isDestroyed) {
          this.handleFetchConnectionError();
        }
        return;
      }

      // Connection is open
      this.fetchReconnectAttempts = 0;
      this.lastMessageTime = Date.now();
      this.setState('connected');
      this.startHeartbeatMonitor();
      try {
        this.options.onOpen?.();
      } catch {
        // Don't let callback errors crash us
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // Persist currentData across read() calls so that SSE events
      // split across TCP chunks are reassembled correctly.
      let currentData = '';

      const readLoop = async () => {
        try {
          while (!this.isDestroyed) {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended normally
              if (!this.isDestroyed) {
                try {
                  this.options.onClose?.();
                } catch {
                  // Don't let callback errors crash us
                }
              }
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            this.lastMessageTime = Date.now();

            // Parse SSE frames from buffer
            const lines = buffer.split('\n');
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                currentData += (currentData ? '\n' : '') + line.slice(6);
              } else if (line.trim() === '' && currentData) {
                // Empty line = end of SSE event
                try {
                  this.handleFetchMessage(currentData);
                } catch (handlerErr) {
                  // Never let message handler errors crash the read loop
                  console.warn('[StreamConnection] Fetch message handler error suppressed:', handlerErr);
                }
                currentData = '';
              }
              // Capture event IDs
              if (line.startsWith('id: ') || line.startsWith('id:')) {
                const id = line.slice(line.indexOf(':') + 1).trim();
                if (id) this.lastEventId = id;
              }
            }
          }
        } catch (err) {
          if (this.isDestroyed) return;
          const error = err instanceof Error ? err : new Error(String(err));
          // AbortError means we intentionally closed
          if (error.name === 'AbortError') return;
          if (!isTransientError(error)) {
            console.warn('[StreamConnection] Fetch read loop error:', error.message);
          }
          this.handleFetchConnectionError();
        }
      };

      readLoop();
    } catch (error) {
      if (this.isDestroyed) return;
      if (!isTransientError(error)) {
        console.warn('[StreamConnection] Fetch connection error:', error);
      }
      this.handleFetchConnectionError();
    }
  }

  private handleFetchMessage(data: string): void {
    if (this.isDestroyed) return;

    if (this.state === 'connected') {
      this.setState('streaming');
    }

    try {
      const parsed = JSON.parse(data);
      if (parsed._event_id) {
        this.lastEventId = parsed._event_id;
      }
    } catch {
      // Not JSON or no _event_id — fine
    }

    try {
      this.options.onMessage(data);
    } catch (err) {
      // Never let message callback errors propagate
      console.warn('[StreamConnection] onMessage callback error suppressed:', err);
    }
  }

  private handleFetchConnectionError(): void {
    this.fetchReconnectAttempts++;

    const maxAttempts = Math.max(STREAM_CONFIG.RECONNECT_MAX_ATTEMPTS, EXTENDED_MAX_RECONNECT_ATTEMPTS);

    if (this.fetchReconnectAttempts < maxAttempts && !this.isDestroyed) {
      this.setState('reconnecting');
      const delay = calculateExponentialBackoff(
        this.fetchReconnectAttempts - 1,
        STREAM_CONFIG.RECONNECT_BASE_DELAY_MS,
        STREAM_CONFIG.RECONNECT_MAX_DELAY_MS,
        STREAM_CONFIG.RECONNECT_BACKOFF_MULTIPLIER
      );
      this.reconnectTimeoutId = setTimeout(() => {
        if (!this.isDestroyed) {
          this.connectViaFetch().catch((err) => {
            // Catch-all: never let reconnect errors propagate
            if (!this.isDestroyed && !isTransientError(err)) {
              console.warn('[StreamConnection] Fetch reconnect error:', err);
            }
          });
        }
      }, delay);
    } else {
      // Even after max attempts, report error gracefully — don't throw
      this.handleError(new Error('Fetch SSE fallback: max reconnect attempts exceeded'));
    }
  }

  private setupEventHandlers(): void {
    if (!this.eventSource) return;

    const onOpen = () => {
      if (this.isDestroyed) return;

      this.reconnectAttempts = 0;
      this.consecutiveEventSourceFailures = 0;
      this.lastMessageTime = Date.now();
      this.setState('connected');
      this.startHeartbeatMonitor();
      try {
        this.options.onOpen?.();
      } catch {
        // Don't let callback errors crash us
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (this.isDestroyed) return;

      this.lastMessageTime = Date.now();

      if (this.state === 'connected') {
        this.setState('streaming');
      }

      try {
        const parsed = JSON.parse(event.data);
        if (parsed._event_id) {
          this.lastEventId = parsed._event_id;
        }
      } catch {
      }

      try {
        this.options.onMessage(event.data);
      } catch (err) {
        // Never let message callback errors propagate to EventSource
        console.warn('[StreamConnection] onMessage callback error suppressed:', err);
      }
    };

    const onError = () => {
      if (this.isDestroyed) return;
      this.handleConnectionError();
    };

    this.eventHandlers.set('open', onOpen);
    this.eventHandlers.set('message', onMessage);
    this.eventHandlers.set('error', onError);

    this.eventSource.addEventListener('open', onOpen);
    this.eventSource.addEventListener('message', onMessage);
    this.eventSource.addEventListener('error', onError);
  }

  private handleConnectionError(): void {
    this.consecutiveEventSourceFailures++;

    // Check fetch fallback FIRST — if EventSource keeps failing, switch to
    // fetch-based SSE immediately rather than burning through reconnect attempts
    // with the same broken transport (e.g. HTTP/2 or QUIC protocol errors).
    if (
      this.consecutiveEventSourceFailures >= FETCH_FALLBACK_THRESHOLD &&
      !this.useFetchFallback
    ) {
      console.warn(
        '[StreamConnection] EventSource failed %d times, switching to fetch-based SSE fallback',
        this.consecutiveEventSourceFailures
      );
      this.useFetchFallback = true;
      this.reconnectAttempts = 0;
      this.cleanup();
      this.connect().catch((err) => {
        // Never let reconnect errors propagate to React
        if (!this.isDestroyed && !isTransientError(err)) {
          console.warn('[StreamConnection] Fallback switch connect error:', err);
        }
      });
    } else if (this.shouldReconnect()) {
      this.scheduleReconnect();
    } else {
      // Even when we hit max retries, use handleError which sets state
      // but doesn't throw — the page stays functional
      this.handleError(new Error('EventSource connection error'));
    }
  }

  private handleError(error: Error): void {
    this.setState('error');
    try {
      this.options.onError?.(error);
    } catch {
      // Never let error callback errors propagate
    }
    this.cleanup();
  }

  private shouldReconnect(): boolean {
    const maxAttempts = Math.max(STREAM_CONFIG.RECONNECT_MAX_ATTEMPTS, EXTENDED_MAX_RECONNECT_ATTEMPTS);
    return (
      !this.isDestroyed &&
      this.reconnectAttempts < maxAttempts &&
      this.state !== 'closed'
    );
  }

  private scheduleReconnect(): void {
    if (this.isDestroyed) return;

    this.setState('reconnecting');
    this.reconnectAttempts++;

    const delay = calculateExponentialBackoff(
      this.reconnectAttempts - 1,
      STREAM_CONFIG.RECONNECT_BASE_DELAY_MS,
      STREAM_CONFIG.RECONNECT_MAX_DELAY_MS,
      STREAM_CONFIG.RECONNECT_BACKOFF_MULTIPLIER
    );

    this.reconnectTimeoutId = setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect().catch((err) => {
          // Catch-all: NEVER let reconnect errors surface as unhandled rejections
          if (!this.isDestroyed) {
            if (!isTransientError(err)) {
              console.warn('[StreamConnection] Reconnect error:', err);
            }
            // Try again if we haven't exceeded attempts
            if (this.shouldReconnect()) {
              this.scheduleReconnect();
            }
          }
        });
      }
    }, delay);
  }

  private startHeartbeatMonitor(): void {
    this.stopHeartbeatMonitor();

    this.heartbeatIntervalId = setInterval(() => {
      if (this.isDestroyed) {
        this.stopHeartbeatMonitor();
        return;
      }

      const timeSinceLastMessage = Date.now() - this.lastMessageTime;

      if (timeSinceLastMessage > STREAM_CONFIG.HEARTBEAT_TIMEOUT_MS) {
        if (this.useFetchFallback) {
          this.handleFetchConnectionError();
        } else {
          this.handleConnectionError();
        }
      }
    }, STREAM_CONFIG.HEARTBEAT_CHECK_INTERVAL_MS);
  }

  private stopHeartbeatMonitor(): void {
    if (this.heartbeatIntervalId) {
      clearInterval(this.heartbeatIntervalId);
      this.heartbeatIntervalId = null;
    }
  }

  private setState(newState: ConnectionState): void {
    if (this.state !== newState) {
      this.state = newState;
      try {
        this.options.onStateChange?.(newState);
      } catch {
        // Never let state change callbacks crash us
      }
    }
  }

  private cleanup(): void {
    this.stopHeartbeatMonitor();

    if (this.reconnectTimeoutId) {
      clearTimeout(this.reconnectTimeoutId);
      this.reconnectTimeoutId = null;
    }

    if (this.eventSource) {
      this.eventHandlers.forEach((handler, event) => {
        try {
          this.eventSource?.removeEventListener(event, handler as EventListener);
        } catch {
          // Ignore cleanup errors
        }
      });
      this.eventHandlers.clear();

      try {
        this.eventSource.close();
      } catch {
      }
      this.eventSource = null;
    }

    // Abort any active fetch-based SSE connection
    if (this.fetchAbortController) {
      try {
        this.fetchAbortController.abort();
      } catch {
      }
      this.fetchAbortController = null;
    }
  }

  close(): void {
    this.setState('closed');
    this.cleanup();
    try {
      this.options.onClose?.();
    } catch {
      // Don't let callback errors propagate
    }
  }

  destroy(): void {
    this.isDestroyed = true;
    this.close();
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'streaming';
  }

  isActive(): boolean {
    return !this.isDestroyed && this.state !== 'closed' && this.state !== 'error';
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  getLastEventId(): string | null {
    return this.lastEventId;
  }

  isUsingFetchFallback(): boolean {
    return this.useFetchFallback;
  }
}

export function createStreamConnection(options: StreamConnectionOptions): StreamConnection {
  return new StreamConnection(options);
}
