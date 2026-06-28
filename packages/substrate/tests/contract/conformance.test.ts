/**
 * Contract conformance suite (design §11).
 *
 * One suite of assertions ANY ConductorSubstrate must pass. Run here against the
 * FakeSubstrate; later stages run the SAME `runConformanceSuite` against the
 * local (real temp git repo, tmux gated) and remote (fake DaytonaClientPort)
 * substrates to prove substrate-agnosticism. Exported so those stages reuse it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ConductorSubstrate, SubstrateLaunchInput } from '../../src/contract/index.js';
import { FakeSubstrate } from '../helpers/fake-substrate.ts';

const launchInput = (workspaceId: string): SubstrateLaunchInput => ({
  workspaceId,
  command: "claude -p 'do the thing' --permission-mode acceptEdits",
  repoPath: '/tmp/repo',
  branch: `recoder/${workspaceId}`,
  baseRef: 'HEAD',
});

/**
 * Assert a substrate satisfies the contract. `factory` returns a fresh substrate
 * per call; `drive` lets a substrate-specific harness finish a run so the
 * liveness/diff assertions can observe completion.
 */
export function runConformanceSuite(
  name: string,
  factory: () => ConductorSubstrate,
  drive: (substrate: ConductorSubstrate, handle: { ref: string }) => Promise<void>,
): void {
  test(`[${name}] exposes a stable id and capabilities`, () => {
    const s = factory();
    assert.ok(typeof s.id === 'string' && s.id.length > 0);
    const caps = s.capabilities();
    assert.equal(typeof caps.remote, 'boolean');
    assert.equal(typeof caps.supportsPty, 'boolean');
    assert.equal(typeof caps.supportsDiff, 'boolean');
  });

  test(`[${name}] available() returns a truthful availability shape`, async () => {
    const s = factory();
    const a = await s.available();
    assert.equal(typeof a.available, 'boolean');
    if (!a.available) assert.equal(typeof a.reason, 'string');
  });

  test(`[${name}] launch() returns a re-derivable handle`, async () => {
    const s = factory();
    const handle = await s.launch(launchInput('ws-launch'));
    assert.ok(handle.ref.length > 0);
  });

  test(`[${name}] capture() returns text while alive, null once gone`, async () => {
    const s = factory();
    const handle = await s.launch(launchInput('ws-capture'));
    const live = await s.capture(handle);
    assert.equal(typeof live, 'string');
    assert.equal(await s.alive(handle), true);
    await s.teardown(handle, { removeIsolation: true });
    const gone = await s.capture(handle);
    assert.equal(gone, null);
  });

  test(`[${name}] alive()/diff() reflect a completed run`, async () => {
    const s = factory();
    const handle = await s.launch(launchInput('ws-complete'));
    await drive(s, handle);
    assert.equal(await s.alive(handle), false);
    const diff = await s.diff(handle, 'HEAD');
    assert.equal(typeof diff.stat, 'string');
    assert.equal(typeof diff.patch, 'string');
    assert.ok(Array.isArray(diff.untracked));
    assert.equal(typeof diff.changedFiles, 'number');
  });

  test(`[${name}] teardown() is idempotent and best-effort`, async () => {
    const s = factory();
    const handle = await s.launch(launchInput('ws-teardown'));
    await s.teardown(handle, { removeIsolation: true });
    await s.teardown(handle, { removeIsolation: true });
    assert.equal(await s.alive(handle), false);
  });
}

// Run the suite against the in-memory fake (the reference implementation).
runConformanceSuite(
  'fake',
  () => new FakeSubstrate(),
  async (substrate, handle) => {
    (substrate as FakeSubstrate).emit(handle.ref, 'done\n', { exitCode: 0 });
  },
);
