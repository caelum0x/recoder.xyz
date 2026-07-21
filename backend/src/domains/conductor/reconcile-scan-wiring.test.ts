/**
 * Reconcile scan wiring — regression lock for the DROPPED tmux introspect seam
 * (design §8.1 item 25).
 *
 * Bootstrap builds `conductorSubstrateScan` from `engines.tmuxIntrospect()` and
 * injects it as `deps.substrateScan`, but `conductor-module.ts` used to call
 * `createSubstrateScan()` with NO argument — silently dropping the injected dep,
 * so `reconcile()` could never see the live `recoder-*` sessions on the box and
 * orphaned-session GC never fired after a restart. The one-line fix threads the
 * dep: `createSubstrateScan(deps.substrateScan ?? {})`.
 *
 * These tests prove the two ends of that seam:
 *  1. an injected scan reporting live sessions IS consumed — an orphaned live
 *     session (no matching workspace record) surfaces as `orphanedSessions`.
 *  2. no scan injected ⇒ the truthful empty default is preserved (unchanged
 *     degrade — the box looks empty, never fabricated live work).
 */
import { describe, it, expect } from 'vitest';
import { createWorkspaceRepository } from './adapters/workspace-repository.adapter.js';
import { composeConductor, FakeSubstrate, makeExecutor, makePrincipal } from './__fixtures__/harness.js';

describe('conductor reconcile scan wiring (item 25 regression)', () => {
  it('consumes the injected substrateScan — an orphaned live session is flagged', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });

    // The injected scan reports the REAL box: two live recoder-* sessions, but no
    // workspace record backs `recoder-b` ⇒ reconcile must flag it as orphaned.
    let liveScanned = false;
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
      substrateScan: {
        async listLiveSessions() {
          liveScanned = true;
          return ['recoder-a', 'recoder-b'];
        },
      },
    });

    const result = await module.reconcile(makePrincipal());

    expect(result.ok).toBe(true);
    // Pre-fix, the no-arg `createSubstrateScan()` dropped the dep and this list
    // was always empty; the fix threads the injected scan so the box is seen.
    expect(liveScanned).toBe(true);
    expect(result.value?.orphanedSessions).toEqual(
      expect.arrayContaining(['recoder-a', 'recoder-b']),
    );
  });

  it('degrades truthfully with no scan injected (empty box, unchanged)', async () => {
    const repository = createWorkspaceRepository({ executor: makeExecutor(false) });
    const { module } = composeConductor({
      substrates: [new FakeSubstrate({ id: 'tmux_worktree' })],
      repository,
    });

    const result = await module.reconcile(makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.orphanedSessions).toHaveLength(0);
    expect(result.value?.checkedAt).toBeTruthy();
  });
});
