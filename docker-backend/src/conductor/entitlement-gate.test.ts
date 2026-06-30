/**
 * Conductor entitlement-gate tests.
 *
 * Proves the enforced loop: a workspace launch's requested substrate is gated
 * against the user's REAL plan via distribution's `decideCapability`, and the
 * decision is degrade-safe / fail-safe / behavior-preserving:
 *
 *   - free plan + requested `daytona` (remote)  → downgraded to local `tmux_worktree`.
 *   - pro/team/enterprise + `daytona`           → `daytona` honored.
 *   - billing unconfigured (no POLAR token)     → free floor → remote denied → local.
 *   - non-remote requested substrate            → passed through UNCHANGED.
 *   - no userId (embedded/internal) + `daytona` → honored (no billable subject).
 *   - solo mode + `daytona`                     → honored (single local operator).
 *   - resolver throws                           → fail safe → local tmux.
 *
 * The gate reads the process-wide distribution module via `getDistributionModule`.
 * We mock that one seam so plan resolution + billing-config are deterministic, and
 * exercise the REAL `decideCapability` from `@recoder/distribution` underneath.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Plan } from '@recoder/distribution';

// --- controllable distribution module seam -----------------------------------
let currentPlan: Plan = 'free';
let billingConfigured = true;
let throwOnResolve = false;

vi.mock('../distribution/module.js', () => ({
  getDistributionModule: () => ({
    auth: {
      getUserProfile: async (userId: string) => {
        if (throwOnResolve) throw new Error('resolver boom');
        return userId ? { plan: currentPlan } : null;
      },
    },
    // The real `decideCapability` only uses `resolver` as a reserved arg today.
    resolver: {},
    // `secrets.has(POLAR_ACCESS_TOKEN)` decides billing-configured.
    secrets: {
      has: (k: string) =>
        k === 'POLAR_ACCESS_TOKEN' ? billingConfigured : false,
    },
  }),
}));

// --- controllable solo-mode seam ---------------------------------------------
let soloMode = false;
vi.mock('./solo-mode.js', () => ({
  isSoloMode: () => soloMode,
}));

// Import AFTER the mocks are registered.
import { decideSubstrateEntitlement } from './entitlement-gate.js';

beforeEach(() => {
  currentPlan = 'free';
  billingConfigured = true;
  throwOnResolve = false;
  soloMode = false;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('decideSubstrateEntitlement — remote substrate enforcement', () => {
  it('downgrades a free-plan daytona request to local tmux with a truthful reason', async () => {
    currentPlan = 'free';
    const r = await decideSubstrateEntitlement({
      userId: 'u_free',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('tmux_worktree');
    expect(r.downgraded).toBe(true);
    expect(r.plan).toBe('free');
    expect(r.reason).toBeTruthy();
    expect(r.decision?.allowed).toBe(false);
  });

  it('honors daytona for a pro plan', async () => {
    currentPlan = 'pro';
    const r = await decideSubstrateEntitlement({
      userId: 'u_pro',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('daytona');
    expect(r.downgraded).toBe(false);
    expect(r.plan).toBe('pro');
    expect(r.decision?.allowed).toBe(true);
  });

  it('honors daytona for a team plan', async () => {
    currentPlan = 'team';
    const r = await decideSubstrateEntitlement({
      userId: 'u_team',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('daytona');
    expect(r.downgraded).toBe(false);
  });

  it('honors daytona for an enterprise plan', async () => {
    currentPlan = 'enterprise';
    const r = await decideSubstrateEntitlement({
      userId: 'u_ent',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('daytona');
    expect(r.downgraded).toBe(false);
  });

  it('fails safe to local tmux when billing is unconfigured, even on a pro plan', async () => {
    currentPlan = 'pro';
    billingConfigured = false;
    const r = await decideSubstrateEntitlement({
      userId: 'u_pro',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('tmux_worktree');
    expect(r.downgraded).toBe(true);
    expect(r.decision?.reason).toBe('billing_unconfigured');
  });
});

describe('decideSubstrateEntitlement — behavior-preserving passthrough', () => {
  it('passes a tmux_worktree request through unchanged (never gated)', async () => {
    currentPlan = 'free';
    const r = await decideSubstrateEntitlement({
      userId: 'u_free',
      requestedSubstrate: 'tmux_worktree',
    });
    expect(r.substrate).toBe('tmux_worktree');
    expect(r.downgraded).toBe(false);
  });

  it('passes an in_process request through unchanged', async () => {
    const r = await decideSubstrateEntitlement({
      userId: 'u_free',
      requestedSubstrate: 'in_process',
    });
    expect(r.substrate).toBe('in_process');
    expect(r.downgraded).toBe(false);
  });

  it('defaults an unset substrate to local tmux without downgrading', async () => {
    const r = await decideSubstrateEntitlement({ userId: 'u_free' });
    expect(r.substrate).toBe('tmux_worktree');
    expect(r.downgraded).toBe(false);
  });
});

describe('decideSubstrateEntitlement — solo / no-subject paths', () => {
  it('honors daytona when there is no verified userId (embedded/internal)', async () => {
    const r = await decideSubstrateEntitlement({
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('daytona');
    expect(r.downgraded).toBe(false);
    expect(r.reason).toContain('no verified user');
  });

  it('honors daytona for the single local operator in solo mode', async () => {
    soloMode = true;
    currentPlan = 'free';
    const r = await decideSubstrateEntitlement({
      userId: 'u_solo',
      requestedSubstrate: 'daytona',
    });
    expect(r.substrate).toBe('daytona');
    expect(r.downgraded).toBe(false);
    expect(r.reason).toContain('solo mode');
  });
});

describe('decideSubstrateEntitlement — fail safe on error', () => {
  it('downgrades to local tmux when plan resolution throws', async () => {
    throwOnResolve = true;
    const r = await decideSubstrateEntitlement({
      userId: 'u_x',
      requestedSubstrate: 'daytona',
    });
    // resolvePlanSafe swallows the throw → free floor → remote denied → local.
    expect(r.substrate).toBe('tmux_worktree');
    expect(r.downgraded).toBe(true);
    expect(r.plan).toBe('free');
  });
});
