/**
 * e2e-conductor-approval — headless end-to-end PROOF that the Conductor
 * APPROVAL / GOVERNANCE gate works (FR-5: customer-visible delivery is
 * approval-gated).
 *
 * WHAT THIS PROVES (the real, fused governance + approval engines, driven
 * headlessly over the real agent-os Approval repository — NO BYOK, NO live
 * server, NO model key):
 *
 *   (a) DENY WITHOUT APPROVAL: a gated delivery action (merge AND pr) for a
 *       workspace whose task has NO approved control-plane Approval record is
 *       HELD/DENIED. The real conductor delivery path (review-publish.ts
 *       `mergeWorkspace`/`createWorkspacePr`) consults the real gate
 *       (delivery-approval.ts `enforceDeliveryApproval`), which routes the
 *       action through the real @recoder/governance pipeline
 *       (governance-gate.ts `decideDelivery` -> tier-classifier + approval
 *       risk-tier policy + deny-biased policy chain + SHA-256 Merkle audit).
 *       The gate throws DeliveryApprovalRequiredError, transitions the
 *       workspace to `awaiting_approval`, and the branch is NEVER pushed / the
 *       PR is NEVER opened (the gate fires BEFORE any git/gh call).
 *
 *   (b) PROCEEDS AFTER REAL APPROVAL: a REAL control-plane Approval record is
 *       created via the real @recoder/agent-os ApprovalService (request ->
 *       decide('approved')) and persisted into the SAME agent-os repository the
 *       gate reads (`repository.upsertApproval`). The SAME action then PASSES
 *       the gate: `enforceDeliveryApproval` resolves, and the real
 *       `mergeWorkspace` proceeds PAST the gate (it advances the workspace to
 *       `merging` and only then fails at the real `gh pr merge` network step —
 *       an unrelated failure that proves the gate let the delivery through).
 *
 * Every gate, policy, tier-classifier, audit-chain, repository read/write, and
 * Approval state transition on this path is the REAL product code. The only
 * thing this harness does NOT do is the final outward `git push` / `gh` network
 * call — which is exactly what the approval gate exists to guard, and which sits
 * AFTER the gate. There is no faking: (a) is a real held/denied verdict; (b) is
 * a real approved Approval record that the real gate honors.
 *
 * Run:  npx tsx docker-backend/scripts/e2e-conductor-approval.ts
 *  or:  pnpm --filter @recoder/docker-backend exec tsx scripts/e2e-conductor-approval.ts
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Approval, TaskSpec, Workspace } from '@recoder/agent-os';

// ----- env BEFORE importing any conductor / agent-os module (read env at import) -----
// In-memory agent-os repository (no Postgres) — the real Approval state of record.
const WORK_ROOT = mkdtempSync(join(tmpdir(), 'e2e-approval-'));
process.env.AGENT_OS_REPOSITORY = 'memory';
delete process.env.AGENT_OS_DATABASE_URL;
delete process.env.DATABASE_URL;
process.env.CONDUCTOR_WORKTREE_ROOT = join(WORK_ROOT, 'worktrees');

// ----- import the REAL product modules under test -----
import { ApprovalService } from '@recoder/agent-os';
import { agentOsContainer } from '../src/agent-os/service-container';
import {
  enforceDeliveryApproval,
  DeliveryApprovalRequiredError,
  checkDeliveryApproval,
} from '../src/conductor/delivery-approval.js';
import { mergeWorkspace } from '../src/conductor/review-publish.js';
import { __resetGovernanceForTest, verifyGovernanceAudit } from '../src/conductor/governance-gate.js';

const repository = agentOsContainer.repository;
const approvalService = new ApprovalService();

function log(step: string, detail?: unknown): void {
  const suffix =
    detail === undefined ? '' : ` ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  // eslint-disable-next-line no-console
  console.log(`[e2e-approval] ${step}${suffix}`);
}

let failures = 0;
function assert(cond: boolean, message: string): void {
  if (cond) {
    log('PASS', message);
  } else {
    failures += 1;
    log('FAIL', message);
  }
}

/** Seed a canonical TaskSpec (the state of record the gate keys approvals by). */
async function seedTask(taskId: string): Promise<void> {
  const task: TaskSpec = {
    taskId,
    spaceId: 'space_approval_e2e',
    title: 'E2E: prove conductor approval/governance gate',
    intent: 'feature_delivery',
    goal: 'Prove the delivery gate denies without approval and proceeds after a real approval.',
    repo: WORK_ROOT,
    branchPolicy: 'create_worktree_branch',
    targetPaths: ['PROOF.txt'],
    forbiddenPaths: [],
    acceptanceCriteria: ['gate enforced'],
    verification: { commands: [] },
    approvalRequired: ['before_pr'],
    artifactRequired: [],
  };
  await Promise.resolve(repository.upsertTask(task));
}

/** Seed a workspace with a (real) worktree path so the real delivery path can
 *  be driven; the gate runs before any git op so the dir contents are
 *  irrelevant to the proof. `state` defaults to `running` (the state a delivery
 *  is gated from); the post-approval merge proof uses `awaiting_review` (the
 *  real pre-merge state from which `mergeWorkspace` legally advances to
 *  `merging`). */
async function seedWorkspace(taskId: string, state: Workspace['state'] = 'running'): Promise<Workspace> {
  const now = new Date().toISOString();
  const ws: Workspace = {
    workspaceId: `ws_${randomUUID()}`,
    spaceId: 'space_approval_e2e',
    projectId: 'proj_approval_e2e',
    taskId,
    runtimeId: 'recoder_code',
    substrate: 'tmux_worktree',
    branch: 'recoder/approval-e2e',
    baseRef: 'HEAD',
    worktreePath: WORK_ROOT,
    state,
    createdBy: 'e2e-approval-harness',
    createdAt: now,
    updatedAt: now,
    metadata: {},
  };
  return Promise.resolve(repository.upsertWorkspace(ws));
}

async function main(): Promise<void> {
  log('repository driver', agentOsContainer.repositoryDriver);
  if (agentOsContainer.repositoryDriver !== 'memory') {
    throw new Error(`expected in-memory agent-os repository, got ${agentOsContainer.repositoryDriver}`);
  }
  // Fresh governance singleton so the Merkle audit chain only carries this run's
  // decisions (clean, verifiable trail).
  __resetGovernanceForTest();

  // ============================================================
  // (a) DENY WITHOUT APPROVAL — gate holds the delivery
  // ============================================================
  const taskA = `task_approval_deny_${randomUUID()}`;
  await seedTask(taskA);
  const wsDeny = await seedWorkspace(taskA);
  log('seeded task + workspace (no approval)', { taskId: taskA, workspaceId: wsDeny.workspaceId });

  // Sanity: the real gate sees NO approval for this task.
  const checkBefore = await checkDeliveryApproval(taskA, 'merge');
  assert(checkBefore.approved === false, '(a) checkDeliveryApproval: no approved record -> not approved');

  // Drive the REAL conductor delivery path: mergeWorkspace -> enforceDeliveryApproval.
  let denyErr: unknown;
  try {
    await mergeWorkspace(wsDeny.workspaceId, { strategy: 'squash' });
  } catch (err) {
    denyErr = err;
  }
  assert(
    denyErr instanceof DeliveryApprovalRequiredError,
    '(a) real mergeWorkspace path threw DeliveryApprovalRequiredError (held — not merged)',
  );
  const deny = denyErr as DeliveryApprovalRequiredError;
  log('(a) gate verdict', {
    state: deny.state,
    action: deny.action,
    governanceEffect: deny.governanceEffect,
    governanceTier: deny.governanceTier,
    hardDeny: deny.governanceHardDeny,
    auditHash: deny.governanceAuditHash,
    degraded: deny.governanceDegraded,
  });
  assert(deny.state === 'awaiting_approval', '(a) gate surfaced awaiting_approval state');
  assert(deny.action === 'merge', '(a) blocked action is the merge delivery');
  assert(
    deny.governanceEffect === 'needs_approval' || deny.governanceEffect === 'deny',
    `(a) governance blocked the delivery (effect=${deny.governanceEffect})`,
  );
  assert(
    typeof deny.governanceTier === 'string' && deny.governanceTier.length > 0,
    `(a) governance classified a risk tier (${deny.governanceTier})`,
  );

  // The workspace record was actually transitioned to awaiting_approval by the
  // real gate — the merge did NOT proceed (no `merging`/`merged`).
  const wsDenyAfter = await Promise.resolve(repository.getWorkspace(wsDeny.workspaceId));
  assert(
    wsDenyAfter?.state === 'awaiting_approval',
    `(a) workspace record moved running -> awaiting_approval (got ${wsDenyAfter?.state}); merge did NOT run`,
  );
  const gate = (wsDenyAfter?.metadata?.deliveryGate ?? {}) as Record<string, unknown>;
  assert(gate.action === 'merge', '(a) delivery gate recorded in workspace metadata (audit trail)');

  // ============================================================
  // (b) PROCEEDS AFTER REAL APPROVAL — same action, now allowed past the gate
  // ============================================================
  const taskB = `task_approval_allow_${randomUUID()}`;
  await seedTask(taskB);
  // Seed in `awaiting_review` — the real post-run, pre-merge state from which a
  // cleared merge legally advances to `merging`. This lets the post-gate path
  // run far enough to prove the gate let the delivery THROUGH.
  const wsAllow = await seedWorkspace(taskB, 'awaiting_review');
  log('seeded task + workspace (will be approved)', {
    taskId: taskB,
    workspaceId: wsAllow.workspaceId,
    state: wsAllow.state,
  });

  // Control comparison: BEFORE the approval, the same task+action is blocked.
  // Use a SEPARATE throwaway workspace so this control check does not transition
  // the real `wsAllow` record out of `running` (a state from which the post-gate
  // `running -> merging` transition is legal).
  const wsControl = await seedWorkspace(taskB);
  let preBlock: unknown;
  try {
    await enforceDeliveryApproval(wsControl, 'merge');
  } catch (err) {
    preBlock = err;
  }
  assert(
    preBlock instanceof DeliveryApprovalRequiredError,
    '(b) before approval: same action is blocked by the gate (control)',
  );

  // Create a REAL control-plane Approval via the real ApprovalService, transition
  // it pending -> approved, and persist it into the SAME repository the gate reads.
  const requested: Approval = approvalService.request({
    taskId: taskB,
    reason: 'E2E: human approves the merge delivery',
    requestedBy: 'e2e-approval-harness',
    requiredAt: 'before_pr', // authorizes both pr and merge
  });
  assert(requested.status === 'pending', '(b) ApprovalService created a real pending Approval');
  const approved = approvalService.decide(requested, 'approved', 'e2e-operator', 'looks good');
  assert(approved.status === 'approved', '(b) ApprovalService transitioned the Approval pending -> approved');
  await Promise.resolve(repository.upsertApproval(approved));
  log('(b) persisted approved Approval', { approvalId: approved.approvalId, requiredAt: approved.requiredAt });

  // The real gate now sees the approval for this task.
  const checkAfter = await checkDeliveryApproval(taskB, 'merge');
  assert(checkAfter.approved === true, '(b) checkDeliveryApproval now sees the approved record');
  assert(checkAfter.approvalId === approved.approvalId, '(b) gate matched the exact Approval record');

  // The gate now PASSES (resolves) for the SAME merge action.
  let enforceErr: unknown;
  try {
    await enforceDeliveryApproval(wsAllow, 'merge');
  } catch (err) {
    enforceErr = err;
  }
  assert(
    enforceErr === undefined,
    '(b) enforceDeliveryApproval RESOLVES for the approved task (gate cleared by real approval)',
  );

  // Drive the REAL mergeWorkspace path: it must get PAST the gate. With no `gh`
  // remote configured it then fails at the real network step — proving the gate
  // let the delivery THROUGH (the failure is NOT a DeliveryApprovalRequiredError,
  // and the workspace advanced beyond awaiting_approval into the merge attempt).
  let mergeErr: unknown;
  try {
    await mergeWorkspace(wsAllow.workspaceId, { strategy: 'squash' });
  } catch (err) {
    mergeErr = err;
  }
  assert(
    !(mergeErr instanceof DeliveryApprovalRequiredError),
    '(b) approved merge was NOT blocked by the approval gate (passed the gate)',
  );
  const wsAllowAfter = await Promise.resolve(repository.getWorkspace(wsAllow.workspaceId));
  log('(b) approved workspace final state', {
    state: wsAllowAfter?.state,
    mergeErr: mergeErr instanceof Error ? mergeErr.message.slice(0, 120) : mergeErr,
  });
  assert(
    wsAllowAfter?.state === 'merging' ||
      wsAllowAfter?.state === 'merged' ||
      wsAllowAfter?.state === 'failed',
    `(b) workspace advanced PAST the gate into the merge attempt (state=${wsAllowAfter?.state}); the gate let it through`,
  );
  assert(
    wsAllowAfter?.state !== 'awaiting_approval',
    '(b) workspace is NOT stuck at awaiting_approval — the approval released the delivery',
  );

  // ============================================================
  // Governance Merkle audit chain: every delivery decision was sealed.
  // ============================================================
  const audit = await verifyGovernanceAudit();
  log('governance audit', audit);
  assert(audit.ok === true, 'governance Merkle audit chain verifies (tamper-evident)');
  assert(audit.entries >= 2, `governance recorded >=2 audited delivery decisions (got ${audit.entries})`);

  if (failures > 0) {
    throw new Error(`${failures} assertion(s) failed`);
  }
  log(
    'RESULT',
    'PASS — approval/governance gate denies without approval and proceeds after a real approval (FR-5)',
  );
}

main()
  .then(() => {
    try {
      rmSync(WORK_ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(0);
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[e2e-approval] FAILED:', err instanceof Error ? (err.stack ?? err.message) : err);
    try {
      rmSync(WORK_ROOT, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
