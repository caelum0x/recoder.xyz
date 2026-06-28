import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RiskTierApprovalPolicy } from '../../src/approval/risk-tier-policy';
import { AutoApprover } from '../../src/approval/auto-approver';
import { ApprovalGateway } from '../../src/approval/approval-gateway';

describe('RiskTierApprovalPolicy', () => {
  const policy = new RiskTierApprovalPolicy();

  it('low and medium tiers do not require approval', () => {
    assert.equal(policy.requiresApproval('low'), false);
    assert.equal(policy.requiresApproval('medium'), false);
  });

  it('high and critical tiers require approval', () => {
    assert.equal(policy.requiresApproval('high'), true);
    assert.equal(policy.requiresApproval('critical'), true);
  });

  it('critical has a shorter timeout than high', () => {
    assert.ok(policy.timeoutMs('critical') < policy.timeoutMs('high'));
  });

  it('the approval floor is high', () => {
    assert.equal(policy.approvalFloor(), 'high');
    assert.equal(policy.isAtOrAboveFloor('high'), true);
    assert.equal(policy.isAtOrAboveFloor('medium'), false);
  });
});

describe('AutoApprover tier ceiling', () => {
  it('disabled by default -> never auto-approves', () => {
    const a = new AutoApprover();
    assert.equal(a.canAutoApprove('low', true), false);
  });

  it('enabled auto-approves at/below ceiling only when autonomous', () => {
    const a = new AutoApprover({ enabled: true, ceiling: 'medium' });
    assert.equal(a.canAutoApprove('low', true), true);
    assert.equal(a.canAutoApprove('medium', true), true);
    assert.equal(a.canAutoApprove('high', true), false);
    // not autonomous -> no auto-approval
    assert.equal(a.canAutoApprove('low', false), false);
  });

  it('NEVER auto-approves critical, even if config asks for a critical ceiling', () => {
    const a = new AutoApprover({ enabled: true, ceiling: 'critical' });
    assert.equal(a.canAutoApprove('critical', true), false);
    // ceiling is hard-clamped down from critical to high
    assert.equal(a.effectiveCeiling(), 'high');
  });
});

describe('ApprovalGateway', () => {
  it('resolves a pending approval with a human decision', async () => {
    const gw = new ApprovalGateway();
    const { approval, awaited } = gw.request({
      taskId: 'task-1',
      reason: 'risky op',
      requestedBy: 'agent-1',
      tier: 'high',
      timeoutMs: 0,
    });
    assert.equal(gw.isPending(approval.approvalId), true);
    gw.resolve(approval.approvalId, 'approved', 'human-1', 'looks fine');
    const result = await awaited;
    assert.equal(result.decision, 'approved');
    assert.equal(result.timedOut, false);
    assert.equal(gw.isPending(approval.approvalId), false);
  });

  it('fails closed (rejected) on timeout', async () => {
    const gw = new ApprovalGateway();
    const { awaited } = gw.request({
      taskId: 'task-1',
      reason: 'risky op',
      requestedBy: 'agent-1',
      tier: 'critical',
      timeoutMs: 10,
    });
    const result = await awaited;
    assert.equal(result.decision, 'rejected');
    assert.equal(result.timedOut, true);
  });

  it('throws when resolving an unknown approval', () => {
    const gw = new ApprovalGateway();
    assert.throws(() => gw.resolve('nope', 'approved', 'h'), /No pending approval/);
  });
});
