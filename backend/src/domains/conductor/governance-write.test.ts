/**
 * Governance write seam — every conductor mutation passes `decide` BEFORE it
 * happens and `recordAudit` AFTER.
 *
 * Proves: a denied `decide` BLOCKS the write (no workspace created, `ok:false`,
 * the verdict reason surfaced) and is never faked into a success; an allowed
 * write is performed AND sealed into the audit chain; reconcile is gated the same
 * way. The gate is asked before the engine runs (deny ⇒ engine never launches).
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makeGate,
  makePrincipal,
} from './__fixtures__/harness.js';

describe('conductor governance write seam', () => {
  it('blocks createWorkspace when the gate denies (never fabricates a launch)', async () => {
    const gate = makeGate('deny');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(result.reason).toBeTruthy();
    // The write never happened: no record, and NO audit for a blocked-before-write.
    expect(await module.listWorkspaces()).toHaveLength(0);
    expect(gate.decisions).toContain('workspace.create');
    expect(gate.audits).toHaveLength(0);
  });

  it('performs + seals an allowed createWorkspace into the audit chain', async () => {
    const gate = makeGate('allow');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal('user_bob'));

    expect(result.ok).toBe(true);
    expect(gate.decisions).toContain('workspace.create');
    const audit = gate.audits.find((a) => a.action === 'workspace.create');
    expect(audit).toBeDefined();
    expect(audit?.actorId).toBe('user_bob');
    expect(audit?.resource).toBe('conductor');
    expect(audit?.effect).toBe('allow');
  });

  it('blocks reconcile when the gate denies', async () => {
    const gate = makeGate('deny');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });

    const result = await module.reconcile(makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('deny');
    expect(gate.decisions).toContain('workspace.reconcile');
  });

  it('needs_approval is treated as not-allowed (the write does not proceed)', async () => {
    const gate = makeGate('needs_approval');
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], gate });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('needs_approval');
    expect(await module.listWorkspaces()).toHaveLength(0);
  });
});
