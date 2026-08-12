/**
 * Substrate registry + truthful availability.
 *
 * Proves: a wired substrate is reported `available:true` ONLY when its own
 * `available()` probe says so; every unwired known id is reported `available:false`
 * WITH a truthful reason (never hidden, never a faked availability); creds-gated
 * ids surface the missing-cred reason; and a substrate that is REGISTERED but whose
 * probe resolves `available:false` is reported down (registration is NOT availability).
 */
import { describe, it, expect } from 'vitest';
import { createConductorRegistry } from './adapters/substrate-registry.adapter.js';
import { sliceConductorConfig } from './config.js';
import { makeConfig, FakeSubstrate } from './__fixtures__/harness.js';

const cfg = () => sliceConductorConfig(makeConfig());

describe('conductor substrate registry', () => {
  it('reports every known substrate unavailable (with a reason) when none are wired', async () => {
    const registry = createConductorRegistry({ config: cfg() });
    const availability = await registry.availability();

    expect(availability.map(a => a.id).sort()).toEqual([
      'acp',
      'daytona',
      'herdr',
      'in_process',
      'ssh',
      'tmux_worktree',
    ]);
    for (const entry of availability) {
      expect(entry.available).toBe(false);
      expect(entry.reason).toBeTruthy();
    }
  });

  it('reports a wired substrate available:true and leaves the rest truthfully down', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
    });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('tmux_worktree')?.available).toBe(true);
    expect(byId.get('tmux_worktree')?.reason).toBeUndefined();
    expect(byId.get('daytona')?.available).toBe(false);
    expect(byId.get('ssh')?.available).toBe(false);
  });

  it('reports a REGISTERED substrate down when its own probe resolves unavailable (registration is not availability)', async () => {
    // The bug this guards: `acp` is bootstrapped/registered even when `claude-code-acp`
    // is absent. Its `available()` probe resolves `{available:false}` — the reporter
    // MUST reflect that truthfully instead of a blanket `available:true`.
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [
        new FakeSubstrate({
          id: 'acp',
          available: false,
          unavailableReason: 'missing: claude-code-acp',
        }),
        new FakeSubstrate({ id: 'tmux_worktree', available: true }),
      ],
    });

    // Both ids ARE registered in the engine registry...
    expect(registry.registry.list()).toEqual(
      expect.arrayContaining(['acp', 'tmux_worktree']),
    );

    // ...but availability follows the real probe, not registration.
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('acp')?.available).toBe(false);
    expect(byId.get('acp')?.reason).toMatch(/missing: claude-code-acp/);
    expect(byId.get('tmux_worktree')?.available).toBe(true);
    expect(byId.get('tmux_worktree')?.reason).toBeUndefined();
  });

  it('degrades truthfully when a substrate probe throws (down + reason, never crashes the endpoint)', async () => {
    const throwing = new FakeSubstrate({ id: 'in_process' });
    // Force the probe to reject; the reporter must isolate it, not blow up.
    (throwing as unknown as { available: () => Promise<never> }).available = () =>
      Promise.reject(new Error('probe exploded'));

    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [throwing, new FakeSubstrate({ id: 'tmux_worktree' })],
    });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('in_process')?.available).toBe(false);
    expect(byId.get('in_process')?.reason).toMatch(/probe exploded/);
    // The healthy substrate is still reported truthfully.
    expect(byId.get('tmux_worktree')?.available).toBe(true);
  });

  it('reports the herdr id unavailable with its opt-in reason when unwired', async () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    // `herdr` is a KNOWN substrate id: listed, truthfully down with a reason.
    expect(byId.has('herdr')).toBe(true);
    expect(byId.get('herdr')?.available).toBe(false);
    expect(byId.get('herdr')?.reason).toMatch(/herdr/);
    expect(byId.get('herdr')?.reason).toMatch(/opt-in/);
  });

  it('reports the herdr substrate available when wired and its probe passes', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [
        new FakeSubstrate({ id: 'herdr', available: true }),
        new FakeSubstrate({ id: 'tmux_worktree', available: true }),
      ],
    });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('herdr')?.available).toBe(true);
    expect(byId.get('herdr')?.reason).toBeUndefined();
  });

  it('reports a wired-but-down herdr substrate with the probe reason (daemon absent)', async () => {
    const registry = createConductorRegistry({
      config: cfg(),
      substrates: [
        new FakeSubstrate({
          id: 'herdr',
          available: false,
          unavailableReason: 'herdr unavailable (ECONNREFUSED)',
        }),
      ],
    });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('herdr')?.available).toBe(false);
    expect(byId.get('herdr')?.reason).toMatch(/ECONNREFUSED/);
  });

  it('surfaces the missing-cred reason for creds-gated substrates', async () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    expect(byId.get('daytona')?.reason).toMatch(/DAYTONA_API_KEY/);
    expect(byId.get('ssh')?.reason).toMatch(/SSH/);
  });

  it('surfaces the effective pinned tmux binary on the tmux_worktree entry (config pin)', async () => {
    const registry = createConductorRegistry({
      config: sliceConductorConfig(makeConfig(), {
        tmuxBin: '/vendored/recoder/tmux',
      }),
    });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

    // The pin is a config fact independent of wiring — present even when unavailable.
    expect(byId.get('tmux_worktree')?.tmuxBin).toBe('/vendored/recoder/tmux');
    // Only the tmux entry carries a binary; the rest never guess one.
    expect(byId.get('daytona')?.tmuxBin).toBeUndefined();
    expect(byId.get('ssh')?.tmuxBin).toBeUndefined();
    expect(byId.get('in_process')?.tmuxBin).toBeUndefined();
  });

  it('falls back to PATH `tmux` on the tmux_worktree entry when no pin is configured', async () => {
    const registry = createConductorRegistry({ config: cfg() });
    const byId = new Map((await registry.availability()).map(a => [a.id, a]));

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
