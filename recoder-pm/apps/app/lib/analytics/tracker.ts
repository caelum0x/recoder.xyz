/**
 * PM Analytics Tracker
 *
 * Client-side: forwards events to GA4 via `window.gtag` with console fallback.
 * Server-side: emits structured JSON logs and optionally POSTs to an ingest endpoint.
 *
 * Both entry-points are safe to call in any context -- they never throw and
 * silently no-op when the underlying transport is unavailable.
 *
 * Every event is automatically stamped with a trace_id for cross-service
 * correlation. Pass your own traceId to link events within a single operation.
 */

import type { PmEvent, PmEventPropertiesMap } from "./events";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function nowISO(): string {
  return new Date().toISOString();
}

/** Generate a lightweight trace ID (collision-safe enough for analytics). */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `pm_${timestamp}_${random}`;
}

// ---------------------------------------------------------------------------
// Client-side tracker (calls window.gtag with console fallback)
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type PropertiesFor<E extends PmEvent> = E extends keyof PmEventPropertiesMap
  ? PmEventPropertiesMap[E]
  : Record<string, unknown>;

/**
 * Track a PM event from client-side code.
 *
 * Sends the event to GA4 through `window.gtag`. If gtag is unavailable
 * (ad-blocker, SSR) the event is logged to the console in development.
 *
 * Usage:
 * ```ts
 * import { trackPmEvent, PmEvents } from '@/lib/analytics';
 * trackPmEvent(PmEvents.FEATURE_CREATED, { featureId: '123', title: 'New feature' });
 * ```
 */
export function trackPmEvent<E extends PmEvent>(
  event: E,
  properties?: PropertiesFor<E>,
): void {
  try {
    const payload: Record<string, unknown> = {
      ...properties,
      traceId: (properties as Record<string, unknown>)?.traceId ?? generateTraceId(),
      timestamp: (properties as Record<string, unknown>)?.timestamp ?? nowISO(),
    };

    if (typeof window !== "undefined" && typeof window.gtag === "function") {
      window.gtag("event", event, payload);
      return;
    }

    // Console fallback for development / SSR leak detection
    if (typeof window !== "undefined" && process.env.NODE_ENV === "development") {
      console.debug(`[pm-analytics] ${event}`, payload);
    }
  } catch {
    // Never throw from analytics code.
  }
}

// ---------------------------------------------------------------------------
// Server-side tracker
// ---------------------------------------------------------------------------

/** Optional analytics endpoint. When set, `trackPmServerEvent` will POST
 *  events here in addition to logging them. */
const ANALYTICS_ENDPOINT = process.env.PM_ANALYTICS_INGEST_URL ?? "";

/**
 * Track a PM event from server-side code (server actions, API routes).
 *
 * Emits a structured JSON log line that can be picked up by any log
 * aggregator (Datadog, Loki, CloudWatch, etc.). If `PM_ANALYTICS_INGEST_URL`
 * is configured, the event is also POSTed there fire-and-forget.
 *
 * Usage:
 * ```ts
 * import { trackPmServerEvent, PmEvents } from '@/lib/analytics';
 * trackPmServerEvent(PmEvents.FEATURE_CREATED, { featureId: id, userId: user.id });
 * ```
 */
export function trackPmServerEvent<E extends PmEvent>(
  event: E,
  properties?: PropertiesFor<E>,
): void {
  try {
    const traceId =
      (properties as Record<string, unknown>)?.traceId ?? generateTraceId();
    const entry = {
      level: "info" as const,
      category: "pm_analytics",
      service: "recoder-pm",
      event,
      traceId,
      ts: nowISO(),
      ...properties,
    };

    // Structured log -- mirrors the format used by the main app's tracker
    console.log(JSON.stringify(entry));

    // Optional: fire-and-forget POST to external analytics endpoint
    if (ANALYTICS_ENDPOINT) {
      fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {
        // Swallow network errors -- analytics must never break the request.
      });
    }
  } catch {
    // Never throw from analytics code.
  }
}

/**
 * Generate a trace ID that can be shared across multiple events in the same
 * operation. Useful for correlating e.g. a dispatch + response pair.
 */
export { generateTraceId as createPmTraceId };
