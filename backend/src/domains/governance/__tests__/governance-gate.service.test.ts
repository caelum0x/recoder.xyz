import { describe, it, expect } from 'vitest';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import type { Principal } from '../../identity/types.js';
import type { GateDecisionContext, KernelVerdict } from '../types.js';
import {
  InMemoryAuditRepository,
  FailingAuditRepository,
  InMemoryApprovalRepository,
  fakeKernel,
  silentLogger,
} from './_fakes.js';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    userId: 'u1',
    scopes: ['write'],
    kind: 'session',
    isAnonymous: false,
    raw: null,
    ...overrides,
  };
}

function ctx(overrides: Partial<GateDecisionContext> = {}): GateDecisionContext {
  return { target: { path: '/repo/a.ts' }, ...overrides };
}

const ALLOW: KernelVerdict = { effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: 'ts' };
const DENY: KernelVerdict = { effect: 'deny', tier: 'high', reason: 'blocked', degraded: false, engine: 'ts' };
const NEEDS: KernelVerdict = { effect: 'needs_approval', tier: 'high', reason: 'gated', degraded: false, engine: 'ts' };
const SYNTHETIC: KernelVerdict = {
  effect: 'deny',
  tier: 'critical',
  reason: 'Governance kernel unavailable — failing closed (deny).',
  degraded: true,
  engine: 'synthetic',
};

function buildGate(verdict: KernelVerdict, opts: { failAudit?: boolean; approvals?: InMemoryApprovalRepository } = {}) {
  const auditRepo = opts.failAudit ? new FailingAuditRepository() : new InMemoryAuditRepository();
  const audit = new AuditChainService(auditRepo);
  const gate = new GovernanceGateService({
    kernel: fakeKernel({ verdict }),
    audit,
    approvals: opts.approvals,
    logger: silentLogger,
  });
  return { gate, auditRepo };
}

describe('GovernanceGateService — decide → risk → audit', () => {
  it('ALLOW passes through and seals a durable audit entry', async () => {
    const { gate, auditRepo } = buildGate(ALLOW);
    const v = await gate.decide('file.write', principal(), ctx());

    expect(v.effect).toBe('allow');
    expect(v.engine).toBe('ts');
    expect(v.auditHash).toMatch(/^[0-9a-f]{64}$/);
    expect((auditRepo as InMemoryAuditRepository).rows).toHaveLength(1);
  });

  it('DENY is returned as a verdict, never thrown', async () => {
    const { gate } = buildGate(DENY);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('deny');
    expect(v.tier).toBe('high');
  });

  it('NEEDS_APPROVAL surfaces without silently flipping the effect', async () => {
    const { gate } = buildGate(NEEDS);
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));
    expect(v.effect).toBe('needs_approval');
  });

  it('CLEARS a needs_approval verdict when a real approved record exists for the task+action', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    const { gate, auditRepo } = buildGate(NEEDS, { approvals });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));

    expect(v.effect).toBe('allow');
    expect(v.approvalId).toBe(created.id);
    expect(v.reason).toContain(`cleared by approval ${created.id}`);
    // The clearance is sealed into the durable audit chain as evidence.
    const rows = (auditRepo as InMemoryAuditRepository).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.effect).toBe('allow');
    expect(rows[0]?.payload.clearedByApprovalId).toBe(created.id);
  });

  it('does NOT clear when no approval record exists (needs_approval unchanged)', async () => {
    const approvals = new InMemoryApprovalRepository();
    const { gate } = buildGate(NEEDS, { approvals });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));
    expect(v.effect).toBe('needs_approval');
    expect(v.approvalId).toBeUndefined();
  });

  it('does NOT clear on a pending (undecided) approval record', async () => {
    const approvals = new InMemoryApprovalRepository();
    await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });

    const { gate } = buildGate(NEEDS, { approvals });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));
    expect(v.effect).toBe('needs_approval');
  });

  it('does NOT clear on an approved record for a DIFFERENT action', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'branch.push', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    const { gate } = buildGate(NEEDS, { approvals });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));
    expect(v.effect).toBe('needs_approval');
  });

  it('does NOT clear without a taskId to correlate the approval to', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    const { gate } = buildGate(NEEDS, { approvals });
    const v = await gate.decide('pr.merge', principal(), ctx()); // no taskId
    expect(v.effect).toBe('needs_approval');
  });

  it('FAIL-CLOSED: an approval-cleared allow that cannot be sealed downgrades to a synthetic deny', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    const { gate } = buildGate(NEEDS, { approvals, failAudit: true });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));

    expect(v.effect).toBe('deny'); // never an un-recorded allow
    expect(v.engine).toBe('synthetic');
    expect(v.degraded).toBe(true);
  });

  it('FAIL-CLOSED: an ALLOW that cannot be sealed is downgraded to a synthetic deny', async () => {
    const { gate } = buildGate(ALLOW, { failAudit: true });
    const v = await gate.decide('file.write', principal(), ctx());

    expect(v.effect).toBe('deny'); // never an un-recorded allow
    expect(v.engine).toBe('synthetic');
    expect(v.degraded).toBe(true);
    expect(v.reason).toMatch(/un-recorded|unavailable/i);
  });

  it('a blocking DENY passes through even when the audit seal fails (already blocks)', async () => {
    const { gate } = buildGate(DENY, { failAudit: true });
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('deny');
    expect(v.engine).toBe('ts'); // not downgraded — it already denies
    expect(v.auditHash).toBeUndefined();
  });

  it('a synthetic-deny verdict from a faulted kernel is never turned into an allow', async () => {
    const { gate } = buildGate(SYNTHETIC);
    const v = await gate.decide('file.write', principal(), ctx());
    expect(v.effect).toBe('deny');
    expect(v.engine).toBe('synthetic');
    expect(v.degraded).toBe(true);
  });

  it('recordAudit + verifyAudit delegate to the durable chain', async () => {
    const { gate, auditRepo } = buildGate(ALLOW);
    const rec = await gate.recordAudit({
      actorId: 'u1',
      action: 'secret.set',
      resource: 'secret:x',
      effect: 'allow',
      riskTier: 'high',
      degraded: false,
      payload: {},
    });
    expect(rec.entryHash).toMatch(/^[0-9a-f]{64}$/);
    expect((auditRepo as InMemoryAuditRepository).rows).toHaveLength(1);

    const verified = await gate.verifyAudit();
    expect(verified.ok).toBe(true);
  });

  it('enforceTool delegates to the kernel', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ tool: { outcome: 'denied', reason: 'blocked tool', degraded: false, engine: 'ts' } }),
      audit: new AuditChainService(new InMemoryAuditRepository()),
      logger: silentLogger,
    });
    const result = await gate.enforceTool('rm', 'rm -rf /', principal());
    expect(result.outcome).toBe('denied');
  });
});
