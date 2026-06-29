/**
 * xdr/detections.ts — detection rules over a stream of NetworkSecurityEvents.
 *
 * Each rule is a pure function: given the events and a config, it returns zero or
 * more XdrDetections. Rules are deny/alert-biased — they err toward raising a
 * detection. The detection engine groups by subject (source IP) and applies each
 * rule independently, so a clean stream produces no detections.
 *
 * Rules implemented (PRD FR-10):
 *   - authz_denial_burst:    N+ ext_authz denials (403 / UAEX flag) from one IP.
 *   - repeated_auth_failure: N+ 401/403 responses from one IP (auth churn).
 *   - denied_egress:         N+ "no route" / no-cluster denials from one IP.
 *   - anomalous_rate:        N+ total requests from one IP within the window.
 *   - anomalous_principal:   a request from an mTLS principal NOT in the known
 *                            set (unexpected actor on the mesh).
 *   - unexpected_egress:     a request whose destination upstream is NOT in the
 *                            egress allowlist (data exfil / lateral movement).
 *   - auth_failure_spike:    N+ auth failures (401/403) from one principal/IP
 *                            inside a bounded time WINDOW (credential stuffing /
 *                            brute force), distinct from the cumulative count.
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
  /**
   * The set of mTLS principals expected on the mesh. A request carrying any
   * principal NOT in this set raises an `anomalous_principal` detection. Empty
   * (the default) DISABLES the rule — an empty allowlist would otherwise flag
   * every authenticated request; the adopting service populates it from the same
   * trust roots as `NETWORK_TRUSTED_PRINCIPALS`.
   */
  readonly knownPrincipals: ReadonlySet<string>;
  /**
   * Allowlist of upstream destinations a caller may egress to. A request whose
   * `upstream` is set and NOT in this allowlist raises `unexpected_egress`.
   * Empty (the default) DISABLES the rule (no allowlist => nothing to compare).
   */
  readonly egressAllowlist: ReadonlySet<string>;
  /**
   * Time window (ms) for the rate-bounded `auth_failure_spike` rule. Auth
   * failures are bucketed by subject and the rule fires when any window of this
   * span contains >= authFailureSpikeThreshold failures.
   */
  readonly authFailureSpikeWindowMs: number;
  /** Auth failures within one window before `auth_failure_spike` fires. */
  readonly authFailureSpikeThreshold: number;
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  authzDenialBurstThreshold: 5,
  repeatedAuthFailureThreshold: 5,
  deniedEgressThreshold: 3,
  anomalousRateThreshold: 100,
  maxSampleEvents: 5,
  knownPrincipals: new Set<string>(),
  egressAllowlist: new Set<string>(),
  authFailureSpikeWindowMs: 10_000,
  authFailureSpikeThreshold: 5,
};

/**
 * Merge a partial override onto the defaults, accepting plain arrays for the set
 * fields so callers (and env wiring) don't have to construct Sets by hand.
 */
export function makeDetectionConfig(
  over: Partial<{
    authzDenialBurstThreshold: number;
    repeatedAuthFailureThreshold: number;
    deniedEgressThreshold: number;
    anomalousRateThreshold: number;
    maxSampleEvents: number;
    knownPrincipals: Iterable<string>;
    egressAllowlist: Iterable<string>;
    authFailureSpikeWindowMs: number;
    authFailureSpikeThreshold: number;
  }> = {},
): DetectionConfig {
  return {
    authzDenialBurstThreshold:
      over.authzDenialBurstThreshold ?? DEFAULT_DETECTION_CONFIG.authzDenialBurstThreshold,
    repeatedAuthFailureThreshold:
      over.repeatedAuthFailureThreshold ?? DEFAULT_DETECTION_CONFIG.repeatedAuthFailureThreshold,
    deniedEgressThreshold:
      over.deniedEgressThreshold ?? DEFAULT_DETECTION_CONFIG.deniedEgressThreshold,
    anomalousRateThreshold:
      over.anomalousRateThreshold ?? DEFAULT_DETECTION_CONFIG.anomalousRateThreshold,
    maxSampleEvents: over.maxSampleEvents ?? DEFAULT_DETECTION_CONFIG.maxSampleEvents,
    knownPrincipals: over.knownPrincipals
      ? new Set(over.knownPrincipals)
      : DEFAULT_DETECTION_CONFIG.knownPrincipals,
    egressAllowlist: over.egressAllowlist
      ? new Set(over.egressAllowlist)
      : DEFAULT_DETECTION_CONFIG.egressAllowlist,
    authFailureSpikeWindowMs:
      over.authFailureSpikeWindowMs ?? DEFAULT_DETECTION_CONFIG.authFailureSpikeWindowMs,
    authFailureSpikeThreshold:
      over.authFailureSpikeThreshold ?? DEFAULT_DETECTION_CONFIG.authFailureSpikeThreshold,
  };
}

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

/** Parse an event timestamp to epoch ms; NaN-safe (returns 0 if unparseable). */
function eventTimeMs(e: NetworkSecurityEvent): number {
  const t = Date.parse(e.timestamp);
  return Number.isFinite(t) ? t : 0;
}

/**
 * Slide a fixed-span window over time-sorted events and return the largest
 * count of events that fall inside any single window of `windowMs`. O(n) via a
 * two-pointer scan. Used by the rate-bounded `auth_failure_spike` rule.
 */
function maxEventsInWindow(
  events: readonly NetworkSecurityEvent[],
  windowMs: number,
): { count: number; sample: NetworkSecurityEvent[] } {
  if (events.length === 0) return { count: 0, sample: [] };
  const sorted = [...events].sort((a, b) => eventTimeMs(a) - eventTimeMs(b));
  let best = 0;
  let bestStart = 0;
  let bestEnd = 0;
  let left = 0;
  for (let right = 0; right < sorted.length; right += 1) {
    const rightT = eventTimeMs(sorted[right]);
    while (eventTimeMs(sorted[left]) < rightT - windowMs) left += 1;
    const span = right - left + 1;
    if (span > best) {
      best = span;
      bestStart = left;
      bestEnd = right;
    }
  }
  return { count: best, sample: sorted.slice(bestStart, bestEnd + 1) };
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

    // (d) auth_failure_spike — rate-bounded: N+ auth failures inside one time
    // window. Distinct from repeated_auth_failure (cumulative) — this catches a
    // burst that is concentrated in time (credential stuffing / brute force)
    // even when the cumulative count alone would not yet alarm.
    const authFailuresForSpike = group.filter(isAuthFailure);
    if (authFailuresForSpike.length >= config.authFailureSpikeThreshold) {
      const { count, sample } = maxEventsInWindow(
        authFailuresForSpike,
        config.authFailureSpikeWindowMs,
      );
      if (count >= config.authFailureSpikeThreshold) {
        detections.push(
          makeDetection(
            'auth_failure_spike',
            severityForCount(count, config.authFailureSpikeThreshold),
            subject,
            `${count} auth failures from ${subject} within ${config.authFailureSpikeWindowMs}ms ` +
              `(threshold ${config.authFailureSpikeThreshold}).`,
            sample,
            config.maxSampleEvents,
          ),
        );
      }
    }
  }

  // (a) anomalous_principal — a presented mTLS principal not in the known set.
  // Per-principal (not per-source-IP): an unexpected actor is anomalous on its
  // first appearance. Disabled when no known set is configured.
  if (config.knownPrincipals.size > 0) {
    const byPrincipal = new Map<string, NetworkSecurityEvent[]>();
    for (const e of events) {
      const p = e.principal;
      if (!p || config.knownPrincipals.has(p)) continue;
      const bucket = byPrincipal.get(p);
      if (bucket) bucket.push(e);
      else byPrincipal.set(p, [e]);
    }
    for (const [principal, group] of byPrincipal) {
      detections.push(
        makeDetection(
          'anomalous_principal',
          group.length >= 5 ? 'high' : 'medium',
          principal,
          `Unknown mTLS principal ${principal} made ${group.length} request(s); not in the known-principal set.`,
          group,
          config.maxSampleEvents,
        ),
      );
    }
  }

  // (c) unexpected_egress — a request whose upstream destination is not in the
  // egress allowlist (lateral movement / exfil). Per-destination. Disabled when
  // no allowlist is configured (nothing to compare against).
  if (config.egressAllowlist.size > 0) {
    const byDest = new Map<string, NetworkSecurityEvent[]>();
    for (const e of events) {
      const dest = e.upstream;
      if (!dest || config.egressAllowlist.has(dest)) continue;
      const bucket = byDest.get(dest);
      if (bucket) bucket.push(e);
      else byDest.set(dest, [e]);
    }
    for (const [dest, group] of byDest) {
      detections.push(
        makeDetection(
          'unexpected_egress',
          group.length >= 5 ? 'high' : 'medium',
          dest,
          `${group.length} request(s) egressed to non-allowlisted destination ${dest}.`,
          group,
          config.maxSampleEvents,
        ),
      );
    }
  }

  return detections;
}
