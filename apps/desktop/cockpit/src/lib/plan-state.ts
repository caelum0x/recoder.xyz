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

/**
 * PRODUCT DECISION (docs/PLAN-MODEL.md · PRD FR-2): LOCAL desktop agents are
 * UNLIMITED on every tier — it's your Mac and your keys (BYOK); Recoder never caps
 * local concurrency. Hosted/remote concurrency IS metered, but server-side in the
 * entitlement gate, not here. So the cockpit shows a live COUNT of running agents,
 * never a local cap. Kept as a function so callers stay stable if the desktop ever
 * gains a genuine local limit.
 */
export function parallelAgentLimit(_plan: string | null | undefined): number {
  return Number.POSITIVE_INFINITY;
}

/**
 * How many org SEATS a plan grants (mirrors distribution's `seatsForPlan`): Free
 * and Pro are single-seat individual plans, Team is a real pool, Enterprise is
 * unlimited. Seats meter org membership, NOT parallel agents. Unknown/absent plan
 * resolves to a single seat (fail safe: never over-grant).
 */
const SEAT_LIMIT: Record<PlanTier, number> = {
  free: 1,
  pro: 1,
  team: 25,
  enterprise: Number.POSITIVE_INFINITY,
};

export function seatLimit(plan: string | null | undefined): number {
  return SEAT_LIMIT[resolvePlanTier(plan)];
}

/**
 * A short usage label for the running-agent indicator: "N of M", or just "N"
 * when the plan is unlimited. `active` is clamped to >= 0.
 */
export function parallelAgentUsageLabel(
  active: number,
  plan: string | null | undefined,
): string {
  const n = Math.max(0, Math.floor(active) || 0);
  const limit = parallelAgentLimit(plan);
  return Number.isFinite(limit) ? `${n} of ${limit}` : `${n}`;
}

/**
 * True when the active count is at or over the plan's parallel limit — a cue to
 * show the gentle upgrade hint. NEVER used to block creation (surfaced only).
 * Always false for an unlimited (enterprise) plan.
 */
export function atParallelAgentLimit(
  active: number,
  plan: string | null | undefined,
): boolean {
  const limit = parallelAgentLimit(plan);
  if (!Number.isFinite(limit)) return false;
  return Math.max(0, Math.floor(active) || 0) >= limit;
}
