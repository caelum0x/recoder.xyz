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

    expect(availability.map(a => a.id).sort()).toEqual([
      'acp',
      'daytona',
      'in_process',
      'ssh',
      'tmux_worktree',
    ]);
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
    const byId = new Map(registry.availability().map(a => [a.id, a]));

    expect(byId.get('tmux_worktree')?.available).toBe(true);
    expect(byId.get('tmux_worktree')?.reason).toBeUndefined();
    expect(byId.get('daytona')?.available).toBe(false);
    expect(byId.get('ssh')?.available).toBe(false);
  });

  it('surfaces the missing-cred reason for creds-gated substrates', () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map(registry.availability().map(a => [a.id, a]));

    expect(byId.get('daytona')?.reason).toMatch(/DAYTONA_API_KEY/);
    expect(byId.get('ssh')?.reason).toMatch(/SSH/);
  });

  it('surfaces the effective pinned tmux binary on the tmux_worktree entry (config pin)', () => {
    const registry = createConductorRegistry({
      config: sliceConductorConfig(makeConfig(), {
        tmuxBin: '/vendored/recoder/tmux',
      }),
    });
    const byId = new Map(registry.availability().map(a => [a.id, a]));

    // The pin is a config fact independent of wiring — present even when unavailable.
    expect(byId.get('tmux_worktree')?.tmuxBin).toBe('/vendored/recoder/tmux');
    // Only the tmux entry carries a binary; the rest never guess one.
    expect(byId.get('daytona')?.tmuxBin).toBeUndefined();
    expect(byId.get('ssh')?.tmuxBin).toBeUndefined();
    expect(byId.get('in_process')?.tmuxBin).toBeUndefined();
  });

  it('falls back to PATH `tmux` on the tmux_worktree entry when no pin is configured', () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map(registry.availability().map(a => [a.id, a]));

    // `tmuxBin: null` in config ⇒ the truthful effective binary is PATH `tmux`.
    expect(byId.get('tmux_worktree')?.tmuxBin).toBe('tmux');
  });

  it('exposes the narrow engine registry with the wired ids listed', () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    });
    expect(registry.registry.list()).toContain('tmux_worktree');
  });
});
