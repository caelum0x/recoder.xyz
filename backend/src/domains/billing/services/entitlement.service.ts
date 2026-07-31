/**
 * `createEntitlementService` — the concrete {@link EntitlementGate}.
 *
 * This is the WORKING gate the doc promises "before any provider exists": it
 * answers allow|deny from three fail-safe layers — (1) effective-plan resolution
 * `max(recoder.xyz auth plan, webhook-confirmed subscription)`, (2) the static
 * plan→capability matrix in the plan catalog, (3) durable Postgres quota
 * counters — and only ADDS provider grants on top via the distribution adapter
 * when one is wired.
 *
 * Fail-safe law (doc §37/§8), enforced everywhere below:
 *  - unknown plan / repo down            → `free` (deny-by-default floor)
 *  - paid feature, no provider grant     → DENY (`billing_unconfigured`/`no_grant`)
 *  - metering repo unreachable           → DENY quota (`metering_unavailable`)
 *  - BYOK subject (`hasOwnApiKey`)        → SKIP token-metered quota, STILL gate features
 */
import type { Logger } from '../../../shared/logger.js';
import {
  degraded as degradedHealth,
  healthy,
  type ComponentHealth,
} from '../../../shared/health-types.js';
import type { Principal } from '../../identity/types.js';
import type { EntitlementGate } from '../ports/entitlement.port.js';
import type { MeteringRepository } from '../ports/metering-repo.port.js';
import type { DistributionBillingAdapter } from '../adapters/distribution-billing.adapter.js';
import type { PlanCatalog } from './plan-catalog.service.js';
import {
  BYOK_BYPASS_KINDS,
  USAGE_KINDS,
  type BillingSubject,
  type BillingSubscription,
  type EntitlementDecision,
  type EntitlementRequest,
  type EntitlementView,
  type Feature,
  type GateDecision,
  type PlanTier,
  type QuotaDecision,
  type UsageKind,
} from '../types.js';

const GATE_NAME = 'billing.entitlement';

/**
 * Dunning grace window (#29). A `past_due` subscription — a renewal payment that
 * failed but has NOT been canceled — RETAINS its prior paid tier until
 * `currentPeriodEnd + DUNNING_GRACE_DAYS` before it hard-downgrades to `free`.
 * This avoids yanking a paying customer to Free the instant a card fails, while
 * still bounding the free ride so a permanently-failing account eventually drops.
 */
export const DUNNING_GRACE_DAYS = 7;
const DUNNING_GRACE_MS = DUNNING_GRACE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Is a `past_due` subscription still inside its dunning grace window?
 * Deny-safe: an absent/unparseable `currentPeriodEnd` cannot prove grace, so it
 * returns `false` (the subject falls back to the deny-safe plan resolution).
 */
function withinDunningGrace(sub: BillingSubscription, now: Date): boolean {
  if (!sub.currentPeriodEnd) return false;
  const periodEnd = Date.parse(sub.currentPeriodEnd);
  if (Number.isNaN(periodEnd)) return false;
  return now.getTime() <= periodEnd + DUNNING_GRACE_MS;
}

export interface EntitlementServiceDeps {
  readonly repo: MeteringRepository;
  readonly catalog: PlanCatalog;
  readonly distribution: DistributionBillingAdapter;
  readonly logger?: Logger;
  /**
   * The recoder.xyz auth plan for a subject (the OTHER half of the `max(...)`).
   * Optional: absent ⇒ the subscription projection alone decides the plan.
   */
  readonly resolveAuthPlan?: (subject: BillingSubject) => Promise<PlanTier | null> | PlanTier | null;
  /**
   * BYOK resolver (does the subject bring its own AI provider key?). Optional:
   * absent ⇒ `false` (fail safe — token quota is enforced by default).
   */
  readonly resolveByok?: (subject: BillingSubject) => Promise<boolean> | boolean;
  /** Injectable clock for deterministic window math in tests. */
  readonly now?: () => Date;
  /**
   * Solo/desktop mode (bootstrap-injected from `RECODER_SOLO_MODE`, §10.8 — no
   * env read here): quota fails OPEN when the metering repo is unreachable.
   * Default `false` keeps every cloud deploy's fail-safe deny.
   */
  readonly soloMode?: boolean;
}

/** The calendar-month UTC window quota is metered against. */
function monthlyWindow(now: Date): { windowStart: string; resetAt: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { windowStart: start.toISOString(), resetAt: reset.toISOString() };
}

export function createEntitlementService(deps: EntitlementServiceDeps): EntitlementGate {
  const { repo, catalog, distribution } = deps;
  const clock = deps.now ?? (() => new Date());
  const soloMode = deps.soloMode === true;

  function subjectFromPrincipal(principal: Principal): BillingSubject {
    return principal.orgId
      ? { subjectId: principal.orgId, kind: 'org' }
      : { subjectId: principal.userId, kind: 'user' };
  }

  async function resolvePlan(subject: BillingSubject): Promise<PlanTier> {
    let webhookPlan: PlanTier | null = null;
    try {
      const sub = await repo.getActiveSubscription(subject.subjectId);
      if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
        webhookPlan = catalog.normalize(sub.plan);
      } else if (sub && sub.status === 'past_due' && withinDunningGrace(sub, clock())) {
        // #29 dunning grace: a failed renewal keeps the paid tier through a
        // bounded retry window instead of an instant hard-downgrade to free.
        webhookPlan = catalog.normalize(sub.plan);
      }
    } catch (error) {
      deps.logger?.warn?.({ error, subjectId: subject.subjectId }, 'resolvePlan: subscription read failed → free floor');
    }

    let authPlan: PlanTier | null = null;
    try {
      const resolved = await deps.resolveAuthPlan?.(subject);
      if (resolved) authPlan = catalog.normalize(resolved);
    } catch (error) {
      deps.logger?.warn?.({ error, subjectId: subject.subjectId }, 'resolvePlan: auth-plan read failed');
    }

    // Effective plan = the higher of the two (deny-safe default is `free`).
    const candidates: PlanTier[] = ['free'];
    if (webhookPlan) candidates.push(webhookPlan);
    if (authPlan) candidates.push(authPlan);
    return candidates.reduce((best, p) => (catalog.satisfies(p, best) ? p : best), 'free' as PlanTier);
  }

  async function isBYOK(subject: BillingSubject): Promise<boolean> {
    if (typeof subject.hasOwnApiKey === 'boolean') return subject.hasOwnApiKey;
    try {
      return (await deps.resolveByok?.(subject)) ?? false;
    } catch {
      return false; // fail safe: enforce token quota when BYOK is uncertain
    }
  }

  async function checkFeature(subject: BillingSubject, feature: Feature): Promise<EntitlementDecision> {
    const plan = await resolvePlan(subject);
    const base = { plan, feature } as const;

    // 1. Static tier floor (includes free-tier features — works offline).
    if (catalog.hasFeature(plan, feature)) {
      return { ...base, allowed: true };
    }

    // 2. A paid feature not in the tier requires a provider grant.
    if (!distribution.configured) {
      return {
        ...base,
        allowed: false,
        reason: 'billing_unconfigured',
        message: `billing provider not configured; paid feature '${feature}' is denied`,
      };
    }

    // 3. An explicit feature_flag grant may lift it.
    const distPlan = catalog.toDistributionPlan(plan);
    const granted = await distribution.hasFeatureGrant(subject, feature, distPlan);
    if (granted) {
      return { ...base, allowed: true };
    }

    // 4. Configured, but no active grant backs it.
    return {
      ...base,
      allowed: false,
      reason: 'no_grant',
      message: `plan '${plan}' does not include '${feature}' and no active grant backs it`,
    };
  }

  async function checkQuota(subject: BillingSubject, kind: UsageKind, cost = 1): Promise<QuotaDecision> {
    const plan = await resolvePlan(subject);
    const { resetAt } = monthlyWindow(clock());
    const limit = catalog.quotaLimit(plan, kind);
    const base = { plan, kind, resetAt } as const;

    // BYOK bypass: a subject with its own key skips token-metered kinds only.
    if (BYOK_BYPASS_KINDS.includes(kind) && (await isBYOK(subject))) {
      return { ...base, allowed: true, limit, remaining: limit, byokBypass: true };
    }

    // Unlimited (0) always has headroom.
    if (limit === 0) {
      return { ...base, allowed: true, limit: 0, remaining: 0, byokBypass: false };
    }

    // Solo/desktop mode (bootstrap-injected `soloMode`): a single local user on
    // their own machine with no billing plane. There is nothing to meter, so an
    // unreachable metering repo fails OPEN instead of denying — otherwise a
    // DB-less desktop would 429 every AI request. A cloud deploy never enables
    // solo mode, so it keeps the fail-safe deny below.
    if (!repo.isAvailable() && soloMode) {
      return { ...base, allowed: true, limit, remaining: limit, byokBypass: false };
    }

    // Fail-safe DENY when metering is unreachable — never allow-by-default.
    if (!repo.isAvailable()) {
      return {
        ...base,
        allowed: false,
        limit,
        remaining: 0,
        byokBypass: false,
        reason: 'metering_unavailable',
        message: 'metering repository unavailable; quota denied (fail safe)',
      };
    }

    let used: number;
    try {
      const { windowStart } = monthlyWindow(clock());
      used = await repo.usageSince(subject.subjectId, kind, windowStart);
    } catch (error) {
      deps.logger?.warn?.({ error, subjectId: subject.subjectId, kind }, 'checkQuota: usage read failed → deny');
      return {
        ...base,
        allowed: false,
        limit,
        remaining: 0,
        byokBypass: false,
        reason: 'metering_unavailable',
        message: 'metering read failed; quota denied (fail safe)',
      };
    }

    const remaining = Math.max(0, limit - used);
    const allowed = remaining >= cost;
    if (allowed) {
      return { ...base, allowed, limit, remaining, byokBypass: false };
    }
    // #30: a hard-deny carries a structured upgrade CTA (current + lifting tier)
    // so the UI can offer "upgrade to continue" instead of an opaque dead end.
    const suggestedTier = catalog.upgradeTierForQuota(plan, kind);
    return {
      ...base,
      allowed: false,
      limit,
      remaining,
      byokBypass: false,
      reason: 'quota_exceeded',
      message: `quota exceeded for ${kind}: ${remaining}/${limit} remaining`,
      ...(suggestedTier ? { upgrade: { currentTier: plan, suggestedTier } } : {}),
    };
  }

  async function view(subject: BillingSubject): Promise<EntitlementView> {
    const plan = await resolvePlan(subject);
    const features = [...catalog.capabilities(plan)];
    // Layer any explicit feature_flag grants on top of the static floor.
    const grants = await distribution.resolveGrants(subject);
    for (const g of grants) {
      if (g.granted && g.kind === 'feature_flag' && !features.includes(g.key as Feature)) {
        features.push(g.key as Feature);
      }
    }
    const quotas = await Promise.all(USAGE_KINDS.map((kind) => checkQuota(subject, kind)));
    return { plan, features, quotas };
  }

  function health(): ComponentHealth {
    if (!repo.isAvailable()) {
      return degradedHealth(GATE_NAME, 'metering repository unavailable — quota checks deny (fail safe)');
    }
    if (!distribution.configured) {
      return degradedHealth(
        GATE_NAME,
        'no billing provider configured — paid grants deny; free tier + static entitlements serve',
      );
    }
    return healthy(GATE_NAME);
  }

  return {
    resolvePlan,
    isBYOK,
    checkFeature,
    checkQuota,
    view,
    health,

    async check(principal: Principal, req: EntitlementRequest): Promise<GateDecision> {
      const subject = subjectFromPrincipal(principal);
      if ('feature' in req) {
        const d = await checkFeature(subject, req.feature);
        return {
          allowed: d.allowed,
          plan: d.plan,
          ...(d.reason ? { reason: d.reason } : {}),
          ...(d.message ? { message: d.message } : {}),
          feature: d,
        };
      }
      const d = await checkQuota(subject, req.quota, req.cost);
      return {
        allowed: d.allowed,
        plan: d.plan,
        ...(d.reason ? { reason: d.reason } : {}),
        ...(d.message ? { message: d.message } : {}),
        ...(d.upgrade ? { upgrade: d.upgrade } : {}),
        quota: d,
      };
    },
  };
}
