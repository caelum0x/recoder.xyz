/**
 * Server-side plan -> entitlements table for the desktop/CLI.
 *
 * This is the single authoritative mapping from a subscription plan to the
 * convergence features the desktop may enable. Values are derived from what
 * the pricing page actually sells (lib/pricing-config.ts): team collaboration
 * sizes, "Advanced features" on paid tiers, and "Unlimited everything" on
 * enterprise. Never promise a feature here that the plans do not sell.
 *
 * Fail-safe rule: unknown/absent plans and non-active subscription statuses
 * degrade to the free tier's features.
 */

import type { PlanId } from '@/lib/pricing-config';

/** Sentinel for unlimited numeric entitlements (enterprise). */
export const UNLIMITED = -1;

export interface EntitlementFeatures {
  parallel_agents: number;
  sibling_awareness: boolean;
  assisted_synthesize: boolean;
  evidence_retention_days: number;
  shared_team_memory: boolean;
  team_members: number;
}

export interface ResolvedEntitlements {
  plan: PlanId;
  status: string;
  features: EntitlementFeatures;
}

/** Minimal shape of the prisma `users` row we resolve from. */
export interface EntitlementUserLike {
  subscriptionPlan?: string | null;
  subscriptionStatus?: string | null;
}

/** Minimal shape of the prisma `subscriptions` row we resolve from. */
export interface EntitlementSubscriptionLike {
  planId?: string | null;
  status?: string | null;
}

const PLAN_ENTITLEMENTS: Record<PlanId, EntitlementFeatures> = {
  free: {
    parallel_agents: 2,
    sibling_awareness: true,
    assisted_synthesize: false,
    evidence_retention_days: 7,
    shared_team_memory: false,
    team_members: 1,
  },
  // Weekly/monthly sell "Advanced features" + team collaboration (3/5 members)
  weekly: {
    parallel_agents: 4,
    sibling_awareness: true,
    assisted_synthesize: true,
    evidence_retention_days: 30,
    shared_team_memory: true,
    team_members: 3,
  },
  monthly: {
    parallel_agents: 4,
    sibling_awareness: true,
    assisted_synthesize: true,
    evidence_retention_days: 30,
    shared_team_memory: true,
    team_members: 5,
  },
  pro: {
    parallel_agents: 8,
    sibling_awareness: true,
    assisted_synthesize: true,
    evidence_retention_days: 90,
    shared_team_memory: true,
    team_members: 10,
  },
  // "Unlimited everything"
  enterprise: {
    parallel_agents: UNLIMITED,
    sibling_awareness: true,
    assisted_synthesize: true,
    evidence_retention_days: UNLIMITED,
    shared_team_memory: true,
    team_members: UNLIMITED,
  },
};

/** Statuses that grant the plan's paid features; anything else degrades to free. */
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

// Billing surfaces store pro as interval-suffixed ids (see /api/billing/plans)
const PLAN_ALIASES: Record<string, PlanId> = {
  'pro-monthly': 'pro',
  'pro-yearly': 'pro',
};

function isKnownPlan(plan: string): plan is PlanId {
  return Object.prototype.hasOwnProperty.call(PLAN_ENTITLEMENTS, plan);
}

/** Normalize any stored plan identifier; unknown/absent degrades to 'free'. */
export function normalizePlanId(raw: unknown): PlanId {
  if (typeof raw !== 'string') return 'free';
  const plan = raw.trim().toLowerCase();
  if (isKnownPlan(plan)) return plan;
  const alias = PLAN_ALIASES[plan];
  return alias ?? 'free';
}

/** Feature set for a plan id (already-normalized ids only get an exact match). */
export function getEntitlementFeatures(plan: PlanId): EntitlementFeatures {
  return { ...PLAN_ENTITLEMENTS[plan] };
}

/**
 * True only for subscription statuses that grant paid features (`active`/
 * `trialing`). An absent/blank/any-other status (cancelled, past_due, unpaid,
 * expired, refunded…) is NOT active — so a stale paid plan can't keep its
 * quotas. (recoder-5ypw / recoder-y8gb)
 */
export function isActiveSubscriptionStatus(status: string | null | undefined): boolean {
  const s = typeof status === 'string' ? status.trim().toLowerCase() : '';
  return ACTIVE_STATUSES.has(s);
}

/**
 * The plan whose LIMITS/quotas actually apply for enforcement: the user's stored
 * `subscriptionPlan` ONLY while their status is active/trialing, else `free`.
 * Returns the raw stored plan string (downstream vocabulary preserved) so every
 * enforcement gate — plan-limits, usage, sessions — degrades a cancelled/lapsed
 * customer to free instead of trusting a stale paid plan field. (recoder-5ypw)
 */
export function effectivePlanForLimits(user: EntitlementUserLike | null | undefined): string {
  return isActiveSubscriptionStatus(user?.subscriptionStatus)
    ? user?.subscriptionPlan ?? 'free'
    : 'free';
}

/**
 * Resolve {plan, status, features} from the user row and their (optional)
 * subscription record. The subscription record wins when present. A
 * non-active status keeps the reported plan/status truthful but degrades
 * the granted features to the free tier.
 */
export function resolveEntitlements(
  user: EntitlementUserLike | null | undefined,
  subscription?: EntitlementSubscriptionLike | null
): ResolvedEntitlements {
  const plan = normalizePlanId(subscription?.planId ?? user?.subscriptionPlan);

  // Fail-safe: an absent/blank status must NOT be treated as active — that would
  // grant a stale paid `subscriptionPlan` its features with no proven active
  // subscription. Default to 'inactive' so grantedPlan degrades to free unless a
  // real active/trialing status is present. (recoder-y8gb)
  const rawStatus = subscription?.status ?? user?.subscriptionStatus;
  const status =
    typeof rawStatus === 'string' && rawStatus.trim() !== ''
      ? rawStatus.trim().toLowerCase()
      : 'inactive';

  const grantedPlan: PlanId = ACTIVE_STATUSES.has(status) ? plan : 'free';

  return {
    plan,
    status,
    features: getEntitlementFeatures(grantedPlan),
  };
}
