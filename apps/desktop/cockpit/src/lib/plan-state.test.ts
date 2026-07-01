/**
 * Unit tests for the plan presentation helpers (plan-state.ts).
 *
 * These exercise the pure tier normalization + capability gating that drive the
 * cockpit header plan badge and the subtle gated-capability hint. The load-bearing
 * guarantee under test is fail-safe: an absent/unknown plan resolves to 'free'
 * (the badge shows "Free"), and we NEVER inflate to a paid tier the server did
 * not grant.
 */
import { describe, expect, it } from 'vitest';
import {
  resolvePlanTier,
  planLabel,
  tierSatisfies,
  isCapabilityGated,
  capabilityUnlockLabel,
  parallelAgentLimit,
  parallelAgentUsageLabel,
  atParallelAgentLimit,
  type PlanTier,
} from './plan-state';

describe('resolvePlanTier', () => {
  it('resolves each known tier verbatim', () => {
    expect(resolvePlanTier('free')).toBe('free');
    expect(resolvePlanTier('pro')).toBe('pro');
    expect(resolvePlanTier('team')).toBe('team');
    expect(resolvePlanTier('enterprise')).toBe('enterprise');
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(resolvePlanTier('  Pro ')).toBe('pro');
    expect(resolvePlanTier('TEAM')).toBe('team');
  });

  it('defaults to free when the plan is absent (undefined/null)', () => {
    expect(resolvePlanTier(undefined)).toBe('free');
    expect(resolvePlanTier(null)).toBe('free');
  });

  it('defaults to free for a blank or unrecognized plan — never inflates', () => {
    expect(resolvePlanTier('')).toBe('free');
    expect(resolvePlanTier('   ')).toBe('free');
    expect(resolvePlanTier('platinum')).toBe('free');
    expect(resolvePlanTier('paid')).toBe('free');
  });
});

describe('planLabel', () => {
  it('renders a calm one-word label per tier', () => {
    expect(planLabel('free')).toBe('Free');
    expect(planLabel('pro')).toBe('Pro');
    expect(planLabel('team')).toBe('Team');
    expect(planLabel('enterprise')).toBe('Enterprise');
  });

  it('defaults to "Free" when identity has no plan', () => {
    expect(planLabel(undefined)).toBe('Free');
    expect(planLabel(null)).toBe('Free');
    expect(planLabel('')).toBe('Free');
  });

  it('never labels an unrecognized plan as a paid tier', () => {
    expect(planLabel('gold')).toBe('Free');
  });
});

describe('tierSatisfies', () => {
  it('honors the enterprise >= team >= pro >= free ordering', () => {
    const tiers: PlanTier[] = ['free', 'pro', 'team', 'enterprise'];
    for (let have = 0; have < tiers.length; have += 1) {
      for (let need = 0; need < tiers.length; need += 1) {
        expect(tierSatisfies(tiers[have], tiers[need])).toBe(have >= need);
      }
    }
  });
});

describe('isCapabilityGated', () => {
  it('gates remote substrate on free (it is Pro+)', () => {
    expect(isCapabilityGated('free', 'remote_substrate')).toBe(true);
  });

  it('does NOT gate remote substrate on pro and above', () => {
    expect(isCapabilityGated('pro', 'remote_substrate')).toBe(false);
    expect(isCapabilityGated('team', 'remote_substrate')).toBe(false);
    expect(isCapabilityGated('enterprise', 'remote_substrate')).toBe(false);
  });

  it('gates team seats below team, allows at team and above', () => {
    expect(isCapabilityGated('free', 'team_seats')).toBe(true);
    expect(isCapabilityGated('pro', 'team_seats')).toBe(true);
    expect(isCapabilityGated('team', 'team_seats')).toBe(false);
    expect(isCapabilityGated('enterprise', 'team_seats')).toBe(false);
  });

  it('never gates parallel agents (every tier runs at least one)', () => {
    expect(isCapabilityGated('free', 'parallel_agents')).toBe(false);
  });

  it('treats an absent plan as gated (fail-safe: no fabricated entitlement)', () => {
    expect(isCapabilityGated(undefined, 'remote_substrate')).toBe(true);
    expect(isCapabilityGated('', 'remote_substrate')).toBe(true);
    expect(isCapabilityGated('bogus', 'remote_substrate')).toBe(true);
  });
});

describe('capabilityUnlockLabel', () => {
  it('names the minimum unlocking tier for a hint like "Pro+"', () => {
    expect(capabilityUnlockLabel('remote_substrate')).toBe('Pro');
    expect(capabilityUnlockLabel('team_seats')).toBe('Team');
    expect(capabilityUnlockLabel('parallel_agents')).toBe('Free');
  });
});

describe('parallelAgentLimit', () => {
  it('mirrors the deny-safe floor per tier', () => {
    expect(parallelAgentLimit('free')).toBe(1);
    expect(parallelAgentLimit('pro')).toBe(3);
    expect(parallelAgentLimit('team')).toBe(10);
    expect(parallelAgentLimit('enterprise')).toBe(Number.POSITIVE_INFINITY);
  });

  it('defaults to the free floor (1) when the plan is absent/unknown', () => {
    expect(parallelAgentLimit(undefined)).toBe(1);
    expect(parallelAgentLimit('')).toBe(1);
    expect(parallelAgentLimit('platinum')).toBe(1);
  });
});

describe('parallelAgentUsageLabel', () => {
  it('renders "N of M" for a finite plan limit', () => {
    expect(parallelAgentUsageLabel(0, 'free')).toBe('0 of 1');
    expect(parallelAgentUsageLabel(2, 'pro')).toBe('2 of 3');
    expect(parallelAgentUsageLabel(5, 'team')).toBe('5 of 10');
  });

  it('renders just "N" for an unlimited (enterprise) plan', () => {
    expect(parallelAgentUsageLabel(7, 'enterprise')).toBe('7');
  });

  it('clamps a negative/garbage active count to 0', () => {
    expect(parallelAgentUsageLabel(-3, 'free')).toBe('0 of 1');
    expect(parallelAgentUsageLabel(Number.NaN, 'free')).toBe('0 of 1');
  });
});

describe('atParallelAgentLimit', () => {
  it('is true at or over the plan limit, false below', () => {
    expect(atParallelAgentLimit(0, 'free')).toBe(false);
    expect(atParallelAgentLimit(1, 'free')).toBe(true);
    expect(atParallelAgentLimit(2, 'free')).toBe(true);
    expect(atParallelAgentLimit(2, 'pro')).toBe(false);
    expect(atParallelAgentLimit(3, 'pro')).toBe(true);
  });

  it('is never at-limit for an unlimited (enterprise) plan', () => {
    expect(atParallelAgentLimit(9999, 'enterprise')).toBe(false);
  });

  it('treats an absent plan as the free floor (fail-safe)', () => {
    expect(atParallelAgentLimit(1, undefined)).toBe(true);
    expect(atParallelAgentLimit(0, undefined)).toBe(false);
  });
});
