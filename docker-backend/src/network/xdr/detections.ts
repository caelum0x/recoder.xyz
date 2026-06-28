/**
 * xdr/detections.ts — detection rules over a stream of NetworkSecurityEvents.
 *
 * Each rule is a pure function: given the events and a config, it returns zero or
 * more XdrDetections. Rules are deny/alert-biased — they err toward raising a
 * detection. The detection engine groups by subject (source IP) and applies each
 * rule independently, so a clean stream produces no detections.
 *
 * Rules implemented:
 *   - authz_denial_burst:   N+ ext_authz denials (403 / UAEX flag) from one IP.
 *   - repeated_auth_failure: N+ 401/403 responses from one IP (auth churn).
 *   - denied_egress:        N+ "no route" / no-cluster denials from one IP.
 *   - anomalous_rate:       N+ total requests from one IP within the window.
 */
import { randomUUID } from 'node:crypto';
import type {
  NetworkSecurityEvent,
  XdrDetection,
  XdrRuleId,
  XdrSeverity,
} from '../types';

export interface DetectionConfig {
  /** Threshold of ext_authz denials from one source before alerting. */
  readonly authzDenialBurstThreshold: number;
  /** Threshold of auth failures (401/403) from one source. */
  readonly repeatedAuthFailureThreshold: number;
  /** Threshold of denied-egress (no-route) events from one source. */
  readonly deniedEgressThreshold: number;
  /** Threshold of total requests from one source (rate anomaly). */
  readonly anomalousRateThreshold: number;
  /** Max sample events attached to a detection (evidence bound). */
  readonly maxSampleEvents: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  authzDenialBurstThreshold: 5,
  repeatedAuthFailureThreshold: 5,
  deniedEgressThreshold: 3,
  anomalousRateThreshold: 100,
  maxSampleEvents: 5,
};

/** ext_authz denial: Envoy sets the UAEX response flag and returns 403. */
function isExtAuthzDenied(e: NetworkSecurityEvent): boolean {
  return e.responseCode === 403 && (e.responseFlags?.includes('UAEX') ?? false);
}

/** Any authentication/authorization failure surface. */
function isAuthFailure(e: NetworkSecurityEvent): boolean {
  return e.responseCode === 401 || e.responseCode === 403;
}

/** No route / no healthy upstream: "NR" (no route) or "UH"/"UF" upstream flags. */
function isDeniedEgress(e: NetworkSecurityEvent): boolean {
  const flags = e.responseFlags ?? '';
  return flags.includes('NR') || flags.includes('UH') || flags.includes('UF');
}

function severityForCount(count: number, threshold: number): XdrSeverity {
  const ratio = count / Math.max(1, threshold);
  if (ratio >= 4) return 'critical';
  if (ratio >= 2) return 'high';
  return 'medium';
}

function makeDetection(
  ruleId: XdrRuleId,
  severity: XdrSeverity,
  subject: string,
  summary: string,
  events: readonly NetworkSecurityEvent[],
  maxSamples: number,
): XdrDetection {
  return {
    detectionId: `xdr_${randomUUID()}`,
    ruleId,
    severity,
    subject,
    summary,
    detectedAt: new Date().toISOString(),
    eventCount: events.length,
    sampleEvents: events.slice(0, maxSamples),
  };
}

function groupBySource(
  events: readonly NetworkSecurityEvent[],
): Map<string, NetworkSecurityEvent[]> {
  const groups = new Map<string, NetworkSecurityEvent[]>();
  for (const e of events) {
    const key = e.sourceIp || 'unknown';
    const bucket = groups.get(key);
    if (bucket) bucket.push(e);
    else groups.set(key, [e]);
  }
  return groups;
}

/**
 * Run every detection rule over a window of events. Pure + deterministic given
 * the same input (detectionId/detectedAt aside). A clean stream returns [].
 */
export function detect(
  events: readonly NetworkSecurityEvent[],
  config: DetectionConfig = DEFAULT_DETECTION_CONFIG,
): XdrDetection[] {
  const detections: XdrDetection[] = [];
  const groups = groupBySource(events);

  for (const [subject, group] of groups) {
    const authzDenials = group.filter(isExtAuthzDenied);
    if (authzDenials.length >= config.authzDenialBurstThreshold) {
      detections.push(
        makeDetection(
          'authz_denial_burst',
          severityForCount(authzDenials.length, config.authzDenialBurstThreshold),
          subject,
          `${authzDenials.length} ext_authz denials from ${subject} (threshold ${config.authzDenialBurstThreshold}).`,
          authzDenials,
          config.maxSampleEvents,
        ),
      );
    }

    const authFailures = group.filter(isAuthFailure);
    if (authFailures.length >= config.repeatedAuthFailureThreshold) {
      detections.push(
        makeDetection(
          'repeated_auth_failure',
          severityForCount(authFailures.length, config.repeatedAuthFailureThreshold),
          subject,
          `${authFailures.length} auth failures (401/403) from ${subject} (threshold ${config.repeatedAuthFailureThreshold}).`,
          authFailures,
          config.maxSampleEvents,
        ),
      );
    }

    const deniedEgress = group.filter(isDeniedEgress);
    if (deniedEgress.length >= config.deniedEgressThreshold) {
      detections.push(
        makeDetection(
          'denied_egress',
          severityForCount(deniedEgress.length, config.deniedEgressThreshold),
          subject,
          `${deniedEgress.length} denied-egress / no-route events from ${subject} (threshold ${config.deniedEgressThreshold}).`,
          deniedEgress,
          config.maxSampleEvents,
        ),
      );
    }

    if (group.length >= config.anomalousRateThreshold) {
      detections.push(
        makeDetection(
          'anomalous_rate',
          severityForCount(group.length, config.anomalousRateThreshold),
          subject,
          `${group.length} requests from ${subject} in window (threshold ${config.anomalousRateThreshold}).`,
          group,
          config.maxSampleEvents,
        ),
      );
    }
  }

  return detections;
}
