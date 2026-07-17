/**
 * Approval clearance through the conductor write seam — with the REAL
 * `GovernanceGateService` (not the fixture fake gate), a `needs_approval`
 * kernel verdict blocks the write; recording a human `approved` record for the
 * same (taskId, action) then CLEARS the gate on retry, and the write proceeds.
 *
 * This is the product path the cockpit's inline approvals drive: blocked →
 * approve → retry → performed, with the clearance sealed as audit evidence.
 */
import { describe, it, expect } from 'vitest';
import { GovernanceGateService } from '../governance/services/governance-gate.service.js';
import { AuditChainService } from '../governance/services/audit-chain.service.js';
import {
  InMemoryApprovalRepository,
  InMemoryAuditRepository,
  fakeKernel,
} from '../governance/__tests__/_fakes.js';
import type { GovernanceKernelPort } from '../governance/ports/kernel.port.js';
import type { KernelRequest, KernelVerdict } from '../governance/types.js';
import { createConductorModule, type ConductorModule } from './index.js';
import {
  FakeSubstrate,
  makeConfig,
  makeCreateInput,
  makeExecutor,
  makeLogger,
  makeMiddleware,
  makePrincipal,
} from './__fixtures__/harness.js';

const ALLOW: KernelVerdict = { effect: 'allow', tier: 'low', reason: 'ok', degraded: false, engine: 'ts' };
const NEEDS: KernelVerdict = {
  effect: 'needs_approval',
  tier: 'high',
  reason: 'delivery is approval-gated',
  degraded: false,
  engine: 'ts',
};

/** A kernel that gates only the listed actions with needs_approval (allow otherwise). */
function gatedKernel(gatedActions: readonly string[]): GovernanceKernelPort {
  const base = fakeKernel({ verdict: ALLOW });
  return {
    ...base,
    async decide(req: KernelRequest): Promise<KernelVerdict> {
      return gatedActions.includes(req.action) ? NEEDS : ALLOW;
    },
  };
}

/** Compose the conductor over the REAL gate service + in-memory approval store. */
function composeWithRealGate(gatedActions: readonly string[]): {
  module: ConductorModule;
  approvals: InMemoryApprovalRepository;
  auditRepo: InMemoryAuditRepository;
} {
  const approvals = new InMemoryApprovalRepository();
  const auditRepo = new InMemoryAuditRepository();
  const gate = new GovernanceGateService({
    kernel: gatedKernel(gatedActions),
    audit: new AuditChainService(auditRepo),
    approvals,
    logger: makeLogger(),
  });
  const module = createConductorModule({
    config: makeConfig(),
    logger: makeLogger(),
    executor: makeExecutor(),
    middleware: makeMiddleware(),
    gate,
    substrates: [new FakeSubstrate()],
  });
  return { module, approvals, auditRepo };
}

/** Record + approve a human decision for (taskId, action). */
async function approve(
  approvals: InMemoryApprovalRepository,
  taskId: string,
  action: string,
): Promise<string> {
  const record = await approvals.create({
    taskId,
    action,
    riskTier: 'high',
    requestedBy: 'user_test',
  });
  const decided = await approvals.decide(record.id, { decision: 'approved', decidedBy: 'admin' });
  expect(decided?.status).toBe('approved');
  return record.id;
}

describe('conductor approval clearance (real GovernanceGateService)', () => {
  it('workspace.create: blocked → approval recorded → retried create PROCEEDS', async () => {
    const { module, approvals, auditRepo } = composeWithRealGate(['workspace.create']);
    const principal = makePrincipal();

    // 1. Blocked: needs_approval, no workspace created.
    const blocked = await module.createWorkspace(makeCreateInput(), principal);
    expect(blocked.ok).toBe(false);
    expect(blocked.verdict.effect).toBe('needs_approval');
    expect(await module.listWorkspaces()).toHaveLength(0);

    // 2. A human approves (taskId 'task_1' comes from makeCreateInput).
    const approvalId = await approve(approvals, 'task_1', 'workspace.create');

    // 3. Retried: the gate clears on the approved record and the write happens.
    const retried = await module.createWorkspace(makeCreateInput(), principal);
    expect(retried.ok).toBe(true);
    expect(retried.verdict.effect).toBe('allow');
    expect(retried.verdict.approvalId).toBe(approvalId);
    expect(retried.verdict.reason).toContain(`cleared by approval ${approvalId}`);
    expect(await module.listWorkspaces()).toHaveLength(1);

    // 4. The clearance is durable audit evidence.
    const cleared = auditRepo.rows.find((r) => r.payload.clearedByApprovalId === approvalId);
    expect(cleared).toBeDefined();
    expect(cleared?.effect).toBe('allow');
    expect(cleared?.action).toBe('workspace.create');
  });

  it('workspace.merge: blocked → approval recorded → retried merge passes the gate', async () => {
    const { module, approvals } = composeWithRealGate(['workspace.merge']);
    const principal = makePrincipal();

    // Launch a workspace (create is not gated in this composition).
    const created = await module.createWorkspace(makeCreateInput(), principal);
    expect(created.ok).toBe(true);
    const workspaceId = created.value!.workspaceId;

    // 1. Blocked: the merge never reaches execution.
    const blocked = await module.mergeWorkspace(workspaceId, {}, principal);
    expect(blocked.ok).toBe(false);
    expect(blocked.verdict.effect).toBe('needs_approval');
    expect(blocked.reason).toBe(blocked.verdict.reason); // governance blocker, verbatim

    // 2. A human approves the merge for the workspace's task.
    const approvalId = await approve(approvals, 'task_1', 'workspace.merge');

    // 3. Retried: the gate CLEARS (allow + approvalId) and the merge proceeds
    //    into execution. The fake worktree is not a real git checkout, so any
    //    remaining failure is execution-level — never the governance blocker.
    const retried = await module.mergeWorkspace(workspaceId, {}, principal);
    expect(retried.verdict.effect).toBe('allow');
    expect(retried.verdict.approvalId).toBe(approvalId);
    expect(retried.verdict.reason).toContain(`cleared by approval ${approvalId}`);
    if (!retried.ok) {
      expect(retried.reason).not.toBe(blocked.reason);
      expect(retried.reason).not.toMatch(/needs_approval/i);
    }
  });

  it('an approval for a DIFFERENT action does not clear the gate', async () => {
    const { module, approvals } = composeWithRealGate(['workspace.create']);
    await approve(approvals, 'task_1', 'workspace.merge'); // wrong action

    const result = await module.createWorkspace(makeCreateInput(), makePrincipal());
    expect(result.ok).toBe(false);
    expect(result.verdict.effect).toBe('needs_approval');
    expect(await module.listWorkspaces()).toHaveLength(0);
  });
});
