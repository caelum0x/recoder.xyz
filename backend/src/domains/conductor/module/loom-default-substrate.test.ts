/**
 * Loom as THE default CLI substrate (herdr pillar #1 "default runtime").
 *
 * NO FALLBACK, done right: an unqualified CLI launch rides the durable always-on
 * Loom herd — bootstrap injects `defaultSubstrate: 'loom'`. There is deliberately
 * no availability probe and no silent tmux degradation: a Loom that cannot come up
 * makes the launch fail LOUD (the loom substrate surfaces the real error). The
 * invariants pinned here:
 *   - production (`overrides.defaultSubstrate = 'loom'`) → an omitted `input.substrate`
 *     resolves to `loom`;
 *   - a caller's explicit `input.substrate` (even `tmux_worktree`) ALWAYS wins;
 *   - UNWIRED (dev/test — no override) stays byte-identical `tmux_worktree`;
 *   - the config slice maps the override truthfully.
 */
import { describe, it, expect } from 'vitest';

import {
  FakeSubstrate,
  composeConductor,
  makeCreateInput,
  makePrincipal,
  type ComposeOptions,
} from '../__fixtures__/harness.js';
import { sliceConductorConfig } from '../config.js';
import { makeConfig } from '../__fixtures__/harness.js';

/** Both substrates a CLI-default launch can resolve onto. */
const CLI_SUBSTRATES = [
  new FakeSubstrate({ id: 'tmux_worktree' }),
  new FakeSubstrate({ id: 'loom' }),
];

function compose(options: Partial<ComposeOptions> = {}) {
  return composeConductor({ substrates: CLI_SUBSTRATES, ...options });
}

/** A create input with `substrate` OMITTED — the default-selection path. */
function inputWithoutSubstrate(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const { substrate: _substrate, ...rest } = makeCreateInput(overrides);
  return rest;
}

describe('conductor loom default substrate (herdr pillar #1, no fallback)', () => {
  it('DEFAULTS to loom when bootstrap injected defaultSubstrate=loom and no substrate is requested', async () => {
    const { module } = compose({ overrides: { defaultSubstrate: 'loom' } });

    const result = await module.createWorkspace(
      inputWithoutSubstrate() as never,
      makePrincipal()
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.substrate).toBe('loom');
  });

  it('is byte-identical to today (tmux_worktree) when no override is wired (dev/test)', async () => {
    const { module } = compose();

    const result = await module.createWorkspace(
      inputWithoutSubstrate() as never,
      makePrincipal()
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.substrate).toBe('tmux_worktree');
  });

  it('honors an explicit input.substrate=tmux_worktree even when the default is loom (caller wins)', async () => {
    const { module } = compose({ overrides: { defaultSubstrate: 'loom' } });

    const result = await module.createWorkspace(
      makeCreateInput({ substrate: 'tmux_worktree' }) as never,
      makePrincipal()
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.substrate).toBe('tmux_worktree');
  });

  it('passes through an explicit input.substrate=loom (unchanged caller-wins)', async () => {
    const { module } = compose();

    const result = await module.createWorkspace(
      makeCreateInput({ substrate: 'loom' }) as never,
      makePrincipal()
    );

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.substrate).toBe('loom');
  });
});

describe('sliceConductorConfig defaultSubstrate', () => {
  it('injects the override verbatim (production → loom)', () => {
    const cfg = sliceConductorConfig(makeConfig(), { defaultSubstrate: 'loom' });
    expect(cfg.defaultSubstrate).toBe('loom');
  });

  it('degrades to tmux_worktree when unset (no runtime fallback — just the dev/test default)', () => {
    const cfg = sliceConductorConfig(makeConfig());
    expect(cfg.defaultSubstrate).toBe('tmux_worktree');
  });
});
