/**
 * `advanceWorkspaceState` — the governed lifecycle step (`POST
 * /workspaces/:id/advance`, review → merge flow).
 *
 * Proves: an allowed legal step advances + audits; the review loop
 * (running → awaiting_review → changes_requested → running) walks cleanly; an
 * ILLEGAL step is refused by the canonical state machine with the state
 * unchanged (never forced); evidence-bearing targets (merged/archived) are
 * refused (their dedicated edges own them); a denied gate blocks everything.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from './__fixtures__/harness.js';

async function createRunning(module: ReturnType<typeof composeConductor>['module']) {
  const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
  expect(created.value?.state).toBe('running');
  return created.value!;
}

describe('conductor advanceWorkspaceState', () => {
  it('advances running → awaiting_review and seals the audit', async () => {
    const gate = makeGate('allow');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });
    const workspace = await createRunning(module);

    const result = await module.advanceWorkspaceState(
      workspace.workspaceId,
      'awaiting_review',
      makePrincipal('user_reviewer'),
    );

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('awaiting_review');
    const audit = gate.audits.find((a) => a.action === 'workspace.advance');
    expect(audit?.payload).toMatchObject({
      workspaceId: workspace.workspaceId,
      from: 'running',
      to: 'awaiting_review',
    });
  });

  it('walks the full review loop: awaiting_review → changes_requested → running', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunning(module);
    const principal = makePrincipal();

    await module.advanceWorkspaceState(workspace.workspaceId, 'awaiting_review', principal);
    const changes = await module.advanceWorkspaceState(
      workspace.workspaceId,
      'changes_requested',
      principal,
    );
    const rerun = await module.advanceWorkspaceState(workspace.workspaceId, 'running', principal);

    expect(changes.ok).toBe(true);
    expect(changes.value?.state).toBe('changes_requested');
    expect(rerun.ok).toBe(true);
    expect(rerun.value?.state).toBe('running');
  });

  it('refuses an ILLEGAL step truthfully (running → ready) — state unchanged', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunning(module);

    const result = await module.advanceWorkspaceState(workspace.workspaceId, 'ready', makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Invalid workspace transition');
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
  });

  it('refuses evidence-bearing targets (merged) — /merge owns real delivery', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const workspace = await createRunning(module);

    const result = await module.advanceWorkspaceState(workspace.workspaceId, 'merged', makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not an advance target');
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
  });

  it('refuses cancellation via advance — /stop owns session teardown + lock release', async () => {
    // Advancing straight to `cancelled` would flip the record while the live
    // substrate session keeps running (zombie agent) and the write-lock stays
    // held. Cancellation must flow ONLY through stopWorkspace, so `cancelled`
    // is not an advance target: refuse truthfully, leave the run untouched.
    const substrate = new FakeSubstrate();
    const { module } = composeConductor({ substrates: [substrate] });
    const workspace = await createRunning(module);

    const result = await module.advanceWorkspaceState(
      workspace.workspaceId,
      'cancelled',
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not an advance target');
    // State of record is unchanged — never a false `cancelled`.
    const after = await module.getWorkspace(workspace.workspaceId);
    expect(after?.state).toBe('running');
    // The live session was NOT torn down (advance bypassed no teardown).
    expect(
      await substrate.alive({ ref: after!.sessionName!, sessionName: after!.sessionName }),
    ).toBe(true);
  });

  it('blocks the advance when the gate denies (no transition, no audit)', async () => {
    const gate = makeGate('allow');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });
    const workspace = await createRunning(module);

    gate.setEffect('deny');
    const result = await module.advanceWorkspaceState(
      workspace.workspaceId,
      'awaiting_review',
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect((await module.getWorkspace(workspace.workspaceId))?.state).toBe('running');
    expect(gate.audits.some((a) => a.action === 'workspace.advance')).toBe(false);
  });

  it('refuses truthfully for an unknown workspace', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const result = await module.advanceWorkspaceState('ws_missing', 'awaiting_review', makePrincipal());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('not found');
  });
});
