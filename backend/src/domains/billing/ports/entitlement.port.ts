/**
 * `EntitlementGate` — the load-bearing seam ALL other domains gate on.
 *
 * FROZEN CONTRACT — Phase 9. `conductor` (pre-dispatch quota + feature gate),
 * `inference` (token metering), `engines` (per-engine usage), `edge` (checkout
 * UI state), and `agent-os` (run gating) compile against this port while the
 * concrete `EntitlementService` is composed behind it. This gate WORKS before
 * any provider adapter exists: plan resolution + the static plan→capability
 * matrix + durable quota counters answer allow|deny on their own; a provider
 * only adds grant-based lifts on top.
 *
 * Fail-safe law (non-negotiable, doc §37): on any uncertainty — repo down,
 * provider unconfigured, resolution error — the gate DENIES (feature) or reports
 * ZERO headroom (quota). It never optimistically allows.
 */
import type { Principal } from '../../identity/types.js';
import type { ComponentHealth } from '../../../shared/health-types.js';
import type {
  BillingSubject,
  EntitlementDecision,
  EntitlementRequest,
  EntitlementView,
  Feature,
  GateDecision,
  PlanTier,
  QuotaDecision,
  UsageKind,
} from '../types.js';

export interface EntitlementGate {
  /**
   * The authoritative effective plan for a subject: `max(recoder.xyz auth plan,
   * webhook-confirmed provider plan)`. Fail safe: unknown/repo-down ⇒ `free`
   * (the deny-by-default floor).
   */
  resolvePlan(subject: BillingSubject): Promise<PlanTier>;

  /**
   * THE unified allow|deny entrypoint. Resolves the subject from the
   * {@link Principal}, then dispatches on the request: a `{ feature }` request
   * runs the feature gate; a `{ quota, cost? }` request runs the quota gate.
   * Returns one {@link GateDecision} envelope callers can branch on.
   */
  check(principal: Principal, req: EntitlementRequest): Promise<GateDecision>;

  /** Feature gate: does the subject's plan (or a grant) carry `feature`? */
  checkFeature(subject: BillingSubject, feature: Feature): Promise<EntitlementDecision>;

  /**
   * Quota gate: is there `cost` headroom left for `kind` in the current window?
   * A BYOK subject (`hasOwnApiKey`) bypasses token-metered kinds but still
   * passes every feature gate. Fail safe: repo-down ⇒ deny (`metering_unavailable`).
   */
  checkQuota(subject: BillingSubject, kind: UsageKind, cost?: number): Promise<QuotaDecision>;

  /** Is the subject BYOK (brings its own AI provider key → skips token quota)? */
  isBYOK(subject: BillingSubject): Promise<boolean>;

  /** The full entitlement view (plan + features + per-kind quotas) for the UI. */
  view(subject: BillingSubject): Promise<EntitlementView>;

  /** Truthful component health (degraded when metering repo / provider impaired). */
  health(): ComponentHealth;
}
