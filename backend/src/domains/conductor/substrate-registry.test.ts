/**
 * Substrate registry + truthful availability.
 *
 * Proves: a wired substrate is reported `available:true`; every unwired known id
 * is reported `available:false` WITH a truthful reason (never hidden, never a
 * faked availability); creds-gated ids surface the missing-cred reason.
 */
import { describe, it, expect } from 'vitest';
import { createConductorRegistry } from './adapters/substrate-registry.adapter.js';
import { sliceConductorConfig } from './config.js';
import { makeConfig, FakeSubstrate } from './__fixtures__/harness.js';

const cfg = () => sliceConductorConfig(makeConfig());

describe('conductor substrate registry', () => {
  it('reports every known substrate unavailable (with a reason) when none are wired', () => {
    const registry = createConductorRegistry({ config: cfg() });
    const availability = registry.availability();

    expect(availability.map((a) => a.id).sort()).toEqual(['daytona', 'in_process', 'ssh', 'tmux_worktree']);
    for (const entry of availability) {
      expect(entry.available).toBe(false);
      expect(entry.reason).toBeTruthy();
    }
  });

  it('reports a wired substrate available:true and leaves the rest truthfully down', () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    });
    const byId = new Map(registry.availability().map((a) => [a.id, a]));

    expect(byId.get('tmux_worktree')?.available).toBe(true);
    expect(byId.get('tmux_worktree')?.reason).toBeUndefined();
    expect(byId.get('daytona')?.available).toBe(false);
    expect(byId.get('ssh')?.available).toBe(false);
  });

  it('surfaces the missing-cred reason for creds-gated substrates', () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map(registry.availability().map((a) => [a.id, a]));

    expect(byId.get('daytona')?.reason).toMatch(/DAYTONA_API_KEY/);
    expect(byId.get('ssh')?.reason).toMatch(/SSH/);
  });

  it('exposes the narrow engine registry with the wired ids listed', () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    });
    expect(registry.registry.list()).toContain('tmux_worktree');
  });
});
