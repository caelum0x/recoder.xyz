/**
 * resolveSubstrate tests — the DEGRADE-SAFE flip (design §8 / GOAL).
 *
 * A `daytona` choice must run remotely when Daytona is ready, but fall back to
 * the local `tmux_worktree` substrate when it is not — and NEVER block a launch.
 * It must also stay behavior-preserving: a single-substrate registry and an
 * already-local request behave exactly like `selectSubstrate`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SubstrateRegistry, resolveSubstrate } from '../../src/registry/index.js';
import { SubstrateNotRegisteredError } from '../../src/errors/index.js';
import { FakeSubstrate } from '../helpers/fake-substrate.ts';

test('honors daytona when it is available (no downgrade)', async () => {
  const registry = new SubstrateRegistry();
  registry.register(new FakeSubstrate({ id: 'tmux_worktree' }));
  const daytona = new FakeSubstrate({ id: 'daytona', available: true });
  registry.register(daytona);

  const resolved = await resolveSubstrate(registry, { substrate: 'daytona' });
  assert.equal(resolved.substrate, daytona);
  assert.equal(resolved.degraded, false);
  assert.equal(resolved.requested, 'daytona');
});

test('degrades daytona → tmux_worktree when daytona is unavailable', async () => {
  const registry = new SubstrateRegistry();
  const tmux = new FakeSubstrate({ id: 'tmux_worktree', available: true });
  registry.register(tmux);
  registry.register(new FakeSubstrate({ id: 'daytona', available: false, unavailableReason: 'no DAYTONA_API_KEY' }));

  const resolved = await resolveSubstrate(registry, { substrate: 'daytona' });
  assert.equal(resolved.substrate, tmux);
  assert.equal(resolved.degraded, true);
  assert.equal(resolved.requested, 'daytona');
  assert.match(resolved.reason ?? '', /no DAYTONA_API_KEY/);
  assert.match(resolved.reason ?? '', /degraded to 'tmux_worktree'/);
});

test('does NOT degrade when the fallback is itself unavailable (stays truthful)', async () => {
  const registry = new SubstrateRegistry();
  registry.register(new FakeSubstrate({ id: 'tmux_worktree', available: false }));
  const daytona = new FakeSubstrate({ id: 'daytona', available: false });
  registry.register(daytona);

  const resolved = await resolveSubstrate(registry, { substrate: 'daytona' });
  // No ready fallback → keep the requested substrate so its own error surfaces.
  assert.equal(resolved.substrate, daytona);
  assert.equal(resolved.degraded, false);
});

test('does NOT degrade when no fallback is registered', async () => {
  const registry = new SubstrateRegistry();
  const daytona = new FakeSubstrate({ id: 'daytona', available: false });
  registry.register(daytona);

  const resolved = await resolveSubstrate(registry, { substrate: 'daytona' });
  assert.equal(resolved.substrate, daytona);
  assert.equal(resolved.degraded, false);
});

test('a local request is honored without probing availability (behavior-preserving)', async () => {
  const registry = new SubstrateRegistry();
  // tmux marked unavailable on purpose; resolving tmux must STILL return tmux
  // (the request already IS the fallback — no downgrade path).
  const tmux = new FakeSubstrate({ id: 'tmux_worktree', available: false });
  registry.register(tmux);

  const resolved = await resolveSubstrate(registry, { substrate: 'tmux_worktree' });
  assert.equal(resolved.substrate, tmux);
  assert.equal(resolved.degraded, false);
});

test('fallback:null disables the downgrade (strict selectSubstrate behavior)', async () => {
  const registry = new SubstrateRegistry();
  registry.register(new FakeSubstrate({ id: 'tmux_worktree', available: true }));
  const daytona = new FakeSubstrate({ id: 'daytona', available: false });
  registry.register(daytona);

  const resolved = await resolveSubstrate(registry, { substrate: 'daytona' }, { fallback: null });
  assert.equal(resolved.substrate, daytona);
  assert.equal(resolved.degraded, false);
});

test('throws SubstrateNotRegisteredError when the requested id is not registered', async () => {
  const registry = new SubstrateRegistry();
  registry.register(new FakeSubstrate({ id: 'tmux_worktree' }));
  await assert.rejects(
    () => resolveSubstrate(registry, { substrate: 'daytona' }),
    (err: unknown) => err instanceof SubstrateNotRegisteredError,
  );
});
