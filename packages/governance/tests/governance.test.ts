import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Governance } from '../src/governance';
import { createGovernanceRequest } from '../src/domain/governance-request';
import { makeAgent, makeTask, makeLock } from './fixtures';

describe('Governance.decide() fused pipeline', () => {
  it('denies a forbidden-path write and records it in the audit chain', async () => {
    const gov = await Governance.create();
    const req = createGovernanceRequest({
      actor: makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow', allowShell: true } }),
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/auth/login.ts' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'deny');
    assert.equal(verdict.routing.routable, false);
    assert.ok(verdict.auditHash);
    assert.equal(verdict.degraded, true);
    // audit chain verifies
    assert.equal(gov.verifyAudit().ok, true);
  });

  it('allows an in-bounds write inside the lock envelope', async () => {
    const gov = await Governance.create();
    const actor = makeAgent({ permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow' } });
    const req = createGovernanceRequest({
      actor,
      task: makeTask(),
      action: 'file.write',
      target: { path: 'src/components/x.ts' },
      workLocks: [makeLock({ pathGlob: 'src/**' })],
      context: { workspaceRoot: process.cwd() },
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'allow');
    assert.equal(verdict.routing.routable, true);
  });

  it('enforcement overrides an allow into a deny when mode is insufficient', async () => {
    const gov = await Governance.create();
    // Agent allows files-by-default at the policy layer but is read-only by mode
    // signals (no shell, write-lock required) -> enforcement denies the write.
    const actor = makeAgent({
      permissions: { ...makeAgent().permissions, defaultFileEffect: 'allow', writeLockRequired: false },
    });
    const req = createGovernanceRequest({
      actor,
      task: makeTask(),
      action: 'file.write',
      target: { path: '/etc/passwd' }, // absolute path that escapes the workspace
      context: { workspaceRoot: '/some/workspace' },
    });
    const verdict = await gov.decide(req);
    // policy allows, but enforcement (workspace boundary) denies the escape.
    assert.equal(verdict.effect, 'deny');
    assert.ok(verdict.enforcement);
    if (verdict.enforcement) assert.equal(verdict.enforcement.outcome, 'denied');
  });

  it('a needs_approval policy effect produces a needs_approval verdict', async () => {
    const gov = await Governance.create();
    const req = createGovernanceRequest({
      actor: makeAgent(),
      task: makeTask(),
      action: 'branch.push',
      target: {},
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'needs_approval');
  });

  it('a high-tier action requires approval even when policy allows', async () => {
    const gov = await Governance.create();
    const actor = makeAgent({ permissions: { ...makeAgent().permissions, allowGitWrite: true, allowPrCreation: true } });
    // pr.create is allowed by policy (allowPrCreation true) but is intrinsically
    // a high-tier action -> tier policy forces needs_approval.
    const req = createGovernanceRequest({
      actor,
      task: makeTask(),
      action: 'pr.create',
      target: {},
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'needs_approval');
    assert.equal(verdict.tier, 'high');
  });

  it('auto-approver clears a high-tier action when autonomous and within an elevated ceiling', async () => {
    const gov = await Governance.create({ autoApprove: { enabled: true, ceiling: 'high' } });
    const actor = makeAgent({ permissions: { ...makeAgent().permissions, allowGitWrite: true, allowPrCreation: true } });
    const req = createGovernanceRequest({
      actor,
      task: makeTask(),
      action: 'pr.create',
      target: {},
      context: { autonomous: true },
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'allow');
  });

  it('never silently allows on a hard policy deny (memory.write)', async () => {
    const gov = await Governance.create();
    const req = createGovernanceRequest({
      actor: makeAgent(),
      task: makeTask(),
      action: 'memory.write',
      target: {},
    });
    const verdict = await gov.decide(req);
    assert.equal(verdict.effect, 'deny');
  });

  it('reports truthful degraded health (daemon deferred)', async () => {
    const gov = await Governance.create();
    const h = gov.health();
    assert.equal(h.status, 'degraded');
    assert.equal(h.daemon, 'unavailable');
    assert.equal(h.auditOk, true);
  });

  it('records every decision so the audit chain grows and stays valid', async () => {
    const gov = await Governance.create();
    for (let i = 0; i < 5; i += 1) {
      await gov.decide(
        createGovernanceRequest({ actor: makeAgent(), task: makeTask(), action: 'file.read', target: { path: `src/f${i}.ts` } }),
      );
    }
    assert.equal(gov.auditEntries().length, 5);
    assert.equal(gov.verifyAudit().ok, true);
  });

  it('implements the agent-os PolicyEnginePort evaluate() surface', async () => {
    const gov = await Governance.create();
    const decision = gov.evaluate({
      actor: makeAgent(),
      task: makeTask(),
      action: 'file.read',
      target: { path: 'src/x.ts' },
    });
    assert.equal(decision.effect, 'allow');
    assert.equal(decision.action, 'file.read');
  });
});

describe('Governance approvals + audit integration', () => {
  it('resolving an approval records an audit entry', async () => {
    const gov = await Governance.create();
    const { approval, awaited } = gov.requestApproval({
      taskId: 'task-1',
      reason: 'risky',
      requestedBy: 'agent-1',
      tier: 'high',
    });
    const before = gov.auditEntries().length;
    gov.resolveApproval(approval.approvalId, 'approved', 'human-1');
    await awaited;
    assert.equal(gov.auditEntries().length, before + 1);
    assert.equal(gov.verifyAudit().ok, true);
  });
});
