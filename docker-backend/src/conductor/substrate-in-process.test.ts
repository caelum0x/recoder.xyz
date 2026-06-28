/**
 * Tests for the in_process Conductor substrate — proving `@recoder/runtime` is wired
 * into the conductor substrate registry ADDITIVELY (alongside tmux_worktree + daytona,
 * never replacing them) and is resolvable from product code.
 *
 * These assert the registration/wiring + truthful availability, not a full agent run
 * (that needs BYOK keys + a repo). The launch path itself is exercised by the runtime
 * engine, which is unit-tested in @recoder/runtime.
 */
import { describe, it, expect } from 'vitest';
import {
  registerInProcessSubstrate,
  inProcessRunCount,
} from './substrate-in-process.js';
import { registerTmuxSubstrate } from './substrate-tmux.js';
import { registerDaytonaSubstrate } from './substrate-daytona.js';
import { getSubstrate, listSubstrates } from './substrate.js';

describe('in_process substrate wiring (@recoder/runtime)', () => {
  it('registers and resolves the in_process substrate from product code (not runtime_unavailable)', () => {
    registerInProcessSubstrate();

    // Resolvable via the same registry tmux/daytona use — no throw.
    const substrate = getSubstrate('in_process');
    expect(substrate.id).toBe('in_process');
    expect(typeof substrate.launch).toBe('function');
    expect(typeof substrate.diff).toBe('function');
    expect(typeof substrate.teardown).toBe('function');
  });

  it('is registered ALONGSIDE tmux_worktree + daytona (additive, never replacing)', () => {
    registerTmuxSubstrate();
    registerDaytonaSubstrate();
    registerInProcessSubstrate();

    const ids = listSubstrates();
    expect(ids).toContain('tmux_worktree');
    expect(ids).toContain('daytona');
    expect(ids).toContain('in_process');

    // The proven tmux substrate is untouched and still resolves.
    expect(getSubstrate('tmux_worktree').id).toBe('tmux_worktree');
  });

  it('reports truthful availability backed by the real runtime engine + git', async () => {
    registerInProcessSubstrate();
    const substrate = getSubstrate('in_process');

    const status = await substrate.available();
    // The shape is always truthful: a boolean plus an optional reason when unavailable.
    expect(typeof status.available).toBe('boolean');
    if (!status.available) {
      expect(typeof status.reason).toBe('string');
      expect(status.reason!.length).toBeGreaterThan(0);
    }
  });

  it('starts with zero live in-process runs (no leaked state)', () => {
    expect(inProcessRunCount()).toBe(0);
  });

  it('exitCode is null for an unknown handle (handle gone, never fabricated 0)', async () => {
    registerInProcessSubstrate();
    const substrate = getSubstrate('in_process');
    const code = await substrate.exitCode!({ ref: 'no-such-workspace' });
    expect(code).toBeNull();
  });
});
