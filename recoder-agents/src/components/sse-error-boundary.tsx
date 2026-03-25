'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Optional label for log messages */
  name?: string;
  /** What to render when the boundary catches an error.
   *  - `undefined` / not provided: renders nothing (silent suppression)
   *  - a ReactNode: renders that node in place of the crashed children
   */
  fallback?: ReactNode;
  /**
   * If set, the boundary will automatically clear its error state and
   * re-attempt rendering children after this many milliseconds.
   * The delay escalates with each consecutive retry to avoid rapid-fire
   * retries on persistent failures.
   * Useful for transient SSE/network failures.  Defaults to off (0).
   */
  retryAfterMs?: number;
  /**
   * Maximum number of auto-retries before giving up.
   * After this many retries, the fallback is shown permanently
   * (until a manual retry or page reload).
   * Defaults to 10.
   */
  maxRetries?: number;
}

interface State {
  hasError: boolean;
  retryCount: number;
  lastError: string | null;
}

/**
 * Maximum escalation multiplier for retry delays.
 * E.g. with retryAfterMs=10000, after 5 retries: min(10000 * 2^5, 120000) = 120000ms = 2min
 */
const MAX_RETRY_DELAY_MS = 120000; // 2 minutes

/**
 * Error boundary that catches SSE/streaming provider and component crashes.
 *
 * Use cases:
 * - Wrapping side-effect-only providers (PresenceProvider, NotificationToastProvider)
 *   where `fallback` is omitted so nothing renders on error.
 * - Wrapping visible UI sections (sidebar panels, active runs) where `fallback`
 *   provides degraded-but-present UI so the rest of the page keeps working.
 *
 * Features:
 * - Auto-retry with escalating backoff via `retryAfterMs`
 * - Max retry cap to prevent infinite retry loops
 * - Error counting for diagnostics
 * - SSE-specific error detection (HTTP/2, QUIC, network errors)
 * - Silent suppression: SSE failures NEVER result in a blank page
 */
export class SSEErrorBoundary extends Component<Props, State> {
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, retryCount: 0, lastError: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, lastError: error?.message || 'Unknown error' };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    const label = this.props.name ? `:${this.props.name}` : '';
    const retryCount = this.state.retryCount;

    // Only log on first occurrence, then every 5th retry, to avoid console spam.
    // SSE errors are expected transient failures — no need to log every single one.
    if (retryCount === 0 || retryCount % 5 === 0) {
      const isSSEError = this.isSSERelatedError(error);
      if (isSSEError) {
        console.warn(
          `[SSEErrorBoundary${label}] SSE error (retry #${retryCount}), suppressing:`,
          error.message,
        );
      } else {
        console.warn(
          `[SSEErrorBoundary${label}] Error (retry #${retryCount}), suppressing:`,
          error.message,
        );
      }
    }

    // Schedule auto-retry with escalating delay
    this.scheduleRetry();
  }

  componentWillUnmount() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * Check if the error is SSE/network related (these are always transient
   * and should be retried aggressively).
   */
  private isSSERelatedError(error: Error): boolean {
    const msg = error.message?.toLowerCase() || '';
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
      msg.includes('eventsource') ||
      msg.includes('sse') ||
      msg.includes('stream') ||
      msg.includes('connection') ||
      msg.includes('abort')
    );
  }

  /**
   * Schedule auto-retry with escalating backoff.
   * First retry uses the configured delay, subsequent retries double
   * the delay up to MAX_RETRY_DELAY_MS.
   */
  private scheduleRetry() {
    const baseRetryMs = this.props.retryAfterMs;
    const maxRetries = this.props.maxRetries ?? 10;

    if (!baseRetryMs || baseRetryMs <= 0) return;
    if (this.state.retryCount >= maxRetries) {
      const label = this.props.name ? `:${this.props.name}` : '';
      console.warn(
        `[SSEErrorBoundary${label}] Max retries (${maxRetries}) reached, stopping auto-retry.`
      );
      return;
    }

    // Clear any existing timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Escalating delay: base * 2^retryCount, capped at MAX_RETRY_DELAY_MS
    const delay = Math.min(
      baseRetryMs * Math.pow(2, Math.min(this.state.retryCount, 6)),
      MAX_RETRY_DELAY_MS
    );

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.setState((prev) => ({
        hasError: false,
        retryCount: prev.retryCount + 1,
        lastError: null,
      }));
    }, delay);
  }

  /** Allow manual retry from outside (e.g. a retry button in the fallback). */
  retry = () => {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.setState((prev) => ({
      hasError: false,
      retryCount: prev.retryCount + 1,
      lastError: null,
    }));
  };

  render() {
    if (this.state.hasError) {
      // If an explicit fallback was provided, use it
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }

      // Default: silent suppression — render nothing.
      // SSE failures should NEVER show a blank page or visible error.
      return null;
    }
    return this.props.children;
  }
}
