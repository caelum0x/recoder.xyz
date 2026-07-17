/**
 * `stopWorkspace` — the governed graceful stop (`POST /workspaces/:id/stop`).
 *
 * Proves: a denied gate BLOCKS the stop (state unchanged, no audit); an allowed
 * stop transitions running → cancelled with the worktree PRESERVED and the
 * action sealed into the audit chain; a substrate-kill fault refuses truthfully
 * with the state UNCHANGED (never a faked stop); terminal/unknown workspaces
 * refuse truthfully.
 */
import { describe, it, expect } from 'vitest';
import type { SubstrateHandle } from '@recoder/substrate';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from './__fixtures__/harness.js';

class KillFailSubstrate extends FakeSubstrate {
  override async teardown(_handle: SubstrateHandle): Promise<void> {
    throw new Error('tmux kill-session failed');
  }
}

async function createRunning(module: ReturnType<typeof composeConductor>['module']) {
  const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
  expect(created.ok).toBe(true);
  expect(created.value?.state).toBe('running');
  return created.value!;
}

describe('conductor stopWorkspace', () => {
  it('stops a running workspace: cancelled state, worktree preserved, audit sealed', async () => {
    const gate = makeGate('allow');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });
    const workspace = await createRunning(module);

    const result = await module.stopWorkspace(workspace.workspaceId, makePrincipal('user_stopper'));

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('cancelled');
    // Graceful: the isolation (worktree) survives so the work stays reviewable.
    expect(result.value?.worktreePath).toBe(workspace.worktreePath);
    expect(result.value?.metadata?.stoppedBy).toBe('user_stopper');
    const audit = gate.audits.find((a) => a.action === 'workspace.stop');
    expect(audit?.actorId).toBe('user_stopper');
    expect(audit?.payload).toMatchObject({ workspaceId: workspace.workspaceId, from: 'running' });
    // Persisted: the state of record reflects the stop.
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('cancelled');
  });

  it('blocks the stop when the gate denies (state unchanged, no stop audit)', async () => {
    const gate = makeGate('allow');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });
    const workspace = await createRunning(module);

    gate.setEffect('deny');
    const result = await module.stopWorkspace(workspace.workspaceId, makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
    expect(gate.audits.some((a) => a.action === 'workspace.stop')).toBe(false);
  });

  it('refuses truthfully when the substrate kill fails — the state stays running', async () => {
    const { module } = composeConductor({ substrates: [new KillFailSubstrate()] });
    const workspace = await createRunning(module);

    const result = await module.stopWorkspace(workspace.workspaceId, makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('tmux kill-session failed');
    // NEVER a faked stop: the record still says running (the agent may be live).
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
  });

  it('refuses a second stop truthfully (cancelled is not stoppable)', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunning(module);
    await module.stopWorkspace(workspace.workspaceId, makePrincipal());

    const again = await module.stopWorkspace(workspace.workspaceId, makePrincipal());

    expect(again.ok).toBe(false);
    expect(again.reason).toContain('cancelled');
  });

  it('refuses truthfully for an unknown workspace', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.stopWorkspace('ws_missing', makePrincipal());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not found');
  });
});
