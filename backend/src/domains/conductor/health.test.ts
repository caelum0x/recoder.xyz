/**
 * Truthful conductor health rollup.
 *
 * Proves: no substrate available → `down` (cannot launch any work); the default
 * tmux substrate up + DB reachable → `up`; DB unreachable (or only opt-in
 * substrates) → `degraded`. Never a fabricated `up`; every non-up rollup carries
 * a reason and a per-engine breakdown.
 */
import { describe, it, expect } from 'vitest';
import { buildConductorHealth } from './health.js';
import { sliceConductorConfig } from './config.js';
import { makeConfig } from './__fixtures__/harness.js';
import type { SubstrateAvailabilityView } from './types.js';

const cfg = sliceConductorConfig(makeConfig());
const up = (id: SubstrateAvailabilityView['id']): SubstrateAvailabilityView => ({ id, available: true });
const down = (id: SubstrateAvailabilityView['id'], reason: string): SubstrateAvailabilityView => ({
  id,
  available: false,
  reason,
});

describe('conductor health', () => {
  it('is down when no substrate is available (cannot launch work)', () => {
    const health = buildConductorHealth({
      config: cfg,
      substrates: [down('tmux_worktree', 'not wired'), down('daytona', 'no creds')],
      repositoryAvailable: true,
      liveConnections: 0,
    });
    expect(health.status).toBe('down');
    expect(health.degraded).toBe(true);
    expect(health.reason).toBeTruthy();
    expect(health.engines?.find((e) => e.name === 'substrate:tmux_worktree')?.status).toBe('down');
  });

  it('is up when the default tmux substrate is available and the DB is reachable', () => {
    const health = buildConductorHealth({
      config: cfg,
      substrates: [up('tmux_worktree')],
      repositoryAvailable: true,
      liveConnections: 3,
    });
    expect(health.status).toBe('up');
    expect(health.degraded).toBe(false);
    expect(health.detail?.liveConnections).toBe(3);
    expect(health.engines?.find((e) => e.name === 'workspace-db')?.status).toBe('up');
  });

  it('is degraded when the substrate is up but the DB is unreachable', () => {
    const health = buildConductorHealth({
      config: cfg,
      substrates: [up('tmux_worktree')],
      repositoryAvailable: false,
      liveConnections: 0,
    });
    expect(health.status).toBe('degraded');
    expect(health.degraded).toBe(true);
    expect(health.reason).toMatch(/workspace-db/);
  });

  it('is degraded when only an opt-in substrate (not tmux) is available', () => {
    const health = buildConductorHealth({
      config: cfg,
      substrates: [up('daytona'), down('tmux_worktree', 'not wired')],
      repositoryAvailable: true,
      liveConnections: 0,
    });
    expect(health.status).toBe('degraded');
  });
});
