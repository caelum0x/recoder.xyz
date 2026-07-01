/**
 * Plan presentation helpers — pure functions that turn the signed-in identity's
 * best-effort `plan` string into a TRUTHFUL, one-word tier label for the cockpit
 * header badge, plus a deny-safe answer to "is this capability gated for my tier?".
 *
 * Fail-safe by construction:
 *  - An absent/unknown/blank plan resolves to 'free' (the most restrictive floor),
 *    NEVER to a paid tier. We never inflate a plan the server did not grant.
 *  - Capability gating mirrors the static, deny-safe FLOOR the entitlement gate
 *    reasons about offline. Source of truth for the vocabulary + floor:
 *      packages/distribution/src/domain/subscription-plan.ts (PlanTier)
 *      packages/distribution/src/channels/billing/plan-capabilities.ts
 *    This is presentation-only: it hints which controls a tier gates. The DURABLE
 *    decision still lives server-side (the billing port / entitlement gate); an
 *    explicit grant may lift a tier above this floor. So we only ever use this to
 *    show a *subtle* upgrade hint, never to hard-block a control.
 */

/** The plan tiers the cockpit recognizes (mirrors @recoder/distribution `Plan`). */
export type PlanTier = 'free' | 'pro' | 'team' | 'enterprise';

/** The quantitative, tier-gated capabilities the header can hint at. */
export type PlanCapability = 'parallel_agents' | 'remote_substrate' | 'team_seats';

const KNOWN_TIERS: readonly PlanTier[] = ['free', 'pro', 'team', 'enterprise'];

/** Tier ordering for gate checks: enterprise >= team >= pro >= free. */
const TIER_RANK: Record<PlanTier, number> = { free: 0, pro: 1, team: 2, enterprise: 3 };

/**
 * The minimum tier that UNLOCKS each capability (mirrors the deny-safe floor in
 * plan-capabilities.ts: remote_substrate is Pro+, team_seats is Team+). A
 * capability at or above this tier is available; below it, the control is gated.
 */
const CAPABILITY_MIN_TIER: Record<PlanCapability, PlanTier> = {
  parallel_agents: 'free', // every tier can run at least one agent
  remote_substrate: 'pro', // remote substrate is Pro and above
  team_seats: 'team', // org seats are Team and above
};

/** One-word display label per tier (calm, muted badge text). */
const TIER_LABEL: Record<PlanTier, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
  enterprise: 'Enterprise',
};

/**
 * Normalize a best-effort plan string to a known tier. Unknown/blank/undefined
 * input resolves to 'free' — the deny-safe floor. We never map an unrecognized
 * value up to a paid tier (fail safe: never fabricate an entitlement).
 */
export function resolvePlanTier(plan: string | null | undefined): PlanTier {
  if (typeof plan !== 'string') return 'free';
  const normalized = plan.trim().toLowerCase();
  return (KNOWN_TIERS as readonly string[]).includes(normalized)
    ? (normalized as PlanTier)
    : 'free';
}

/**
 * The one-word badge label for a raw plan string. Always returns a real label;
 * defaults to 'Free' when the plan is absent or unrecognized.
 */
export function planLabel(plan: string | null | undefined): string {
  return TIER_LABEL[resolvePlanTier(plan)];
}

/** True when `have` is at least as privileged as `need`. */
export function tierSatisfies(have: PlanTier, need: PlanTier): boolean {
  return TIER_RANK[have] >= TIER_RANK[need];
}

/**
 * True when a capability is GATED for the current plan (i.e. the plan sits below
 * the tier that unlocks it) — so the UI may show a subtle, non-nagging hint near
 * the relevant control. Presentation-only; the server still makes the real call.
 */
export function isCapabilityGated(
  plan: string | null | undefined,
  capability: PlanCapability,
): boolean {
  return !tierSatisfies(resolvePlanTier(plan), CAPABILITY_MIN_TIER[capability]);
}

/**
 * The minimum tier LABEL that unlocks a capability — for a hint like
 * "Pro+" next to a gated control. Returns a one-word tier label.
 */
export function capabilityUnlockLabel(capability: PlanCapability): string {
  return TIER_LABEL[CAPABILITY_MIN_TIER[capability]];
}
