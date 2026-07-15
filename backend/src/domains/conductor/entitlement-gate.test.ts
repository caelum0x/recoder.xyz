/**
 * Conductor pre-dispatch entitlement quota gate.
 *
 * Proves the OPTIONAL billing gate seam: when a denying gate is wired,
 * `createWorkspace` is BLOCKED before the substrate launches (truthful reason, no
 * fabricated success); when NO gate is wired the conductor degrades OPEN and the
 * create proceeds; a wired allow gate proceeds too. A gate EXCEPTION (metering
 * hiccup) degrades open rather than blocking a policy-allowed launch.
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import type { EntitlementGate } from './ports/entitlement-gate.port.js';

/** A minimal fake gate: only `check` is exercised by the conductor. */
function gateWithCheck(check: EntitlementGate['check']): EntitlementGate {
  return { check } as unknown as EntitlementGate;
}

const substrates = () => [new FakeSubstrate({ id: 'tmux_worktree' })];

describe('conductor entitlement quota gate', () => {
  it('BLOCKS a create when the gate denies the run quota (never launches)', async () => {
    const { module } = composeConductor({ substrates: substrates() });
    module.setEntitlementGate(
      gateWithCheck(async () => ({
        allowed: false,
        plan: 'free',
        reason: 'quota_exceeded',
        message: 'agent_run quota exhausted',
      })),
    );

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/quota/i);
    // The write was refused pre-dispatch: no workspace persisted.
    expect(await module.listWorkspaces()).toHaveLength(0);
  });

  it('PROCEEDS when no gate is wired (degrade open)', async () => {
    const { module } = composeConductor({ substrates: substrates() });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
  });

  it('PROCEEDS when a wired gate allows the run quota', async () => {
    const { module } = composeConductor({ substrates: substrates() });
    module.setEntitlementGate(
      gateWithCheck(async () => ({ allowed: true, plan: 'pro' })),
    );

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
  });

  it('degrades OPEN when the gate throws (metering hiccup must not block a launch)', async () => {
    const { module } = composeConductor({ substrates: substrates() });
    module.setEntitlementGate(
      gateWithCheck(async () => {
        throw new Error('metering repo down');
      }),
    );

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    expect(result.value?.state).toBe('running');
  });
});
