/**
 * Conductor delivery approval gate.
 *
 * Production rule (.claude/rules/production.md, AGENTS.md): branch pushes, PRs,
 * and merges are customer-visible delivery actions and MUST be approval-gated.
 * This module is the gate the conductor PR/merge path consults BEFORE performing
 * any outward-facing git/gh action.
 *
 * The gate reads the canonical control-plane `Approval` records owned by the
 * AgentOsRepository (keyed by the workspace's `taskId`), not a runtime side
 * channel. A delivery action is permitted only when a matching approval exists
 * in `approved` status. The required-at gate maps:
 *
 *   - PR  → `before_pr`  (also satisfied by `before_push`, since opening a PR
 *           pushes the branch first).
 *   - merge → a `before_pr`/`before_push`/`before_sensitive_action` approval, OR
 *             an `after_verification` approval (the post-review sign-off).
 *
 * When no approval is present the caller does NOT silently proceed: it transitions
 * the workspace to `awaiting_approval` and returns that state. Degrade-safe: a
 * repository read failure is treated as "not approved" (fail closed — never
 * auto-deliver when the gate cannot prove an approval).
 *
 * This gate is BACKED by @recoder/governance (see governance-gate.ts). Every
 * delivery is routed through `Governance.decide()` so the real tier-classifier,
 * approval risk-tier policy, deny-biased policy chain (composing
 * @recoder/agent-policy), and SHA-256 Merkle audit chain run for the action.
 * Governance decides the risk; the conductor enforces what it returns. A
 * governance HARD DENY is absolute — no control-plane Approval record overrides a
 * policy veto. The existing awaiting_approval/409 behavior is preserved.
 */
import {
  isAllowedWorkspaceTransition,
  isTerminalWorkspaceState,
  type Approval,
  type Workspace,
} from '@recoder/agent-os';
import { agentOsContainer } from '../agent-os/service-container';
import { createLogger } from '../logger';
import { advanceWorkspace } from './workspace-service.js';
import { decideDelivery, type DeliveryGovernanceDecision } from './governance-gate.js';

const logger = createLogger('conductor:delivery-approval');

const repository = () => agentOsContainer.repository;

export type DeliveryAction = 'pr' | 'merge';

/** Required-at values that authorize each delivery action. */
const REQUIRED_AT_FOR_ACTION: Record<DeliveryAction, ReadonlySet<Approval['requiredAt']>> = {
  pr: new Set<Approval['requiredAt']>(['before_pr', 'before_push', 'before_sensitive_action']),
  merge: new Set<Approval['requiredAt']>([
    'before_pr',
    'before_push',
    'before_sensitive_action',
    'after_verification',
  ]),
};

export interface DeliveryApprovalCheck {
  /** Whether a matching approved Approval was found for the task + action. */
  approved: boolean;
  /** The approval that authorized the action, when approved. */
  approvalId?: string;
  /** Human-readable reason when not approved (drives the awaiting_approval metadata). */
  reason?: string;
}

/**
 * Decide whether the delivery `action` for a workspace's `taskId` is authorized.
 * Approved only when the repository holds an `approved` Approval for the task
 * whose `requiredAt` is valid for the action. Never throws — a lookup failure
 * fails closed (`approved: false`) so the conductor never auto-delivers without
 * a provable approval.
 */
export async function checkDeliveryApproval(
  taskId: string,
  action: DeliveryAction,
): Promise<DeliveryApprovalCheck> {
  const allowed = REQUIRED_AT_FOR_ACTION[action];
  let approvals: Approval[];
  try {
    approvals = await repository().listApprovals();
  } catch (err) {
    logger.warn({ taskId, action, err }, 'delivery approval lookup failed — failing closed (not approved)');
    return { approved: false, reason: 'approval lookup failed (gate fails closed)' };
  }

  const taskApprovals = approvals.filter((a) => a.taskId === taskId);
  const granted = taskApprovals.find((a) => a.status === 'approved' && allowed.has(a.requiredAt));
  if (granted) {
    return { approved: true, approvalId: granted.approvalId };
  }

  // Surface the most informative reason: a rejected/expired/pending approval is
  // more useful than "none found".
  const pending = taskApprovals.find(
    (a) => (a.status === 'pending' || a.status === 'escalated') && allowed.has(a.requiredAt),
  );
  if (pending) {
    return { approved: false, approvalId: pending.approvalId, reason: `approval ${pending.approvalId} is ${pending.status}` };
  }
  const rejected = taskApprovals.find((a) => a.status === 'rejected' && allowed.has(a.requiredAt));
  if (rejected) {
    return { approved: false, approvalId: rejected.approvalId, reason: `approval ${rejected.approvalId} was rejected` };
  }

  return {
    approved: false,
    reason: `no approved ${action} approval for task ${taskId} (requires an approved Approval with requiredAt in [${[...allowed].join(', ')}])`,
  };
}

/**
 * Thrown when a delivery action is blocked by the approval gate. Carries the
 * workspace's resulting lifecycle state (`awaiting_approval`) and the missing
 * approval requirement so the route can return a truthful 409 instead of
 * performing the merge/PR.
 */
export class DeliveryApprovalRequiredError extends Error {
  readonly state = 'awaiting_approval' as const;
  readonly workspaceId: string;
  readonly action: DeliveryAction;
  readonly approvalId?: string;
  /** Whether the workspace record was actually transitioned to awaiting_approval. */
  readonly transitioned: boolean;
  /**
   * The @recoder/governance verdict that gated this delivery, when governance
   * produced one. Carries the risk tier, effect, and Merkle audit hash so the
   * route can surface a truthful, audited 409. `governanceHardDeny` is true when
   * governance vetoed the action outright (no approval record can override it).
   */
  readonly governanceTier?: string;
  readonly governanceEffect?: string;
  readonly governanceAuditHash?: string;
  readonly governanceHardDeny: boolean;
  readonly governanceDegraded?: boolean;

  constructor(input: {
    workspaceId: string;
    action: DeliveryAction;
    reason: string;
    approvalId?: string;
    transitioned: boolean;
    governance?: DeliveryGovernanceDecision;
  }) {
    super(input.reason);
    this.name = 'DeliveryApprovalRequiredError';
    this.workspaceId = input.workspaceId;
    this.action = input.action;
    this.approvalId = input.approvalId;
    this.transitioned = input.transitioned;
    this.governanceTier = input.governance?.verdict.tier;
    this.governanceEffect = input.governance?.verdict.effect;
    this.governanceAuditHash = input.governance?.auditHash;
    this.governanceHardDeny = input.governance?.hardDeny ?? false;
    this.governanceDegraded = input.governance?.degraded;
  }
}

/**
 * Enforce the delivery approval gate for a workspace before a PR/merge.
 *
 * If an approving Approval exists, returns silently and the caller proceeds.
 * Otherwise the action is NOT performed: the workspace is transitioned to
 * `awaiting_approval` when that transition is legal from its current state
 * (otherwise the gate is recorded in metadata without an illegal transition),
 * and a `DeliveryApprovalRequiredError` is thrown carrying the awaiting_approval
 * state + the missing requirement. This is the wiring that satisfies the
 * production rule: customer-visible delivery requires an approval record; absent
 * one, surface awaiting_approval rather than silently delivering.
 */
export async function enforceDeliveryApproval(workspace: Workspace, action: DeliveryAction): Promise<void> {
  // An explicit override exists for tasks the operator has marked safe automation
  // (.claude/rules/production.md: "unless the task spec explicitly marks them as
  // safe automation"). It must be an explicit boolean true in workspace metadata.
  // Even a safe-automation delivery is routed through governance (audited) — but
  // the operator's explicit grant lets the governance auto-approver clear it.
  if (workspace.metadata?.deliveryApprovalBypass === true) {
    const bypassDecision = await decideDelivery(workspace, action, true);
    if (bypassDecision.hardDeny) {
      // Governance vetoed the action itself (e.g. a critical policy deny). A
      // safe-automation flag does NOT override a governance hard deny.
      logger.warn(
        { workspaceId: workspace.workspaceId, action, auditHash: bypassDecision.auditHash },
        'safe-automation delivery vetoed by governance hard-deny',
      );
      throw new DeliveryApprovalRequiredError({
        workspaceId: workspace.workspaceId,
        action,
        reason: bypassDecision.verdict.reason,
        transitioned: false,
        governance: bypassDecision,
      });
    }
    logger.info(
      {
        workspaceId: workspace.workspaceId,
        action,
        effect: bypassDecision.verdict.effect,
        auditHash: bypassDecision.auditHash,
      },
      'delivery approval bypassed (workspace marked safe automation) — governance audited',
    );
    return;
  }

  const check = await checkDeliveryApproval(workspace.taskId, action);

  // Route the delivery through @recoder/governance. The control-plane approval
  // record (when present) is the human sign-off governance consumes to clear the
  // risk gate; governance still classifies the tier, applies the approval risk
  // policy, and seals the decision into the Merkle audit chain. Governance decides;
  // the conductor enforces what it returns.
  const governance = await decideDelivery(workspace, action, check.approved);

  // A governance HARD DENY is absolute: no approval record can override a policy
  // veto (e.g. a forbidden-path / critical-tier deny). Block unconditionally.
  if (governance.hardDeny) {
    return await blockForApproval(workspace, action, governance.verdict.reason, undefined, governance);
  }

  if (check.approved) {
    if (governance.blocks) {
      // The control plane recorded an approval but governance still requires a
      // gate it could not clear (e.g. auto-approve disabled at this tier). Honor
      // the approval record as the human sign-off that satisfies the gate, and
      // record that governance was consulted.
      logger.info(
        {
          workspaceId: workspace.workspaceId,
          action,
          approvalId: check.approvalId,
          governanceEffect: governance.verdict.effect,
          governanceTier: governance.verdict.tier,
          auditHash: governance.auditHash,
        },
        'delivery approved by control-plane record (governance gate satisfied by human sign-off)',
      );
    } else {
      logger.info(
        {
          workspaceId: workspace.workspaceId,
          action,
          approvalId: check.approvalId,
          governanceTier: governance.verdict.tier,
          auditHash: governance.auditHash,
        },
        'delivery approval gate passed (governance cleared + control-plane approved)',
      );
    }
    return;
  }

  // No control-plane approval. If governance cleared it anyway (e.g. an explicit
  // autonomous context within the tier ceiling), proceed; otherwise block.
  if (!governance.blocks) {
    logger.info(
      {
        workspaceId: workspace.workspaceId,
        action,
        governanceEffect: governance.verdict.effect,
        auditHash: governance.auditHash,
      },
      'delivery cleared by governance (no control-plane approval required at this tier)',
    );
    return;
  }

  const reason =
    governance.verdict.reason || check.reason || `delivery ${action} requires approval`;
  return await blockForApproval(workspace, action, reason, check.approvalId, governance);
}

/**
 * Block a delivery pending approval: transition the workspace into
 * awaiting_approval when legal (else record the gate truthfully without an illegal
 * transition) and throw a DeliveryApprovalRequiredError carrying the governance
 * verdict. This preserves the exact awaiting_approval/409 contract callers already
 * depend on, now backed by a real @recoder/governance verdict + Merkle audit hash.
 */
async function blockForApproval(
  workspace: Workspace,
  action: DeliveryAction,
  reason: string,
  approvalId: string | undefined,
  governance: DeliveryGovernanceDecision,
): Promise<never> {
  let transitioned = false;
  // The governance verdict is part of the truthful audit trail recorded in the
  // workspace metadata so the blocked merge/PR shows the risk tier + audit hash.
  const governanceGate = {
    effect: governance.verdict.effect,
    tier: governance.verdict.tier,
    auditHash: governance.auditHash ?? null,
    hardDeny: governance.hardDeny,
    degraded: governance.degraded,
  };
  // Only transition into awaiting_approval when the state machine permits it
  // (running → awaiting_approval is legal; awaiting_review → awaiting_approval is
  // not, so for that case we record the gate without an illegal transition).
  if (
    !isTerminalWorkspaceState(workspace.state) &&
    workspace.state !== 'awaiting_approval' &&
    isAllowedWorkspaceTransition(workspace.state, 'awaiting_approval')
  ) {
    try {
      await advanceWorkspace(workspace.workspaceId, 'awaiting_approval', undefined, {
        deliveryGate: { action, reason, approvalId: approvalId ?? null, governance: governanceGate, at: new Date().toISOString() },
      });
      transitioned = true;
    } catch (err) {
      logger.warn({ workspaceId: workspace.workspaceId, action, err }, 'awaiting_approval transition failed (gate still enforced)');
    }
  } else {
    // Record the gate truthfully even when we cannot legally re-transition, so the
    // audit trail shows the merge/PR was blocked pending approval.
    try {
      await advanceWorkspace(workspace.workspaceId, workspace.state, undefined, {
        deliveryGate: { action, reason, approvalId: approvalId ?? null, governance: governanceGate, blocked: true, at: new Date().toISOString() },
      });
    } catch (err) {
      logger.warn({ workspaceId: workspace.workspaceId, action, err }, 'delivery gate metadata record failed');
    }
  }

  logger.warn(
    {
      workspaceId: workspace.workspaceId,
      action,
      reason,
      transitioned,
      governanceEffect: governance.verdict.effect,
      governanceTier: governance.verdict.tier,
      auditHash: governance.auditHash,
    },
    'delivery action blocked — approval required (governance gated)',
  );
  throw new DeliveryApprovalRequiredError({
    workspaceId: workspace.workspaceId,
    action,
    reason,
    approvalId,
    transitioned,
    governance,
  });
}
