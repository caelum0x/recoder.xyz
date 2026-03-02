/**
 * PM API Analytics Tracker (server-side only)
 *
 * Emits structured JSON log lines for interop events. Never throws.
 */

import type { PmInteropEvent, PmInteropEventProperties } from "./events";

function nowISO(): string {
  return new Date().toISOString();
}

/** Generate a lightweight trace ID for analytics correlation. */
export function createPmTraceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 10);
  return `pm_${timestamp}_${random}`;
}

const ANALYTICS_ENDPOINT = process.env.PM_ANALYTICS_INGEST_URL ?? "";

/**
 * Track a PM interop event from API server code.
 *
 * Emits a structured JSON log line and optionally POSTs to an ingest endpoint.
 */
export function trackPmInteropEvent(
  event: PmInteropEvent,
  properties: PmInteropEventProperties,
): void {
  try {
    const traceId = properties.traceId ?? createPmTraceId();
    const entry = {
      level: "info" as const,
      category: "pm_analytics",
      service: "recoder-pm-api",
      event,
      traceId,
      ts: nowISO(),
      ...properties,
    };

    console.log(JSON.stringify(entry));

    if (ANALYTICS_ENDPOINT) {
      fetch(ANALYTICS_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      }).catch(() => {
        // Swallow network errors.
      });
    }
  } catch {
    // Never throw from analytics code.
  }
}
