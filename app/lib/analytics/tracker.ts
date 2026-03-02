/**
 * Universal Analytics Tracker
 *
 * Client-side: forwards events to GA4 via the global `gtag` function.
 * Server-side: emits structured JSON logs (same format as logger.ts) and
 *   optionally POSTs to an analytics collection endpoint.
 *
 * Both entry-points are safe to call in any context -- they never throw and
 * silently no-op when the underlying transport is unavailable.
 */

import type { AnalyticsEvent, EventPropertiesMap } from './events';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Client-side tracker  (calls window.gtag)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

/**
 * Track a product event from client-side code.
 *
 * Sends the event to GA4 through the global `gtag` snippet that is already
 * loaded in `app/layout.tsx`.  If `gtag` is not available (e.g. ad-blocker,
 * SSR leak) the call is silently ignored.
 *
 * Usage:
 * ```ts
 * import { trackEvent, AnalyticsEvents } from '@/lib/analytics';
 * trackEvent(AnalyticsEvents.PRICING_PAGE_VIEWED, { source: 'navbar' });
 * ```
 */
export function trackEvent<E extends AnalyticsEvent>(
  event: E,
  properties?: E extends keyof EventPropertiesMap
    ? EventPropertiesMap[E]
    : Record<string, unknown>,
): void {
  try {
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') {
      return;
    }

    const payload: Record<string, unknown> = {
      ...properties,
      timestamp: (properties as Record<string, unknown>)?.timestamp ?? nowISO(),
    };

    window.gtag('event', event, payload);
  } catch {
    // Never throw from analytics code -- swallow silently.
  }
}

// ---------------------------------------------------------------------------
// Server-side tracker
// ---------------------------------------------------------------------------

/** Optional analytics endpoint. When set, `trackServerEvent` will POST
 *  events here in addition to logging them.  */
const ANALYTICS_ENDPOINT = process.env.ANALYTICS_INGEST_URL ?? '';

/**
 * Track a product event from server-side code (API routes, server components).
 *
 * Emits a structured JSON log line that can be picked up by any log
 * aggregator (Datadog, Loki, CloudWatch, etc.).  If `ANALYTICS_INGEST_URL`
 * is configured, the event is also POSTed there in a fire-and-forget manner.
 *
 * Usage:
 * ```ts
 * import { trackServerEvent, AnalyticsEvents } from '@/lib/analytics';
 * trackServerEvent(AnalyticsEvents.SIGNUP_COMPLETED, { method: 'email', userId: user.id });
 * ```
 */
export function trackServerEvent<E extends AnalyticsEvent>(
  event: E,
  properties?: E extends keyof EventPropertiesMap
    ? EventPropertiesMap[E]
    : Record<string, unknown>,
): void {
  try {
    const entry = {
      level: 'info' as const,
      category: 'analytics',
      event,
      ts: nowISO(),
      ...properties,
    };

    // Structured log -- mirrors the format used by lib/logger.ts
    console.log(JSON.stringify(entry));

    // Optional: fire-and-forget POST to external analytics endpoint
    if (ANALYTICS_ENDPOINT) {
      fetch(ANALYTICS_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      }).catch(() => {
        // Swallow network errors -- analytics must never break the request.
      });
    }
  } catch {
    // Never throw from analytics code.
  }
}
