/**
 * Steer path — the governed send-keys write (`workspace.steer`).
 *
 * Proves: an allowed steer on a running workspace DELIVERS the user's text
 * through the wired transport (addressed by the workspace's live sessionName,
 * submit defaulting true) and seals an audit; a gate deny BLOCKS delivery (the
 * transport is never touched, no audit); with no transport wired or no live
 * session handle the steer is refused truthfully (never faked into a success);
 * a transport delivery fault surfaces as `ok:false` with the transport's reason.
 */
import { describe, it, expect } from 'vitest';
import type { SubstrateHandle, SubstrateLaunchInput } from '@recoder/substrate';
import {
  composeConductor,
  FakeSubstrate,
  FakeSteerTransport,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from './__fixtures__/harness.js';

/** A substrate whose launch handle carries NO sessionName (nothing to steer into). */
class SessionlessSubstrate extends FakeSubstrate {
  override async launch(input: SubstrateLaunchInput): Promise<SubstrateHandle> {
    const handle = await super.launch(input);
    return { ref: handle.ref, ...(handle.worktreePath ? { worktreePath: handle.worktreePath } : {}) };
  }
}

describe('conductor steer path', () => {
  it('delivers the steer text into the live session and seals an audit', async () => {
    const gate = makeGate('allow');
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(created.ok).toBe(true);
    const workspace = created.value!;

    const result = await module.steerWorkspace(
      { workspaceId: workspace.workspaceId, keys: 'try the other branch' },
      makePrincipal('user_bob'),
    );

    expect(result.ok).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toEqual({
      substrate: workspace.substrate,
      sessionName: workspace.sessionName,
      keys: 'try the other branch',
      submit: true, // defaults to submit at the module seam
    });
    const audit = gate.audits.find((a) => a.action === 'workspace.steer');
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe('user_bob');
    expect(audit?.effect).toBe('allow');
  });

  it('honours submit:false (text injected without a trailing Enter)', async () => {
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: 'partial input', submit: false },
      makePrincipal(),
    );

    expect(result.ok).toBe(true);
    expect(transport.sent[0]?.submit).toBe(false);
  });

  it('blocks the steer when the gate denies — the transport is never touched', async () => {
    const gate = makeGate('allow');
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    gate.setEffect('deny');

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: 'do something risky' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(result.reason).toBeTruthy();
    expect(transport.sent).toHaveLength(0);
    // No audit for a blocked-before-write (matches the other governed writes).
    expect(gate.audits.some((a) => a.action === 'workspace.steer')).toBe(false);
  });

  it('refuses truthfully when no live substrate transport is wired', async () => {
    const { module } = composeConductor({ substrates: [new FakeSubstrate()] });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: 'hello' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/substrate transport/);
  });

  it('refuses truthfully when the workspace has no live session handle', async () => {
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new SessionlessSubstrate()],
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(created.ok).toBe(true);

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: 'hello' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no live session handle/);
    expect(transport.sent).toHaveLength(0);
  });

  it('refuses a steer at an unknown workspace', async () => {
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      steerTransport: new FakeSteerTransport(),
    });

    const result = await module.steerWorkspace(
      { workspaceId: 'ws_missing', keys: 'hello' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/not found/);
  });

  it('refuses empty steer keys (nothing truthful to deliver)', async () => {
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: '   ' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/non-empty/);
    expect(transport.sent).toHaveLength(0);
  });

  it('surfaces a transport delivery fault as ok:false with the truthful reason', async () => {
    const gate = makeGate('allow');
    const transport = new FakeSteerTransport();
    const { module } = composeConductor({
      substrates: [new FakeSubstrate()],
      gate,
      steerTransport: transport,
    });
    const created = await module.createWorkspace(makeCreateInput(), makePrincipal());
    transport.fail('steer target session not found: recoder-ws_1');

    const result = await module.steerWorkspace(
      { workspaceId: created.value!.workspaceId, keys: 'hello' },
      makePrincipal(),
    );

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/session not found/);
    // A failed delivery is never sealed as a performed write.
    expect(gate.audits.some((a) => a.action === 'workspace.steer')).toBe(false);
  });
});
