/**
 * PM Interop Analytics Event Taxonomy (API-side)
 *
 * Defines the interop / A2A events emitted by the PM API service.
 * These match the interop subset of the full PM event taxonomy defined
 * in apps/app/lib/analytics/events.ts.
 */

export const PmInteropEvents = {
  CONNECTOR_INVOKED: "pm_connector_invoked",
  CONNECTOR_RESPONSE: "pm_connector_response",
  CONNECTOR_ERROR: "pm_connector_error",
} as const;

export type PmInteropEvent =
  (typeof PmInteropEvents)[keyof typeof PmInteropEvents];

/** Interop event properties. All include connector_id for cross-service correlation. */
export interface PmInteropEventProperties {
  /** Connector identifier for the external service being invoked. */
  connector_id: string;
  /** Trace ID for correlating events across services. */
  traceId?: string;
  intent?: string;
  messageId?: string;
  threadId?: string;
  targetUrl?: string;
  fromPlatform?: string;
  toPlatform?: string;
  /** HTTP status code from the remote service. */
  responseStatus?: number;
  /** Error message if the invocation failed. */
  errorMessage?: string;
  /** Duration of the remote call in milliseconds. */
  durationMs?: number;
  /** ISO-8601 timestamp; auto-filled by the tracker when omitted. */
  timestamp?: string;
}
