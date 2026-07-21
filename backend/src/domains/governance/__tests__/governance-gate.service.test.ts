import { describe, it, expect } from 'vitest';
import { GovernanceGateService } from '../services/governance-gate.service.js';
import { AuditChainService } from '../services/audit-chain.service.js';
import type { Principal } from '../../identity/types.js';
import type { GateDecisionContext, KernelVerdict } from '../types.js';
import type {
  ConsensusRecommendation,
  ConsensusReview,
  ConsensusReviewPort,
  ConsensusReviewRequest,
} from '../ports/consensus.port.js';
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

// --- high-risk adversarial consensus review (pal fusion) -----------------------

describe('GovernanceGateService — high-risk consensus review (pal)', () => {
  const ALLOW_HIGH: KernelVerdict = { effect: 'allow', tier: 'high', reason: 'kernel allowed', degraded: false, engine: 'ts' };
  const ALLOW_CRITICAL: KernelVerdict = { effect: 'allow', tier: 'critical', reason: 'kernel allowed', degraded: false, engine: 'ts' };
  const ALLOW_MEDIUM: KernelVerdict = { effect: 'allow', tier: 'medium', reason: 'kernel allowed', degraded: false, engine: 'ts' };
  const NEEDS_HIGH: KernelVerdict = { effect: 'needs_approval', tier: 'high', reason: 'gated', degraded: false, engine: 'ts' };

  function review(recommendation: ConsensusRecommendation, overrides: Partial<ConsensusReview> = {}): ConsensusReview {
    return { recommendation, reason: 'consensus reason', models: ['m1', 'm2'], degraded: false, engine: 'pal-mcp', ...overrides };
  }

  /** A consensus port that records every call; `answer` is a review or an Error to throw. */
  function stubConsensus(answer: ConsensusReview | Error, available = true) {
    const calls: ConsensusReviewRequest[] = [];
    const port: ConsensusReviewPort = {
      available,
      async review(req: ConsensusReviewRequest): Promise<ConsensusReview> {
        calls.push(req);
        if (answer instanceof Error) throw answer;
        return answer;
      },
    };
    return { port, calls };
  }

  function buildGateWithConsensus(
    verdict: KernelVerdict,
    consensus?: ConsensusReviewPort,
    approvals?: InMemoryApprovalRepository,
  ) {
    const auditRepo = new InMemoryAuditRepository();
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict }),
      audit: new AuditChainService(auditRepo),
      approvals,
      consensus,
      logger: silentLogger,
    });
    return { gate, auditRepo };
  }

  it('BLOCK downgrades a high-risk allow to needs_approval and seals it into the chain', async () => {
    const { port, calls } = stubConsensus(review('block', { reason: 'credential exfil risk' }));
    const { gate, auditRepo } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx({ taskId: 't1' }));

    expect(v.effect).toBe('needs_approval');
    expect(v.reason).toContain('consensus block');
    expect(v.reason).toContain('credential exfil risk');
    expect(calls).toHaveLength(1);
    // The downgrade is sealed as a needs_approval audit row (evidence).
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]?.effect).toBe('needs_approval');
  });

  it('BLOCK downgrades a CRITICAL allow too (tier >= high)', async () => {
    const { port } = stubConsensus(review('block'));
    const { gate } = buildGateWithConsensus(ALLOW_CRITICAL, port);
    const v = await gate.decide('secret.rotate', principal(), ctx());
    expect(v.effect).toBe('needs_approval');
  });

  it('ABSTAIN leaves the kernel allow standing', async () => {
    const { port, calls } = stubConsensus(review('abstain', { degraded: true, engine: 'synthetic', models: [] }));
    const { gate, auditRepo } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
    expect(calls).toHaveLength(1);
    expect(auditRepo.rows[0]?.effect).toBe('allow');
  });

  it('ALLOW recommendation leaves the kernel allow standing', async () => {
    const { port } = stubConsensus(review('allow'));
    const { gate } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
  });

  it('a timeout/unavailable-shaped abstain keeps the allow (never hangs open)', async () => {
    // The facet abstains on timeout; model that shape and assert the allow stands.
    const { port } = stubConsensus(review('abstain', { degraded: true, engine: 'synthetic', models: [], reason: 'pal consensus timed out' }));
    const { gate } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
  });

  it('a THROWING consensus port leaves the kernel allow standing (never blocks on its own fault)', async () => {
    const { port } = stubConsensus(new Error('seam boom'));
    const { gate } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
  });

  it('an UNAVAILABLE consensus port is not consulted (allow stands, no added latency)', async () => {
    const { port, calls } = stubConsensus(review('block'), false);
    const { gate } = buildGateWithConsensus(ALLOW_HIGH, port);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
    expect(calls).toHaveLength(0);
  });

  it('a LOW/MEDIUM-risk allow is NOT consulted (scope gate)', async () => {
    const { port, calls } = stubConsensus(review('block'));
    const { gate } = buildGateWithConsensus(ALLOW_MEDIUM, port);
    const v = await gate.decide('file.write', principal(), ctx());
    expect(v.effect).toBe('allow');
    expect(calls).toHaveLength(0);
  });

  it('an approval-CLEARED high-risk allow SKIPS consensus (human already decided)', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    const { port, calls } = stubConsensus(review('block'));
    const { gate } = buildGateWithConsensus(NEEDS_HIGH, port, approvals);
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));

    expect(v.effect).toBe('allow');
    expect(v.approvalId).toBe(created.id);
    expect(calls).toHaveLength(0);
  });

  it('with NO consensus port wired, a high-risk allow passes through unchanged', async () => {
    const { gate } = buildGateWithConsensus(ALLOW_HIGH);
    const v = await gate.decide('branch.push', principal(), ctx());
    expect(v.effect).toBe('allow');
  });
});

// --- per-tool teeth: enforceTool seals + fails closed --------------------------

describe('GovernanceGateService.enforceTool — the per-tool teeth', () => {
  it('DENIES a forbidden tool and seals the deny into the durable audit chain', async () => {
    const auditRepo = new InMemoryAuditRepository();
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ tool: { outcome: 'denied', reason: 'forbidden path /etc/shadow', degraded: false, engine: 'ts' } }),
      audit: new AuditChainService(auditRepo),
      logger: silentLogger,
    });

    const result = await gate.enforceTool('read_file', 'AKIA-super-secret-value-xyz', principal(), { target: { path: '/etc/shadow' }, taskId: 't1' });
    expect(result.outcome).toBe('denied');

    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]?.effect).toBe('deny');
    expect(auditRepo.rows[0]?.resource).toBe('read_file');
    // Secret-free: the raw input value is never persisted (only its length).
    expect(JSON.stringify(auditRepo.rows[0]?.payload)).not.toContain('AKIA-super-secret-value-xyz');
  });

  it('seals an ALLOWED tool call as an allow audit row', async () => {
    const auditRepo = new InMemoryAuditRepository();
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ tool: { outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' } }),
      audit: new AuditChainService(auditRepo),
      logger: silentLogger,
    });
    const result = await gate.enforceTool('grep', 'pattern', principal());
    expect(result.outcome).toBe('allowed');
    expect(auditRepo.rows).toHaveLength(1);
    expect(auditRepo.rows[0]?.effect).toBe('allow');
  });

  it('FAIL-CLOSED: an allowed tool that cannot be sealed is downgraded to a synthetic deny', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ tool: { outcome: 'allowed', reason: 'ok', degraded: false, engine: 'ts' } }),
      audit: new AuditChainService(new FailingAuditRepository()),
      logger: silentLogger,
    });
    const result = await gate.enforceTool('grep', 'pattern', principal());
    expect(result.outcome).toBe('denied');
    expect(result.engine).toBe('synthetic');
    expect(result.reason).toMatch(/un-recorded|unavailable/i);
  });
});

// --- durable-repo clearance (sole store) + policy hot-swap --------------------

describe('GovernanceGateService — durable ApprovalRepository is the SOLE clearance store', () => {
  it('RETIRE-REGRESSION: clears a needs_approval via the durable repo with NO kernel store wired', async () => {
    const approvals = new InMemoryApprovalRepository();
    const created = await approvals.create({ action: 'pr.merge', riskTier: 'high', requestedBy: 'u1', taskId: 't1' });
    await approvals.decide(created.id, { decision: 'approved', decidedBy: 'admin' });

    // No `approvalStore` param exists anymore — the durable repo is the only path.
    const auditRepo = new InMemoryAuditRepository();
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: NEEDS }),
      audit: new AuditChainService(auditRepo),
      approvals,
      logger: silentLogger,
    });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));

    expect(v.effect).toBe('allow');
    expect(v.approvalId).toBe(created.id);
    expect(auditRepo.rows[0]?.payload.clearedByApprovalId).toBe(created.id);
  });

  it('leaves needs_approval blocking when NO approval repo is wired (fail-closed)', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: NEEDS }),
      audit: new AuditChainService(new InMemoryAuditRepository()),
      logger: silentLogger,
    });
    const v = await gate.decide('pr.merge', principal(), ctx({ taskId: 't1' }));
    expect(v.effect).toBe('needs_approval');
  });
});

describe('GovernanceGateService.reloadPolicies — delegates to the kernel (policy hot-swap)', () => {
  it('returns the kernel rung result (napi swap succeeds)', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: ALLOW, reload: { reloaded: true } }),
      audit: new AuditChainService(new InMemoryAuditRepository()),
      logger: silentLogger,
    });
    expect((await gate.reloadPolicies('{"forbiddenPathGlobs":["**/.env"]}')).reloaded).toBe(true);
  });

  it('DEGRADE-TRUTHFUL: a static (ts) rung reports reloaded:false, never fakes a swap', async () => {
    const gate = new GovernanceGateService({
      kernel: fakeKernel({ verdict: ALLOW }), // default reload → { reloaded:false }
      audit: new AuditChainService(new InMemoryAuditRepository()),
      logger: silentLogger,
    });
    const r = await gate.reloadPolicies('{}');
    expect(r.reloaded).toBe(false);
    expect(r.reason).toMatch(/static/i);
  });
});
