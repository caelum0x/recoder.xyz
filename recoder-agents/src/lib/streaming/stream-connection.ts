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
 * Maximum number of consecutive EventSource failures before switching to
 * fetch-based SSE streaming. Cloudflare HTTP/3 (QUIC) can break the native
 * EventSource API with ERR_QUIC_PROTOCOL_ERROR, but regular fetch with
 * ReadableStream works fine over the same connection.
 */
const FETCH_FALLBACK_THRESHOLD = 2;

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

  // Fetch-based SSE fallback state
  private useFetchFallback = false;
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
      const token = await this.options.getAuthToken();
      const streamBaseUrl = `${this.options.apiUrl}/agent-run/${this.options.runId}/stream`;
      const url = buildTokenizedSSEUrl(streamBaseUrl, token, {
        last_id: this.lastEventId && this.lastEventId !== '0' ? this.lastEventId : undefined,
      });

      this.eventSource = new EventSource(url);
      this.setupEventHandlers();
    } catch (error) {
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

    try {
      const token = await this.options.getAuthToken();
      const streamBaseUrl = `${this.options.apiUrl}/agent-run/${this.options.runId}/stream`;
      const url = buildTokenizedSSEUrl(streamBaseUrl, token, {
        last_id: this.lastEventId && this.lastEventId !== '0' ? this.lastEventId : undefined,
      });

      this.fetchAbortController = new AbortController();

      const response = await fetch(url, {
        headers: { 'Accept': 'text/event-stream' },
        signal: this.fetchAbortController.signal,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Fetch SSE failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Fetch SSE: response body is null (streaming not supported)');
      }

      // Connection is open
      this.fetchReconnectAttempts = 0;
      this.lastMessageTime = Date.now();
      this.setState('connected');
      this.startHeartbeatMonitor();
      this.options.onOpen?.();

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const readLoop = async () => {
        try {
          while (!this.isDestroyed) {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended normally
              if (!this.isDestroyed) {
                this.options.onClose?.();
              }
              return;
            }

            buffer += decoder.decode(value, { stream: true });
            this.lastMessageTime = Date.now();

            // Parse SSE frames from buffer
            const lines = buffer.split('\n');
            // Keep the last incomplete line in the buffer
            buffer = lines.pop() || '';

            let currentData = '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                currentData += (currentData ? '\n' : '') + line.slice(6);
              } else if (line.trim() === '' && currentData) {
                // Empty line = end of SSE event
                this.handleFetchMessage(currentData);
                currentData = '';
              }
              // Ignore lines starting with ":" (SSE comments/keepalives),
              // "event:", "id:", "retry:" etc.
              if (line.startsWith('id: ') || line.startsWith('id:')) {
                const id = line.slice(line.indexOf(':') + 1).trim();
                if (id) this.lastEventId = id;
              }
            }

            // If there is accumulated data without a trailing blank line,
            // it might be a single-line SSE message (some servers don't
            // send trailing newlines). We keep it in a pending state.
            if (currentData) {
              // Put it back at the start of the buffer so it gets completed
              // with the next chunk
              buffer = currentData + '\n' + buffer;
            }
          }
        } catch (err) {
          if (this.isDestroyed) return;
          const error = err instanceof Error ? err : new Error(String(err));
          // AbortError means we intentionally closed
          if (error.name === 'AbortError') return;
          this.handleFetchConnectionError();
        }
      };

      readLoop();
    } catch (error) {
      if (this.isDestroyed) return;
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

    this.options.onMessage(data);
  }

  private handleFetchConnectionError(): void {
    this.fetchReconnectAttempts++;

    if (this.fetchReconnectAttempts < STREAM_CONFIG.RECONNECT_MAX_ATTEMPTS && !this.isDestroyed) {
      this.setState('reconnecting');
      const delay = calculateExponentialBackoff(
        this.fetchReconnectAttempts - 1,
        STREAM_CONFIG.RECONNECT_BASE_DELAY_MS,
        STREAM_CONFIG.RECONNECT_MAX_DELAY_MS,
        STREAM_CONFIG.RECONNECT_BACKOFF_MULTIPLIER
      );
      this.reconnectTimeoutId = setTimeout(() => {
        if (!this.isDestroyed) {
          this.connectViaFetch();
        }
      }, delay);
    } else {
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
      this.options.onOpen?.();
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

      this.options.onMessage(event.data);
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

    if (this.shouldReconnect()) {
      this.scheduleReconnect();
    } else if (
      this.consecutiveEventSourceFailures >= FETCH_FALLBACK_THRESHOLD &&
      !this.useFetchFallback
    ) {
      // EventSource keeps failing — switch to fetch-based SSE streaming.
      // This handles Cloudflare HTTP/3 QUIC errors that break EventSource
      // but not regular fetch requests.
      console.warn(
        '[StreamConnection] EventSource failed %d times, switching to fetch-based SSE fallback',
        this.consecutiveEventSourceFailures
      );
      this.useFetchFallback = true;
      this.reconnectAttempts = 0;
      this.cleanup();
      this.connect();
    } else {
      this.handleError(new Error('EventSource connection error'));
    }
  }

  private handleError(error: Error): void {
    this.setState('error');
    this.options.onError?.(error);
    this.cleanup();
  }

  private shouldReconnect(): boolean {
    return (
      !this.isDestroyed &&
      this.reconnectAttempts < STREAM_CONFIG.RECONNECT_MAX_ATTEMPTS &&
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
        this.connect();
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
      this.options.onStateChange?.(newState);
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
        this.eventSource?.removeEventListener(event, handler as EventListener);
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
    this.options.onClose?.();
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
