/**
 * Pal launch-planning consumer (§4.2 / §8.4) — the conductor consults the
 * OPTIONAL `ConductorPlanPort` (over the engines-owned `planLaunch` facet) on a
 * workspace create, AFTER the governance write-gate allow and BEFORE substrate
 * selection.
 *
 * Proves the single-writer + caller-wins + degrade-truthful contract:
 *  - an explicit caller `runtimeId` is NEVER overridden by pal's advisory runtime;
 *  - pal's `risk`/`approvalRequired` are recorded on the launch audit metadata;
 *  - an ABSENT port ⇒ a byte-identical launch (no pal keys on the audit);
 *  - a THROWING port never fails the launch (degrade to no advisory).
 */
import { describe, it, expect } from 'vitest';
import {
  composeConductor,
  FakeSubstrate,
  makeCreateInput,
  makePrincipal,
} from './__fixtures__/harness.js';
import type { ConductorPlanDecision, ConductorPlanPort } from './ports/plan.port.js';

/** A recording fake plan port that returns a fixed advisory decision. */
function makePlan(decision: ConductorPlanDecision): ConductorPlanPort & { calls: number } {
  return {
    calls: 0,
    plan(_input) {
      this.calls += 1;
      return decision;
    },
  };
}

const PAL_PLAN: ConductorPlanDecision = {
  risk: 'high',
  approvalRequired: true,
  runtimeId: 'openfang', // advisory runtime — must NOT override the caller's pin
  sandboxTier: 'hardened',
  skills: ['git', 'test'],
  toolGrants: ['fs.read'],
  source: 'pal',
  reason: 'high-risk auth change',
};

describe('conductor pal launch-planning consumer', () => {
  it("never overrides an explicit caller runtimeId with pal's advisory runtime", async () => {
    const plan = makePlan(PAL_PLAN);
    const { module } = composeConductor({ substrates: [new FakeSubstrate()], plan });

    const result = await module.createWorkspace(
      makeCreateInput({ runtimeId: 'claude_code' }),
      makePrincipal(),
    );

    expect(result.ok).toBe(true);
    expect(plan.calls).toBe(1);
    // The caller pinned claude_code → a CLI runtime → tmux_worktree; pal's openfang
    // advisory (which would select the in_process substrate) is ignored.
    expect(result.value?.runtimeId).toBe('claude_code');
    expect(result.value?.substrate).toBe('tmux_worktree');
  });

  it("records pal's risk/approvalRequired on the launch audit metadata", async () => {
    const plan = makePlan(PAL_PLAN);
    const { module, gate } = composeConductor({ substrates: [new FakeSubstrate()], plan });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    const audit = gate.audits.find((a) => a.action === 'workspace.create');
    expect(audit).toBeDefined();
    expect(audit?.payload).toMatchObject({
      planRisk: 'high',
      planApprovalRequired: true,
      planSource: 'pal',
    });
  });

  it('absent plan port ⇒ a byte-identical launch (no pal keys on the audit)', async () => {
    const { module, gate } = composeConductor({ substrates: [new FakeSubstrate()] });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    const audit = gate.audits.find((a) => a.action === 'workspace.create');
    expect(audit?.payload).toBeDefined();
    // Byte-identical to today: exactly workspaceId + substrate, no advisory keys.
    expect(Object.keys(audit?.payload ?? {}).sort()).toEqual(['substrate', 'workspaceId']);
  });

  it('a throwing plan port never fails the launch (degrade to no advisory)', async () => {
    const throwingPlan: ConductorPlanPort = {
      plan() {
        throw new Error('pal exploded');
      },
    };
    const { module, gate } = composeConductor({
      substrates: [new FakeSubstrate()],
      plan: throwingPlan,
    });

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());

    expect(result.ok).toBe(true);
    const audit = gate.audits.find((a) => a.action === 'workspace.create');
    // The fault degraded to no advisory: no pal keys leaked onto the audit.
    expect(audit?.payload).not.toHaveProperty('planRisk');
    expect(Object.keys(audit?.payload ?? {}).sort()).toEqual(['substrate', 'workspaceId']);
  });
});
